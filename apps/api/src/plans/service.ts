import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { localNow } from '@dialed/schedule';
import type { PlanChange, PlanCheck, PlanDTO, PlanSummary } from '@dialed/contracts';
import type { Db } from '../db/pool';
import type { Config } from '../config';
import { AppError } from '../lib/errors';

import { findByIdempotencyKey } from './idempotency';
import { dailyPlanCount, incrementUsage } from './usage';

type Row = Record<string, unknown>;

/** The provider a new plan will run on; 'fixture' only under AI_MODE=fixture. The runner overwrites it with the one it used. */
export function plannedProvider(
  config: Pick<Config, 'AI_MODE'>,
  providerMode: 'server' | 'byo',
  provider: string | undefined,
): string {
  if (config.AI_MODE === 'fixture') return 'fixture';
  if (providerMode === 'server') return 'anthropic';
  return provider ?? 'anthropic';
}

export class PlanService {
  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly now: () => Date,
  ) {}

  async create(
    userId: string,
    requestText: string,
    providerMode: 'server' | 'byo',
    provider: string | undefined,
    idempotencyKey: string | undefined,
    timeZone: string,
  ): Promise<{ planId: string; existing: boolean }> {
    if (idempotencyKey) {
      const existing = await findByIdempotencyKey(this.db, userId, idempotencyKey);
      if (existing) return { planId: existing, existing: true };
    }

    const now = this.now();
    const today = localNow(now, timeZone).date;

    if (providerMode === 'server') {
      const count = await dailyPlanCount(this.db, userId, today);
      if (count >= this.config.PLAN_DAILY_LIMIT) {
        throw new AppError('daily_limit');
      }
    }

    await this.db.execute(sql`
      update plans set status = 'cancelled'
      where user_id = ${userId} and status = 'drafting'`);

    const {
      rows: [revRow],
    } = await this.db.execute<Row>(sql`
      select revision from revisions where user_id = ${userId}`);
    const baseRevision = revRow ? Number(revRow.revision) : 0;

    const planId = randomUUID();
    const storedProvider = plannedProvider(this.config, providerMode, provider);
    await this.db.execute(sql`insert into plans
      (id, user_id, source, provider, request_text, status, base_revision,
       provider_mode, idempotency_key, version)
      values (${planId}, ${userId}, 'in_app', ${storedProvider},
        ${requestText}, 'drafting', ${baseRevision},
        ${providerMode}, ${idempotencyKey ?? null}, 1)`);

    await this.db.execute(sql`insert into audit_log (user_id, actor, action, target)
      values (${userId}, ${'ai:' + storedProvider}, 'plan_create', ${planId})`);

    return { planId, existing: false };
  }

  async storeResult(
    planId: string,
    userId: string,
    status: 'ready' | 'question' | 'failed',
    changes: PlanChange[],
    checks: PlanCheck[],
    tokensIn: number,
    tokensOut: number,
    opts?: {
      question?: string;
      options?: string[];
      errorCode?: string;
      text?: string;
      /** The caller counts usage itself (timetable reads count as imports, not plan runs). */
      skipUsage?: boolean;
    },
  ): Promise<void> {
    const now = this.now();
    const today = localNow(now, 'UTC').date;

    await this.db.execute(sql`delete from plan_changes where plan_id = ${planId}`);

    for (let i = 0; i < changes.length; i++) {
      const c = changes[i]!;
      const { kind, title, note, ...rest } = c as PlanChange & { note: string };
      await this.db.execute(sql`insert into plan_changes
        (id, plan_id, ord, kind, title, payload_json, note, enabled)
        values (${randomUUID()}, ${planId}, ${i}, ${kind}, ${title},
          ${JSON.stringify(rest)}::jsonb, ${note ?? ''}, true)`);
    }

    const readyAt = status === 'ready' ? sql`now()` : sql`null`;
    await this.db.execute(sql`update plans set
      status = ${status},
      checks_json = ${JSON.stringify(checks)}::jsonb,
      step = step + 1,
      error_code = ${opts?.errorCode ?? null},
      ready_at = ${readyAt},
      version = version + 1
      where id = ${planId}`);

    if (opts?.question) {
      await this.db.execute(sql`insert into plan_messages (id, plan_id, role, body, options_json)
        values (${randomUUID()}, ${planId}, 'question', ${opts.question},
          ${JSON.stringify(opts.options ?? [])}::jsonb)`);
    }

    if (status !== 'failed' && !opts?.skipUsage) {
      await incrementUsage(this.db, userId, today, tokensIn, tokensOut);
    }

    if (status === 'ready') {
      const dates = changes.flatMap((c) => {
        if ('repeat' in c && c.repeat) return [c.repeat.from, c.repeat.until];
        if ('on_date' in c && c.on_date) return [c.on_date];
        return [];
      });
      if (dates.length > 0) {
        const from = dates.sort()[0]!;
        const to = dates.sort().at(-1)!;
        await this.db.execute(sql`update plans set range_from = ${from}, range_to = ${to}
          where id = ${planId}`);
      }
    }
  }

  async get(userId: string, planId: string, _timeZone: string): Promise<PlanDTO> {
    const {
      rows: [plan],
    } = await this.db.execute<Row>(sql`
      select * from plans where id = ${planId}`);
    if (!plan || plan.user_id !== userId) throw new AppError('not_found');

    const { rows: changes } = await this.db.execute<Row>(sql`
      select id, ord, kind, title, payload_json, note, enabled, validation_json
      from plan_changes where plan_id = ${planId} order by ord`);

    const { rows: messages } = await this.db.execute<Row>(sql`
      select id, role, body, options_json, created_at
      from plan_messages where plan_id = ${planId} order by created_at`);

    const checksJson = (plan.checks_json as PlanCheck[]) ?? [];

    return {
      id: String(plan.id),
      source: String(plan.source) as PlanDTO['source'],
      provider: String(plan.provider),
      client_name: plan.client_name ? String(plan.client_name) : null,
      request_text: String(plan.request_text),
      status: String(plan.status) as PlanDTO['status'],
      version: Number(plan.version),
      base_revision: Number(plan.base_revision),
      changes: changes.map((c) => ({
        id: String(c.id),
        ord: Number(c.ord),
        kind: String(c.kind) as PlanChange['kind'],
        title: String(c.title),
        payload: c.payload_json as Record<string, unknown>,
        note: String(c.note),
        enabled: Boolean(c.enabled),
        validation: (c.validation_json as Record<string, unknown>) ?? {},
      })),
      messages: messages.map((m) => ({
        id: String(m.id),
        role: String(m.role) as 'question' | 'answer' | 'reply',
        body: String(m.body),
        options: m.options_json ? (m.options_json as string[]) : undefined,
        created_at: String(m.created_at),
      })),
      checks: checksJson,
      impact: [],
      error_code: plan.error_code ? String(plan.error_code) : null,
      created_at: String(plan.created_at),
      ready_at: plan.ready_at ? String(plan.ready_at) : null,
      decided_at: plan.decided_at ? String(plan.decided_at) : null,
    };
  }

  async list(userId: string, limit = 10): Promise<PlanSummary[]> {
    const { rows } = await this.db.execute<Row>(sql`
      select p.id, p.source, p.client_name, p.request_text, p.status, p.created_at,
        (select count(*)::int from plan_changes pc where pc.plan_id = p.id) as change_count
      from plans p where p.user_id = ${userId}
      order by p.created_at desc limit ${limit}`);
    return rows.map((r) => ({
      id: String(r.id),
      source: String(r.source) as PlanSummary['source'],
      client_name: r.client_name ? String(r.client_name) : null,
      request_text: String(r.request_text),
      status: String(r.status) as PlanSummary['status'],
      created_at: String(r.created_at),
      change_count: Number(r.change_count),
    }));
  }

  async answer(userId: string, planId: string, answer: string): Promise<void> {
    const {
      rows: [plan],
    } = await this.db.execute<Row>(sql`
      select id, user_id, status from plans where id = ${planId}`);
    if (!plan || plan.user_id !== userId) throw new AppError('not_found');
    if (plan.status !== 'question')
      throw new AppError('bad_request', 'This plan is not waiting for an answer.');

    await this.db.execute(sql`insert into plan_messages (id, plan_id, role, body)
      values (${randomUUID()}, ${planId}, 'answer', ${answer})`);
    await this.db.execute(sql`update plans set status = 'drafting', step = step + 1
      where id = ${planId}`);
  }

  async toggleChange(
    userId: string,
    planId: string,
    changeId: string,
    enabled: boolean,
  ): Promise<void> {
    const {
      rows: [plan],
    } = await this.db.execute<Row>(sql`
      select id, user_id, status from plans where id = ${planId}`);
    if (!plan || plan.user_id !== userId) throw new AppError('not_found');
    if (plan.status !== 'ready') throw new AppError('plan_not_ready');

    const result = await this.db.execute(sql`update plan_changes set enabled = ${enabled}
      where id = ${changeId} and plan_id = ${planId}`);
    if ((result as { rowCount?: number }).rowCount === 0) throw new AppError('not_found');
    await this.db.execute(sql`update plans set version = version + 1 where id = ${planId}`);
  }

  async updateChangePayload(
    userId: string,
    planId: string,
    changeId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const {
      rows: [plan],
    } = await this.db.execute<Row>(sql`
      select id, user_id, status from plans where id = ${planId}`);
    if (!plan || plan.user_id !== userId) throw new AppError('not_found');
    if (plan.status !== 'ready') throw new AppError('plan_not_ready');

    const {
      rows: [change],
    } = await this.db.execute<Row>(sql`
      select id, kind, payload_json from plan_changes where id = ${changeId} and plan_id = ${planId}`);
    if (!change) throw new AppError('not_found');

    const kind = String(change.kind);
    if (kind !== 'create_term' && kind !== 'update_term') {
      throw new AppError('bad_request', 'Only term changes can have their payload edited.');
    }

    const existing = (change.payload_json as Record<string, unknown>) ?? {};
    const merged = { ...existing, ...payload };

    if (kind === 'create_term' && merged.new_term) {
      const nt = merged.new_term as Record<string, unknown>;
      if (nt.ends_on && nt.starts_on && String(nt.ends_on) < String(nt.starts_on)) {
        throw new AppError('bad_request', 'The term ends before it starts.');
      }
    }
    if (kind === 'update_term') {
      if (merged.ends_on && merged.starts_on && String(merged.ends_on) < String(merged.starts_on)) {
        throw new AppError('bad_request', 'The term ends before it starts.');
      }
    }

    await this.db
      .execute(sql`update plan_changes set payload_json = ${JSON.stringify(merged)}::jsonb
      where id = ${changeId} and plan_id = ${planId}`);

    // Repeating changes drafted for the old term dates follow the edited dates, so a class
    // imported into a term still runs for the whole term (Flow 02 Found classes).
    const termDates = (p: Record<string, unknown>) => {
      const src = kind === 'create_term' ? ((p.new_term as Record<string, unknown>) ?? {}) : p;
      return { from: String(src.starts_on ?? ''), until: String(src.ends_on ?? '') };
    };
    const before = termDates(existing);
    const after = termDates(merged);
    if (before.from && (before.from !== after.from || before.until !== after.until)) {
      const { rows: repeats } = await this.db.execute<Row>(sql`
        select id, payload_json from plan_changes
        where plan_id = ${planId} and kind = 'new' and payload_json ? 'repeat'`);
      for (const r of repeats) {
        const pj = r.payload_json as { repeat?: { from?: string; until?: string } };
        if (pj.repeat?.from !== before.from || pj.repeat?.until !== before.until) continue;
        const next = { ...pj, repeat: { ...pj.repeat, from: after.from, until: after.until } };
        await this.db
          .execute(sql`update plan_changes set payload_json = ${JSON.stringify(next)}::jsonb
          where id = ${String(r.id)}`);
      }
    }
    await this.db.execute(sql`update plans set version = version + 1 where id = ${planId}`);
  }

  async reply(userId: string, planId: string, text: string): Promise<void> {
    const {
      rows: [plan],
    } = await this.db.execute<Row>(sql`
      select id, user_id, status from plans where id = ${planId}`);
    if (!plan || plan.user_id !== userId) throw new AppError('not_found');
    if (plan.status !== 'ready') throw new AppError('plan_not_ready');

    await this.db.execute(sql`insert into plan_messages (id, plan_id, role, body)
      values (${randomUUID()}, ${planId}, 'reply', ${text})`);
    await this.db.execute(sql`update plans set status = 'drafting', step = step + 1,
      version = version + 1 where id = ${planId}`);
  }

  async cancel(userId: string, planId: string): Promise<void> {
    const {
      rows: [plan],
    } = await this.db.execute<Row>(sql`
      select id, user_id, status from plans where id = ${planId}`);
    if (!plan || plan.user_id !== userId) throw new AppError('not_found');
    if (plan.status !== 'drafting' && plan.status !== 'question') {
      throw new AppError('bad_request', 'Only drafting or question plans can be cancelled.');
    }
    await this.db.execute(sql`update plans set status = 'cancelled' where id = ${planId}`);
  }
}
