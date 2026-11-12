import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  planOps,
  type IsoDate,
  type PlanChange,
  type PlanOp,
  type ScheduleData,
} from '@dialed/schedule';
import { validate } from '@dialed/planning';
import type { PlanSource } from '@dialed/contracts';
import type { Db, Tx } from '../db/pool';
import { ChangeRecorder } from '../sync/record';
import { insertRoutineBlock, closeRoutineBlock, insertOverride } from '../sync/writers';
import { isStale } from './stale';
import { AppError } from '../lib/errors';

type Row = Record<string, unknown>;

function remapIds(ops: PlanOp[]): PlanOp[] {
  const map = new Map<string, string>();
  const remap = (id: string) => {
    if (!id.startsWith('plan:')) return id;
    let real = map.get(id);
    if (!real) {
      real = randomUUID();
      map.set(id, real);
    }
    return real;
  };
  return ops.map((op): PlanOp => {
    switch (op.op) {
      case 'insertCategory':
        return { ...op, category: { ...op.category, id: remap(op.category.id) } };
      case 'insertTerm':
        return {
          ...op,
          term: { ...op.term, id: remap(op.term.id) },
          routine: { ...op.routine, id: remap(op.routine.id), term_id: remap(op.term.id) },
        };
      case 'updateTerm':
        return { ...op, term_id: remap(op.term_id) };
      case 'insertRoutineBlock':
        return {
          ...op,
          block: {
            ...op.block,
            id: remap(op.block.id),
            routine_id: remap(op.block.routine_id),
            category_id: remap(op.block.category_id),
          },
        };
      case 'closeRoutineBlock':
        return op;
      case 'insertOverride':
        return {
          ...op,
          override: {
            ...op.override,
            id: remap(op.override.id),
            category_id: op.override.category_id ? remap(op.override.category_id) : null,
          },
        };
    }
  });
}

export interface ApproveResult {
  revision: number;
  applied: string[];
  effective_from: string;
}

async function loadScheduleData(tx: Tx, userId: string): Promise<ScheduleData> {
  const q = async (query: ReturnType<typeof sql>) => (await tx.execute<Row>(query)).rows;

  const categories = await q(
    sql`select id, name, group_name, color_dark, color_light, weight, quiet, protected, sort, deleted_at
        from categories where user_id = ${userId}`,
  );
  const terms = await q(
    sql`select id, name, starts_on, ends_on, is_draft, deleted_at
        from terms where user_id = ${userId}`,
  );
  const routines = await q(sql`select id, term_id, name from routines where user_id = ${userId}`);
  const routineBlocks = await q(
    sql`select id, routine_id, weekday, start_min, end_min, title, category_id, effective_from, effective_to, deleted_at
        from routine_blocks where user_id = ${userId}`,
  );
  const overrides = await q(
    sql`select id, on_date, kind, routine_block_id, title, start_min, end_min, category_id, moved_to_date, note, deleted_at
        from overrides where user_id = ${userId}`,
  );
  return {
    categories: categories.map((c) => ({ ...c, weight: Number(c.weight) })),
    terms,
    routines,
    routineBlocks,
    overrides,
  } as unknown as ScheduleData;
}

export async function approvePlan(
  db: Db,
  userId: string,
  planId: string,
  planVersion: number,
  today: IsoDate,
  opts?: { skipValidation?: boolean },
): Promise<ApproveResult> {
  try {
    return await db.transaction(async (tx) => {
      const {
        rows: [plan],
      } = await tx.execute<Row>(
        sql`select id, user_id, status, base_revision, version, range_from, range_to, source, request_text
          from plans where id = ${planId} for update`,
      );
      if (!plan || plan.user_id !== userId) throw new AppError('not_found');
      if (plan.status === 'approved') {
        const rev = await tx.execute<Row>(
          sql`select revision from revisions where user_id = ${userId}`,
        );
        return { revision: Number(rev.rows[0]?.revision ?? 0), applied: [], effective_from: today };
      }
      if (plan.status !== 'ready') throw new AppError('plan_not_ready');
      if (Number(plan.version) !== planVersion) {
        throw new AppError('plan_changed');
      }

      if (await isStale(tx, userId, Number(plan.base_revision))) {
        throw new AppError('plan_stale');
      }

      const { rows: changeRows } = await tx.execute<Row>(
        sql`select id, ord, kind, title, payload_json, note, enabled
          from plan_changes where plan_id = ${planId} order by ord`,
      );
      const enabledRows = changeRows.filter((r) => r.enabled);
      const changes: PlanChange[] = enabledRows.map((r) => ({
        kind: r.kind as string,
        title: r.title as string,
        ...(r.payload_json as Record<string, unknown>),
        note: r.note as string,
      })) as PlanChange[];

      const data = await loadScheduleData(tx, userId);

      const {
        rows: [userRow],
      } = await tx.execute<Row>(
        sql`select day_start_min, day_end_min, quiet_start_min, quiet_end_min
          from users where id = ${userId}`,
      );
      const profile = userRow
        ? {
            day_start_min: Number(userRow.day_start_min),
            day_end_min: Number(userRow.day_end_min),
            quiet_start_min: Number(userRow.quiet_start_min),
            quiet_end_min: Number(userRow.quiet_end_min),
          }
        : undefined;

      if (!opts?.skipValidation) {
        // Same words that unlocked protected blocks while drafting: the request plus answers and replies.
        const { rows: said } = await tx.execute<Row>(
          sql`select body from plan_messages where plan_id = ${planId} and role in ('answer', 'reply')
            order by created_at`,
        );
        const validation = validate(
          {
            request_text: [
              String(plan.request_text ?? ''),
              ...said.map((m) => String(m.body)),
            ].join('\n'),
            changes,
          },
          { data, today, source: String(plan.source) as PlanSource, profile, checkShape: false },
        );
        if (validation.errors.length > 0) {
          throw new AppError('plan_invalid', undefined, { errors: validation.errors });
        }
      }

      const ops = remapIds(planOps(changes, data, today));
      const rec = new ChangeRecorder(tx, userId);
      const applied: string[] = [];
      let earliestDate = today;

      for (const op of ops) {
        switch (op.op) {
          case 'insertCategory': {
            const { id, name, group_name, color_dark, color_light, weight, quiet, sort } =
              op.category;
            await tx.execute(sql`insert into categories
            (id, user_id, name, group_name, color_dark, color_light, weight, quiet, protected, sort)
            values (${id}, ${userId}, ${name}, ${group_name}, ${color_dark}, ${color_light},
                    ${weight}, ${quiet}, false, ${sort})`);
            await rec.record('category', id, 'upsert', { ...op.category, user_id: userId });
            applied.push(id);
            break;
          }
          case 'insertTerm': {
            const { id, name, starts_on, ends_on, is_draft } = op.term;
            await tx.execute(sql`insert into terms
            (id, user_id, name, starts_on, ends_on, is_draft)
            values (${id}, ${userId}, ${name}, ${starts_on}, ${ends_on}, ${is_draft})`);
            await rec.record('term', id, 'upsert', { ...op.term, user_id: userId });
            const rid = op.routine.id;
            await tx.execute(sql`insert into routines (id, user_id, term_id, name)
            values (${rid}, ${userId}, ${id}, ${op.routine.name})`);
            await rec.record('routine', rid, 'upsert', { ...op.routine, user_id: userId });
            applied.push(id);
            break;
          }
          case 'updateTerm': {
            await tx.execute(sql`update terms set starts_on = ${op.starts_on}, ends_on = ${op.ends_on},
            version = version + 1 where id = ${op.term_id} and user_id = ${userId}`);
            const {
              rows: [updated],
            } = await tx.execute(sql`select * from terms where id = ${op.term_id}`);
            await rec.record('term', op.term_id, 'upsert', updated as Record<string, unknown>);
            applied.push(op.term_id);
            break;
          }
          case 'insertRoutineBlock': {
            await insertRoutineBlock(
              tx,
              rec,
              userId,
              {
                id: op.block.id,
                routine_id: op.block.routine_id,
                weekday: op.block.weekday,
                start_min: op.block.start_min,
                end_min: op.block.end_min,
                title: op.block.title,
                category_id: op.block.category_id,
                effective_from: op.block.effective_from,
                effective_to: op.block.effective_to,
              },
              'plan',
            );
            applied.push(op.block.id);
            if (op.block.effective_from < earliestDate) earliestDate = op.block.effective_from;
            break;
          }
          case 'closeRoutineBlock': {
            await closeRoutineBlock(tx, rec, op.block_id, { effective_to: op.effective_to });
            applied.push(op.block_id);
            if (op.effective_to < earliestDate) earliestDate = op.effective_to;
            break;
          }
          case 'insertOverride': {
            await insertOverride(
              tx,
              rec,
              userId,
              {
                id: op.override.id,
                on_date: op.override.on_date,
                kind: op.override.kind,
                routine_block_id: op.override.routine_block_id,
                title: op.override.title,
                start_min: op.override.start_min,
                end_min: op.override.end_min,
                category_id: op.override.category_id,
                moved_to_date: op.override.moved_to_date,
                note: op.override.note,
              },
              'plan',
              planId,
            );
            applied.push(op.override.id);
            if (op.override.on_date < earliestDate) earliestDate = op.override.on_date;
            break;
          }
        }
      }

      const revision = await rec.currentRevision();
      await tx.execute(sql`update plans set status = 'approved', version = version + 1,
      decided_at = now() where id = ${planId}`);
      await tx.execute(sql`insert into audit_log (user_id, actor, action, target, meta_json)
      values (${userId}, 'user', 'approve', ${planId},
        ${JSON.stringify({ applied_count: applied.length, revision })}::jsonb)`);

      return { revision, applied, effective_from: earliestDate };
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'plan_stale') {
      await db.execute(sql`update plans set status = 'stale' where id = ${planId}`);
    }
    throw err;
  }
}

export async function discardPlan(db: Db, userId: string, planId: string): Promise<void> {
  const {
    rows: [plan],
  } = await db.execute<{ id: string; user_id: string; status: string }>(
    sql`select id, user_id, status from plans where id = ${planId}`,
  );
  if (!plan || plan.user_id !== userId) throw new AppError('not_found');
  if (plan.status === 'discarded') return;
  if (plan.status === 'approved') throw new AppError('bad_request', 'Already approved.');
  await db.execute(
    sql`update plans set status = 'discarded', decided_at = now() where id = ${planId}`,
  );
  await db.execute(sql`insert into audit_log (user_id, actor, action, target)
    values (${userId}, 'user', 'discard', ${planId})`);
}
