import { randomUUID } from 'node:crypto';
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
        const { entity, row, extra } = await this.dispatch(tx, rec, userId, m);
        return {
          client_mutation_id: m.client_mutation_id,
          status: 'applied',
          entity,
          row: syncRow(entity, row),
          revision: await rec.currentRevision(),
          ...extra,
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
  ): Promise<{ entity: SyncEntity; row: Row; extra?: Partial<MutationResult> }> {
    switch (m.entity) {
      case 'category_merge':
        return this.categoryMerge(tx, rec, userId, m);
      case 'category_unmerge':
        return { entity: 'category', row: await this.categoryUnmerge(tx, rec, userId, m) };
      case 'category_delete':
        return { entity: 'category', row: await this.categoryDelete(tx, rec, userId, m) };
      case 'profile':
        return {
          entity: 'profile',
          row: await this.profile(tx, rec, userId, m.base_version, m.fields),
        };
      case 'routine_block_edit':
        return { entity: 'routine_block', row: await this.routineBlockEdit(tx, rec, userId, m) };
      case 'routine_save':
        return { entity: 'routine', row: await this.routineSave(tx, rec, userId, m) };
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
    m: Extract<
      Mutation,
      { entity: 'override' | 'category' | 'term' | 'routine_block' | 'routine' }
    >,
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
      if (m.entity === 'category' && (await this.categoryUse(tx, userId, m.id)) > 0)
        throw new Rejected('in_use', 'Blocks still use it. Pick where they go first.');
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
      throw new Rejected('bad_request', 'Ends needs to be after starts.');
    if (m.entity === 'routine_block') await this.checkNewRoutineBlock(tx, userId, fields);
    // A term's routine id rides along on create only; it isn't a term column.
    const routineId =
      m.entity === 'term' ? ((fields.routine_id as string | undefined) ?? null) : null;
    if (m.entity === 'term') delete fields.routine_id;

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
          sql`insert into routines (id, user_id, term_id, name)
            values (coalesce(${routineId}::uuid, gen_random_uuid()), ${userId}, ${m.id}, ${String(fields.name)}) returning *`,
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
      and deleted_at is null and not is_draft and starts_on <= ${date} and ends_on >= ${date}
      order by starts_on limit 1`); // overlapping terms: the earlier start wins (as packages/schedule termFor)
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

  /**
   * Flow 05 "Save routine": all changes in one transaction, effective from one date (BACKEND_SETUP §4).
   * A block that already starts on/after the date changes in place; an older one is closed at the date and a
   * new version (client-chosen id) continues from it. Past days never change.
   */
  private async routineSave(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    m: Extract<Mutation, { entity: 'routine_save' }>,
  ): Promise<Row> {
    const found = await tx.execute<Row>(
      sql`select * from routines where id = ${m.routine_id} and user_id = ${userId} for update`,
    );
    const routine = found.rows[0];
    if (!routine) throw new Rejected('not_found', 'That isn’t available.');
    if (Number(routine.version) !== m.base_version) throw new Conflict(syncRow('routine', routine));
    const E = m.effective_from;
    if (E < (await this.today(tx, userId)))
      throw new Rejected('bad_request', 'Past days never change. Pick today or later.');

    const insert = async (id: string, f: Row, to: string | null) => {
      if (Number(f.end_min) <= Number(f.start_min))
        throw new Rejected('bad_request', 'End after it starts.');
      await this.owned(tx, 'categories', String(f.category_id), userId);
      const taken = await tx.execute(sql`select 1 from routine_blocks where id = ${id}`);
      if (taken.rows[0]) throw new Rejected('bad_request', 'That block id is already used.');
      const { rows } = await tx.execute<Row>(sql`insert into routine_blocks
        (id, routine_id, user_id, weekday, start_min, end_min, title, category_id, effective_from, effective_to, source)
        values (${id}, ${m.routine_id}, ${userId}, ${f.weekday}, ${f.start_min}, ${f.end_min}, ${f.title},
                ${f.category_id}, ${E}, ${to}, 'user') returning *`);
      await rec.record('routine_block', id, 'upsert', rows[0]!);
    };
    const update = async (id: string, set: SQL) => {
      const { rows } = await tx.execute<Row>(
        sql`update routine_blocks set ${set}, version = version + 1 where id = ${id} returning *`,
      );
      await rec.record('routine_block', id, 'upsert', rows[0]!);
    };
    const block = async (id: string) => {
      const r = await tx.execute<Row>(sql`select * from routine_blocks
        where id = ${id} and user_id = ${userId} and routine_id = ${m.routine_id} and deleted_at is null for update`);
      if (!r.rows[0]) throw new Rejected('not_found', 'That isn’t available.');
      return r.rows[0];
    };

    for (const op of m.ops) {
      if (op.op === 'add') {
        await insert(op.block_id, op.fields, null);
        continue;
      }
      const cur = await block(op.block_id);
      const from = String(cur.effective_from);
      const to = cur.effective_to ? String(cur.effective_to) : null;
      if (to !== null && E >= to)
        throw new Rejected('bad_request', 'That block already ends before then.');
      if (op.op === 'close') {
        await update(op.block_id, from >= E ? sql`deleted_at = now()` : sql`effective_to = ${E}`);
        continue;
      }
      const f = op.fields;
      const merged = {
        weekday: f.weekday ?? Number(cur.weekday),
        start_min: f.start_min ?? Number(cur.start_min),
        end_min: f.end_min ?? Number(cur.end_min),
        title: f.title ?? String(cur.title),
        category_id: f.category_id ?? String(cur.category_id),
      };
      if (from >= E) {
        if (merged.end_min <= merged.start_min)
          throw new Rejected('bad_request', 'End after it starts.');
        if (f.category_id) await this.owned(tx, 'categories', f.category_id, userId);
        await update(
          op.block_id,
          sql`weekday = ${merged.weekday}, start_min = ${merged.start_min}, end_min = ${merged.end_min},
            title = ${merged.title}, category_id = ${merged.category_id}`,
        );
      } else {
        await update(op.block_id, sql`effective_to = ${E}`);
        await insert(op.new_block_id ?? randomUUID(), merged, to);
      }
    }
    const { rows } = await tx.execute<Row>(
      sql`update routines set version = version + 1 where id = ${m.routine_id} returning *`,
    );
    await rec.record('routine', m.routine_id, 'upsert', rows[0]!);
    return rows[0]!;
  }

  /** Live routine blocks and one-offs that use a category. */
  private async categoryUse(tx: Tx, userId: string, id: string): Promise<number> {
    const { rows } = await tx.execute<{ n: number }>(sql`select
      (select count(*) from routine_blocks where user_id = ${userId} and category_id = ${id} and deleted_at is null)
      + (select count(*) from overrides where user_id = ${userId} and category_id = ${id} and deleted_at is null) as n`);
    return Number(rows[0]?.n ?? 0);
  }

  /** A live category of this user, locked; someone else's or a deleted one is not_found (never 403). */
  private async liveCategory(tx: Tx, userId: string, id: string): Promise<Row> {
    const { rows } = await tx.execute<Row>(
      sql`select * from categories where id = ${id} and user_id = ${userId} and deleted_at is null for update`,
    );
    if (!rows[0]) throw new Rejected('not_found', 'That isn’t available.');
    return rows[0];
  }

  /** Moves every live block and one-off (past ones too: a category is a label) from one category to another. */
  private async moveCategory(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    from: string,
    to: string,
  ): Promise<{ routine_block_ids: string[]; override_ids: string[] }> {
    const blocks =
      await tx.execute<Row>(sql`update routine_blocks set category_id = ${to}, version = version + 1
      where user_id = ${userId} and category_id = ${from} and deleted_at is null returning *`);
    for (const r of blocks.rows) await rec.record('routine_block', String(r.id), 'upsert', r);
    const ovs =
      await tx.execute<Row>(sql`update overrides set category_id = ${to}, version = version + 1
      where user_id = ${userId} and category_id = ${from} and deleted_at is null returning *`);
    for (const r of ovs.rows) await rec.record('override', String(r.id), 'upsert', r);
    return {
      routine_block_ids: blocks.rows.map((r) => String(r.id)),
      override_ids: ovs.rows.map((r) => String(r.id)),
    };
  }

  private async softDeleteCategory(tx: Tx, rec: ChangeRecorder, id: string): Promise<Row> {
    const { rows } = await tx.execute<Row>(
      sql`update categories set deleted_at = now(), version = version + 1 where id = ${id} returning *`,
    );
    await rec.record('category', id, 'upsert', rows[0]!);
    return rows[0]!;
  }

  /** Flow 09 merge: atomic; recorded in category_merges so it can be undone for 10 minutes. */
  private async categoryMerge(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    m: Extract<Mutation, { entity: 'category_merge' }>,
  ): Promise<{ entity: SyncEntity; row: Row; extra: Partial<MutationResult> }> {
    if (m.from === m.to) throw new Rejected('bad_request', 'Pick a different category.');
    const from = await this.liveCategory(tx, userId, m.from);
    const to = await this.liveCategory(tx, userId, m.to);
    if (Number(from.version) !== m.from_version) throw new Conflict(syncRow('category', from));
    if (Number(to.version) !== m.to_version) throw new Conflict(syncRow('category', to));
    const moved = await this.moveCategory(tx, rec, userId, m.from, m.to);
    const { rows } = await tx.execute<{ id: string }>(sql`insert into category_merges
      (user_id, from_category_id, to_category_id, moved_json, created_at)
      values (${userId}, ${m.from}, ${m.to}, ${JSON.stringify(moved)}::jsonb, ${this.now().toISOString()}) returning id`);
    const row = await this.softDeleteCategory(tx, rec, m.from);
    return {
      entity: 'category',
      row,
      extra: {
        merge_id: rows[0]!.id,
        moved: moved.routine_block_ids.length,
      },
    };
  }

  /** Undo a merge (10 minutes): the category comes back and rows that still point at the target move back. */
  private async categoryUnmerge(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    m: Extract<Mutation, { entity: 'category_unmerge' }>,
  ): Promise<Row> {
    const found = await tx.execute<{
      from_category_id: string;
      to_category_id: string;
      moved_json: { routine_block_ids: string[]; override_ids: string[] };
      created_at: Date;
      undone_at: Date | null;
    }>(
      sql`select * from category_merges where id = ${m.merge_id} and user_id = ${userId} for update`,
    );
    const merge = found.rows[0];
    if (!merge || merge.undone_at) throw new Rejected('not_found', 'That isn’t available.');
    if (this.now().getTime() - new Date(merge.created_at).getTime() > 10 * 60_000)
      throw new Rejected('too_late', 'That merge can’t be undone any more.');
    const back =
      await tx.execute<Row>(sql`update categories set deleted_at = null, version = version + 1
      where id = ${merge.from_category_id} and user_id = ${userId} returning *`);
    await rec.record('category', merge.from_category_id, 'upsert', back.rows[0]!);
    const ids = merge.moved_json;
    const from = merge.from_category_id;
    const to = merge.to_category_id;
    if (ids.routine_block_ids.length) {
      const r =
        await tx.execute<Row>(sql`update routine_blocks set category_id = ${from}, version = version + 1
        where user_id = ${userId} and category_id = ${to}
          and id in (${sql.join(
            ids.routine_block_ids.map((i) => sql`${i}::uuid`),
            sql`, `,
          )}) returning *`);
      for (const x of r.rows) await rec.record('routine_block', String(x.id), 'upsert', x);
    }
    if (ids.override_ids.length) {
      const r =
        await tx.execute<Row>(sql`update overrides set category_id = ${from}, version = version + 1
        where user_id = ${userId} and category_id = ${to}
          and id in (${sql.join(
            ids.override_ids.map((i) => sql`${i}::uuid`),
            sql`, `,
          )}) returning *`);
      for (const x of r.rows) await rec.record('override', String(x.id), 'upsert', x);
    }
    await tx.execute(
      sql`update category_merges set undone_at = ${this.now().toISOString()} where id = ${m.merge_id}`,
    );
    return back.rows[0]!;
  }

  /** Flow 09 delete: blocks move to another category, or end from today (past days keep theirs); then it goes. */
  private async categoryDelete(
    tx: Tx,
    rec: ChangeRecorder,
    userId: string,
    m: Extract<Mutation, { entity: 'category_delete' }>,
  ): Promise<Row> {
    const cat = await this.liveCategory(tx, userId, m.id);
    if (Number(cat.version) !== m.base_version) throw new Conflict(syncRow('category', cat));
    if (m.reassign_to) {
      if (m.reassign_to === m.id) throw new Rejected('bad_request', 'Pick a different category.');
      await this.liveCategory(tx, userId, m.reassign_to);
      await this.moveCategory(tx, rec, userId, m.id, m.reassign_to);
    } else if (m.delete_blocks) {
      const today = await this.today(tx, userId);
      const del = await tx.execute<Row>(sql`update routine_blocks set
          deleted_at = case when effective_from >= ${today} then now() else deleted_at end,
          effective_to = case when effective_from >= ${today} then effective_to else ${today}::date end,
          version = version + 1
        where user_id = ${userId} and category_id = ${m.id} and deleted_at is null
          and (effective_to is null or effective_to > ${today}) returning *`);
      for (const r of del.rows) await rec.record('routine_block', String(r.id), 'upsert', r);
      const ovs =
        await tx.execute<Row>(sql`update overrides set deleted_at = now(), version = version + 1
        where user_id = ${userId} and category_id = ${m.id} and deleted_at is null and on_date >= ${today} returning *`);
      for (const r of ovs.rows) await rec.record('override', String(r.id), 'upsert', r);
    } else if ((await this.categoryUse(tx, userId, m.id)) > 0) {
      throw new Rejected('in_use', 'Blocks still use it. Pick where they go first.');
    }
    return this.softDeleteCategory(tx, rec, m.id);
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
  if (m.entity === 'routine_save') return 'routine';
  if (m.entity.startsWith('category_')) return 'category';
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
