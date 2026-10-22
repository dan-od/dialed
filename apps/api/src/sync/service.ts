import { sql, type SQL } from 'drizzle-orm';
import type {
  Mutation,
  MutationResult,
  PullResponse,
  SyncChange,
  SyncEntity,
} from '@dialed/contracts';
import { localNow, weekStartOf } from '@dialed/schedule';
import type { Db, Tx } from '../db/pool';
import { AppError, appError } from '../lib/errors';
import { ChangeRecorder } from './record';
import { PLAN_SUMMARY_COLUMNS, PROFILE_COLUMNS, SYNC_COLUMNS, syncRow, TABLE } from './rows';

type Row = Record<string, unknown>;
const SNAPSHOT_ORDER: SyncEntity[] = [
  'profile',
  'category',
  'term',
  'routine',
  'routine_block',
  'override',
  'plan',
];

interface SnapshotCursor {
  r: number;
  e: number;
  id: string;
}
const encode = (c: SnapshotCursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decode(s: string): SnapshotCursor {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString()) as SnapshotCursor;
    if (typeof c.r === 'number' && typeof c.e === 'number' && typeof c.id === 'string') return c;
  } catch {
    /* fall through */
  }
  throw appError('bad_request', 'That sync cursor isn’t valid.');
}

class Rejected extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
class Conflict extends Error {
  constructor(readonly row: Row | null) {
    super('conflict');
  }
}

export class SyncService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async revision(userId: string): Promise<number> {
    const { rows } = await this.db.execute<{ revision: number }>(
      sql`select revision from revisions where user_id = ${userId}`,
    );
    return Number(rows[0]?.revision ?? 0);
  }

  // ---------------- pull ----------------

  async pull(userId: string, since: number, limit: number, cursor?: string): Promise<PullResponse> {
    if (since === 0) return this.snapshot(userId, limit, cursor ? decode(cursor) : undefined);
    const current = await this.revision(userId);
    if (since > current) throw appError('resync_required');
    const { rows } = await this.db.execute<{
      revision: number;
      entity: SyncEntity;
      op: 'upsert' | 'delete';
      row_json: Row | null;
      entity_id: string;
    }>(sql`
      select revision, entity, op, row_json, entity_id from change_log
      where user_id = ${userId} and revision > ${since}
      order by revision, id limit ${limit + 1}`);
    let page = rows;
    let more = false;
    let revision = current;
    if (rows.length > limit) {
      more = true;
      const lastRev = Number(rows[limit - 1]!.revision);
      const complete = rows.slice(0, limit).filter((r) => Number(r.revision) < lastRev);
      if (complete.length > 0) {
        page = complete;
        revision = Number(complete[complete.length - 1]!.revision);
      } else {
        // One revision larger than a page: send all of it so the cursor never splits a revision.
        const all = await this.db.execute<(typeof rows)[number]>(sql`
          select revision, entity, op, row_json, entity_id from change_log
          where user_id = ${userId} and revision = ${lastRev} order by id`);
        page = all.rows;
        revision = lastRev;
        more = revision < current;
      }
    }
    return {
      revision,
      more,
      snapshot: false,
      changes: page.map((r): SyncChange => ({
        entity: r.entity,
        op: r.op,
        row: r.row_json ?? { id: r.entity_id },
      })),
    };
  }

  private async snapshot(userId: string, limit: number, c?: SnapshotCursor): Promise<PullResponse> {
    const revision = c?.r ?? (await this.revision(userId));
    const changes: SyncChange[] = [];
    let e = c?.e ?? 0;
    let afterId = c?.id ?? '';
    while (e < SNAPSHOT_ORDER.length && changes.length < limit) {
      const entity = SNAPSHOT_ORDER[e]!;
      const want = limit - changes.length;
      const rows = await this.snapshotRows(userId, entity, afterId, want);
      changes.push(
        ...rows.map((row) => ({ entity, op: 'upsert' as const, row: syncRow(entity, row) })),
      );
      if (rows.length < want) {
        e++;
        afterId = '';
      } else {
        afterId = String(rows[rows.length - 1]!.id);
      }
    }
    const more = e < SNAPSHOT_ORDER.length;
    return {
      revision,
      changes,
      more,
      snapshot: true,
      ...(more ? { cursor: encode({ r: revision, e, id: afterId }) } : {}),
    };
  }

  private async snapshotRows(
    userId: string,
    entity: SyncEntity,
    afterId: string,
    limit: number,
  ): Promise<Row[]> {
    if (entity === 'profile') {
      if (afterId) return [];
      const { rows } = await this.db.execute<Row>(
        sql`select id, ${sql.raw(PROFILE_COLUMNS.join(', '))} from users where id = ${userId}`,
      );
      return rows;
    }
    const after = afterId ? sql`and id > ${afterId}::uuid` : sql``;
    if (entity === 'plan') {
      const { rows } = await this.db
        .execute<Row>(sql`select ${sql.raw(PLAN_SUMMARY_COLUMNS.join(', '))} from plans
        where user_id = ${userId} ${after} order by id limit ${limit}`);
      return rows;
    }
    const table = TABLE[entity];
    // Categories keep soft-deleted rows (past blocks may still reference their colours); others send live rows only.
    const live =
      entity === 'category' || entity === 'routine' ? sql`` : sql`and deleted_at is null`;
    const { rows } = await this.db
      .execute<Row>(sql`select ${sql.raw(SYNC_COLUMNS[entity].join(', '))} from ${sql.raw(table)}
      where user_id = ${userId} ${live} ${after} order by id limit ${limit}`);
    return rows;
  }

  // ---------------- push ----------------

  async push(
    userId: string,
    mutations: Mutation[],
  ): Promise<{ revision: number; results: MutationResult[] }> {
    const results: MutationResult[] = [];
    for (const m of mutations) results.push(await this.applyOne(userId, m));
    return { revision: await this.revision(userId), results };
  }

  private async applyOne(userId: string, m: Mutation): Promise<MutationResult> {
    const stored = await this.db.execute<{ result_json: MutationResult }>(sql`
      select result_json from mutation_receipts where user_id = ${userId} and client_mutation_id = ${m.client_mutation_id}`);
    if (stored.rows[0]) return stored.rows[0].result_json;

    let result: MutationResult;
    try {
      result = await this.db.transaction(async (tx) => {
        const rec = new ChangeRecorder(tx, userId);
        const { entity, row } = await this.dispatch(tx, rec, userId, m);
        return {
          client_mutation_id: m.client_mutation_id,
          status: 'applied',
          entity,
          row: syncRow(entity, row),
          revision: await rec.currentRevision(),
        };
      });
    } catch (e) {
      if (e instanceof Conflict) {
        result = {
          client_mutation_id: m.client_mutation_id,
          status: 'conflict',
          entity: entityOf(m),
          row: e.row,
        };
      } else if (e instanceof Rejected) {
        result = {
          client_mutation_id: m.client_mutation_id,
          status: 'rejected',
          error_code: e.code,
          message: e.message,
        };
      } else if (isPgError(e) && (e.code === '23503' || e.code === '23505' || e.code === '23514')) {
        result =
          e.code === '23503'
            ? {
                client_mutation_id: m.client_mutation_id,
                status: 'rejected',
                error_code: 'not_found',
                message: 'That isn’t available.',
              }
            : {
                client_mutation_id: m.client_mutation_id,
                status: 'rejected',
                error_code: 'bad_request',
                message:
                  e.code === '23505'
                    ? 'That name is already used.'
                    : 'Those values aren’t allowed.',
              };
      } else if (e instanceof AppError) {
        result = {
          client_mutation_id: m.client_mutation_id,
          status: 'rejected',
          error_code: e.code,
          message: e.message,
        };
      } else {
        throw e;
      }
    }
    await this.db
      .execute(sql`insert into mutation_receipts(user_id, client_mutation_id, result_json)
      values (${userId}, ${m.client_mutation_id}, ${JSON.stringify(result)}::jsonb) on conflict do nothing`);
    return result;
  }

  private async today(tx: Tx, userId: string): Promise<string> {
    const { rows } = await tx.execute<{ time_zone: string }>(
      sql`select time_zone from users where id = ${userId}`,
    );
    return localNow(this.now(), rows[0]?.time_zone ?? 'America/Toronto').date;
  }

  private async dispatch(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    m: Mutation,
  ): Promise<{ entity: SyncEntity; row: Row }> {
    switch (m.entity) {
      case 'profile':
        return {
          entity: 'profile',
          row: await this.profile(tx, rec, userId, m.base_version, m.fields),
        };
      case 'routine_block_edit':
        return { entity: 'routine_block', row: await this.routineBlockEdit(tx, rec, userId, m) };
      case 'override':
      case 'category':
      case 'term':
      case 'routine_block':
        return { entity: m.entity, row: await this.simple(tx, rec, userId, m) };
    }
  }

  private async profile(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    baseVersion: number,
    fields: Row,
  ): Promise<Row> {
    const { block_alerts: alerts, ...columns } = fields as Row & {
      block_alerts?: Record<string, number | null>;
    };
    const sets = Object.entries(columns)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => sql`${sql.identifier(k)} = ${v}`);
    if (alerts) {
      // Merge into profile_json.block_alerts; null clears a block's alert (D-32).
      const cur = await tx.execute<{ profile_json: Row }>(
        sql`select profile_json from users where id = ${userId}`,
      );
      const pj = { ...(cur.rows[0]?.profile_json ?? {}) } as Row & {
        block_alerts?: Record<string, number>;
      };
      const merged: Record<string, number> = { ...(pj.block_alerts ?? {}) };
      for (const [k, v] of Object.entries(alerts)) {
        if (v === null) delete merged[k];
        else merged[k] = v;
      }
      sets.push(sql`profile_json = ${JSON.stringify({ ...pj, block_alerts: merged })}::jsonb`);
    }
    if (fields.time_zone !== undefined) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: String(fields.time_zone) });
      } catch {
        throw new Rejected('bad_request', 'That time zone isn’t known.');
      }
    }
    const { rows } =
      await tx.execute<Row>(sql`update users set ${sql.join([...sets, sql`version = version + 1`], sql`, `)}
      where id = ${userId} and version = ${baseVersion} and status = 'active' returning *`);
    if (!rows[0]) {
      const cur = await tx.execute<Row>(sql`select * from users where id = ${userId}`);
      throw new Conflict(cur.rows[0] ? syncRow('profile', cur.rows[0]) : null);
    }
    await rec.record('profile', userId, 'upsert', rows[0]);
    return rows[0];
  }

  /** Simple entity upsert/delete: ownership re-checked, version compared, soft delete. */
  private async simple(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    m: Extract<Mutation, { entity: 'override' | 'category' | 'term' | 'routine_block' }>,
  ): Promise<Row> {
    const table = TABLE[m.entity];
    const found = await tx.execute<Row>(
      sql`select * from ${sql.raw(table)} where id = ${m.id} for update`,
    );
    const existing = found.rows[0];
    if (existing && existing.user_id !== userId)
      throw new Rejected('not_found', 'That isn’t available.'); // 404, never 403
    if (existing && Number(existing.version) !== m.base_version)
      throw new Conflict(syncRow(m.entity, existing));
    if (!existing && m.op !== 'upsert') throw new Rejected('not_found', 'That isn’t available.');
    if (!existing && m.base_version !== 0) throw new Conflict(null);
    // Routine blocks are only created here; changing one is a routine_block_edit (effective-dated).
    if (existing && m.entity === 'routine_block') throw new Conflict(syncRow(m.entity, existing));

    if (m.op === 'restore') {
      const { rows } =
        await tx.execute<Row>(sql`update ${sql.raw(table)} set deleted_at = null, version = version + 1
        where id = ${m.id} and user_id = ${userId} returning *`);
      await rec.record(m.entity, m.id, 'upsert', rows[0]!);
      return rows[0]!;
    }

    if (m.op === 'delete') {
      const { rows } =
        await tx.execute<Row>(sql`update ${sql.raw(table)} set deleted_at = now(), version = version + 1
        where id = ${m.id} and user_id = ${userId} returning *`);
      await rec.record(m.entity, m.id, 'upsert', rows[0]!);
      return rows[0]!;
    }
    const fields = { ...(m.fields ?? {}) } as Row;
    if (m.entity === 'override')
      await this.checkOverride(tx, userId, existing ? { ...existing, ...fields } : fields);
    if (m.entity === 'term' && String(fields.ends_on) < String(fields.starts_on))
      throw new Rejected('bad_request', 'A term ends on or after it starts.');
    if (m.entity === 'routine_block') await this.checkNewRoutineBlock(tx, userId, fields);

    let row: Row;
    if (existing) {
      const sets = Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => sql`${sql.identifier(k)} = ${v}`);
      const { rows } =
        await tx.execute<Row>(sql`update ${sql.raw(table)} set ${sql.join([...sets, sql`version = version + 1`], sql`, `)}
        where id = ${m.id} and user_id = ${userId} returning *`);
      row = rows[0]!;
    } else {
      const cols = Object.keys(fields).filter((k) => fields[k] !== undefined);
      const { rows } =
        await tx.execute<Row>(sql`insert into ${sql.raw(table)} (id, user_id, ${sql.join(
          cols.map((c) => sql.identifier(c)),
          sql`, `,
        )})
        values (${m.id}, ${userId}, ${sql.join(
          cols.map((c) => sql`${fields[c]}`),
          sql`, `,
        )}) returning *`);
      row = rows[0]!;
      if (m.entity === 'term') {
        const r = await tx.execute<Row>(
          sql`insert into routines (user_id, term_id, name) values (${userId}, ${m.id}, ${String(fields.name)}) returning *`,
        );
        await rec.record('routine', String(r.rows[0]!.id), 'upsert', r.rows[0]!);
      }
    }
    await rec.record(m.entity, m.id, 'upsert', row);
    return row;
  }

  private async termOn(tx: Tx, userId: string, date: string): Promise<{ name: string } | null> {
    const { rows } = await tx.execute<{
      name: string;
    }>(sql`select name from terms where user_id = ${userId}
      and deleted_at is null and not is_draft and starts_on <= ${date} and ends_on >= ${date} limit 1`);
    return rows[0] ?? null;
  }

  /** New routine block: owned routine and category, times valid, effective from today or later, inside the term. */
  private async checkNewRoutineBlock(tx: Tx, userId: string, f: Row) {
    if (Number(f.end_min) <= Number(f.start_min))
      throw new Rejected('bad_request', 'End after it starts.');
    await this.owned(tx, 'categories', String(f.category_id), userId);
    const { rows } = await tx.execute<{ name: string; starts_on: string; ends_on: string }>(sql`
      select t.name, t.starts_on, t.ends_on from routines r join terms t on t.id = r.term_id and t.user_id = r.user_id
      where r.id = ${String(f.routine_id)} and r.user_id = ${userId}`);
    const term = rows[0];
    if (!term) throw new Rejected('not_found', 'That isn’t available.');
    const from = String(f.effective_from);
    if (from < (await this.today(tx, userId)))
      throw new Rejected('bad_request', 'Past days never change. Pick today or later.');
    if (from < term.starts_on || from > term.ends_on)
      throw new Rejected('bad_request', `That day isn’t in ${term.name}.`);
  }

  private async checkOverride(tx: Tx, userId: string, o: Row) {
    const need = (ok: boolean, msg: string) => {
      if (!ok) throw new Rejected('bad_request', msg);
    };
    if (o.kind === 'add')
      need(
        Boolean(o.title) && o.start_min != null && o.end_min != null && Boolean(o.category_id),
        'A new block needs a title, times and a category.',
      );
    else need(Boolean(o.routine_block_id), 'Pick the block to change.');
    if (o.kind === 'move') {
      need(Boolean(o.moved_to_date), 'Pick the day to move it to.');
      need(
        weekStartOf(String(o.moved_to_date)) === weekStartOf(String(o.on_date)),
        'Move it within the same week.',
      );
      const from = await this.termOn(tx, userId, String(o.on_date));
      const to = await this.termOn(tx, userId, String(o.moved_to_date));
      if (!to) throw new Rejected('bad_request', `That day isn’t in ${from?.name ?? 'a term'}.`);
    }
    if (o.start_min != null && o.end_min != null)
      need(Number(o.end_min) > Number(o.start_min), 'End after it starts.');
    if (o.routine_block_id)
      await this.owned(tx, 'routine_blocks', String(o.routine_block_id), userId);
    if (o.category_id) await this.owned(tx, 'categories', String(o.category_id), userId);
  }

  private async owned(tx: Tx, table: string, id: string, userId: string) {
    const { rows } = await tx.execute(
      sql`select 1 from ${sql.raw(table)} where id = ${id} and user_id = ${userId}`,
    );
    if (!rows[0]) throw new Rejected('not_found', 'That isn’t available.');
  }

  /** Flow 04 "every week" edits: close + insert, or in-place on the same effective day. Past days never change. */
  private async routineBlockEdit(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    m: Extract<Mutation, { entity: 'routine_block_edit' }>,
  ): Promise<Row> {
    const found = await tx.execute<Row>(
      sql`select * from routine_blocks where id = ${m.block_id} and user_id = ${userId} for update`,
    );
    const cur = found.rows[0];
    if (!cur || (cur.deleted_at && !m.reopen))
      throw new Rejected('not_found', 'That isn’t available.');
    if (Number(cur.version) !== m.base_version) throw new Conflict(syncRow('routine_block', cur));
    const E = m.effective_from;
    if (E < (await this.today(tx, userId)))
      throw new Rejected('bad_request', 'Past days never change. Pick today or later.');
    const from = String(cur.effective_from);
    const to = cur.effective_to ? String(cur.effective_to) : null;

    const update = async (set: SQL) => {
      const { rows } = await tx.execute<Row>(
        sql`update routine_blocks set ${set}, version = version + 1 where id = ${m.block_id} returning *`,
      );
      await rec.record('routine_block', m.block_id, 'upsert', rows[0]!);
      return rows[0]!;
    };

    // Undo of a delete (within the toast's 6 s): clears either kind of close.
    if (m.reopen) return update(sql`effective_to = null, deleted_at = null`);
    if (m.close) {
      if (E <= from) return update(sql`deleted_at = now()`); // never resolved on a past date
      if (to !== null && E >= to)
        throw new Rejected('bad_request', 'That block already ends before then.');
      return update(sql`effective_to = ${E}`);
    }
    const f = m.fields ?? {};
    const merged = {
      title: f.title ?? String(cur.title),
      start_min: f.start_min ?? Number(cur.start_min),
      end_min: f.end_min ?? Number(cur.end_min),
      category_id: f.category_id ?? String(cur.category_id),
      weekday: f.weekday ?? Number(cur.weekday),
    };
    if (merged.end_min <= merged.start_min)
      throw new Rejected('bad_request', 'End after it starts.');
    if (f.category_id) await this.owned(tx, 'categories', f.category_id, userId);
    if (E <= from) {
      return update(sql`title = ${merged.title}, start_min = ${merged.start_min}, end_min = ${merged.end_min},
        category_id = ${merged.category_id}, weekday = ${merged.weekday}`);
    }
    if (to !== null && E >= to)
      throw new Rejected('bad_request', 'That block already ends before then.');
    if (m.new_block_id) {
      const taken = await tx.execute(
        sql`select 1 from routine_blocks where id = ${m.new_block_id}`,
      );
      if (taken.rows[0]) throw new Rejected('bad_request', 'That block id is already used.');
    }
    await update(sql`effective_to = ${E}`);
    const newId = m.new_block_id ?? null;
    const { rows } = await tx.execute<Row>(sql`insert into routine_blocks
      (id, routine_id, user_id, weekday, start_min, end_min, title, category_id, effective_from, effective_to, source)
      values (coalesce(${newId}::uuid, gen_random_uuid()), ${cur.routine_id}, ${userId}, ${merged.weekday}, ${merged.start_min},
              ${merged.end_min}, ${merged.title}, ${merged.category_id}, ${E}, ${to}, 'user') returning *`);
    await rec.record('routine_block', String(rows[0]!.id), 'upsert', rows[0]!);
    return rows[0]!;
  }
}

function entityOf(m: Mutation): string {
  return m.entity === 'routine_block_edit' ? 'routine_block' : m.entity;
}

function isPgError(e: unknown): e is { code: string } {
  const code =
    (e as { code?: unknown; cause?: { code?: unknown } })?.code ??
    (e as { cause?: { code?: unknown } })?.cause?.code;
  if (typeof code === 'string') {
    (e as { code: string }).code = code;
    return true;
  }
  return false;
}
