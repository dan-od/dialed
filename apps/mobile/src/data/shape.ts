import type { Mutation, SyncChange, SyncEntity } from '@dialed/contracts';
import type { ScheduleData } from '@dialed/schedule';
import { now as clockNow } from '../clock/clock';
import type { LocalData, Profile } from './types';

type Row = Record<string, unknown>;

/** Turns mirrored rows into the shapes packages/schedule expects. */
export function toLocalData(rows: Record<SyncEntity, Row[]>): LocalData {
  const schedule: ScheduleData = {
    categories: rows.category.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      group_name: String(r.group_name),
      color_dark: String(r.color_dark),
      color_light: String(r.color_light),
      weight: Number(r.weight),
      quiet: Boolean(r.quiet),
      protected: Boolean(r.protected),
      sort: Number(r.sort),
      deleted_at: (r.deleted_at as string | null) ?? null,
    })),
    terms: rows.term.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      starts_on: String(r.starts_on),
      ends_on: String(r.ends_on),
      is_draft: Boolean(r.is_draft),
      deleted_at: (r.deleted_at as string | null) ?? null,
    })),
    routines: rows.routine.map((r) => ({
      id: String(r.id),
      term_id: String(r.term_id),
      name: String(r.name),
    })),
    routineBlocks: rows.routine_block.map((r) => ({
      id: String(r.id),
      routine_id: String(r.routine_id),
      weekday: Number(r.weekday),
      start_min: Number(r.start_min),
      end_min: Number(r.end_min),
      title: String(r.title),
      category_id: String(r.category_id),
      effective_from: String(r.effective_from),
      effective_to: (r.effective_to as string | null) ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
    })),
    overrides: rows.override.map((r) => ({
      id: String(r.id),
      on_date: String(r.on_date),
      kind: r.kind as 'skip' | 'modify' | 'add' | 'move',
      routine_block_id: (r.routine_block_id as string | null) ?? null,
      title: (r.title as string | null) ?? null,
      start_min: (r.start_min as number | null) ?? null,
      end_min: (r.end_min as number | null) ?? null,
      category_id: (r.category_id as string | null) ?? null,
      moved_to_date: (r.moved_to_date as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      deleted_at: (r.deleted_at as string | null) ?? null,
    })),
  };
  const p = rows.profile[0];
  const pendingIds = Object.values(rows)
    .flat()
    .filter((r) => r._pending)
    .map((r) => String(r.id));
  return { schedule, profile: p ? (p as unknown as Profile) : null, pending: pendingIds };
}

export const rowId = (c: SyncChange) => (c.entity === 'profile' ? 'me' : String(c.row.id));

type GetRow = (entity: SyncEntity, id: string) => Promise<Row | null>;
type ListRows = (entity: SyncEntity) => Promise<Row[]>;
const pending = (row: Row): Row => ({ ...row, _pending: true });
/**
 * Every applied mutation bumps the row version by one, so queued edits can chain offline. Predicted from the
 * mutation's base_version (not the row) so re-applying on top of a pull stays idempotent.
 */
const next = (m: { base_version: number }): number => m.base_version + 1;

/**
 * Optimistic local effect of a queued mutation (one or more rows). Also re-applied on top of every pull so
 * pending edits stay visible until the server answers ("· waiting to sync"). Mirrors the server's rules in
 * apps/api/src/sync/service.ts closely enough to predict versions and new row ids.
 */
export async function localEffects(
  m: Mutation,
  get: GetRow,
  list: ListRows = async () => [],
): Promise<SyncChange[]> {
  switch (m.entity) {
    case 'category_merge':
      return categoryEffects(m.from, m.from_version, { to: m.to }, get, list);
    case 'category_delete':
      return categoryEffects(
        m.id,
        m.base_version,
        m.reassign_to ? { to: m.reassign_to } : m.delete_blocks ? { end: true } : {},
        get,
        list,
      );
    case 'category_unmerge':
      return []; // needs the server's merge record; the pull right after brings the rows back
    case 'profile': {
      const cur = await get('profile', 'me');
      if (!cur) return [];
      const { block_alerts, ...rest } = m.fields;
      const json = { ...((cur.profile_json as Row | null) ?? {}) };
      if (block_alerts) {
        const alerts = { ...((json.block_alerts as Row | undefined) ?? {}) };
        for (const [k, v] of Object.entries(block_alerts)) {
          if (v === null) delete alerts[k];
          else alerts[k] = v;
        }
        json.block_alerts = alerts;
      }
      return [
        {
          entity: 'profile',
          op: 'upsert',
          row: pending({ ...cur, ...rest, profile_json: json, version: next(m) }),
        },
      ];
    }
    case 'override':
    case 'category':
    case 'term':
    case 'routine_block': {
      const cur = await get(m.entity, m.id);
      if (m.op === 'delete' || m.op === 'restore') {
        if (!cur) return [];
        const deleted_at = m.op === 'delete' ? new Date().toISOString() : null;
        return [
          {
            entity: m.entity,
            op: 'upsert',
            row: pending({ ...cur, deleted_at, version: next(m) }),
          },
        ];
      }
      const base: Row = cur ?? {
        version: 0,
        deleted_at: null,
        ...(m.entity === 'routine_block' ? { effective_to: null } : {}),
      };
      const { routine_id: routineId, ...fields } = m.fields as Row;
      const changes: SyncChange[] = [
        {
          entity: m.entity,
          op: 'upsert',
          row: pending({
            ...base,
            ...(m.entity === 'term' ? fields : m.fields),
            id: m.id,
            version: next(m),
          }),
        },
      ];
      // A new term brings its routine (created with it on the server, same id).
      if (m.entity === 'term' && !cur && typeof routineId === 'string')
        changes.push({
          entity: 'routine',
          op: 'upsert',
          row: pending({ id: routineId, term_id: m.id, name: fields.name, version: 1 }),
        });
      return changes;
    }
    case 'routine_block_edit': {
      const cur = await get('routine_block', m.block_id);
      if (!cur) return [];
      const E = m.effective_from;
      const from = String(cur.effective_from);
      const at = (row: Row): SyncChange => ({
        entity: 'routine_block',
        op: 'upsert',
        row: pending({ ...row, version: next(m) }),
      });
      if (m.reopen) return [at({ ...cur, effective_to: null, deleted_at: null })];
      if (m.close)
        return [
          at(
            E <= from
              ? { ...cur, deleted_at: new Date().toISOString() }
              : { ...cur, effective_to: E },
          ),
        ];
      const fields = m.fields ?? {};
      if (E <= from) return [at({ ...cur, ...fields })];
      if (!m.new_block_id) return [at({ ...cur, effective_to: E })]; // new row arrives with the server result
      // On a re-apply the old row is already closed at E; the new version keeps the original end.
      const again = await get('routine_block', m.new_block_id);
      const to = again ? (again.effective_to ?? null) : (cur.effective_to ?? null);
      return [
        at({ ...cur, effective_to: E }),
        {
          entity: 'routine_block',
          op: 'upsert',
          row: pending({
            ...cur,
            ...fields,
            id: m.new_block_id,
            effective_from: E,
            effective_to: to,
            version: 1,
          }),
        },
      ];
    }
    case 'routine_save':
      return routineSaveEffects(m, get);
    default:
      return [];
  }
}

/**
 * Local mirror of the server's routine_save (apps/api routineSave): in-place changes for blocks starting on/after
 * the date, close + new version for older ones. Re-applying on top of a pull gives the same rows.
 */
async function routineSaveEffects(
  m: Extract<Mutation, { entity: 'routine_save' }>,
  get: GetRow,
): Promise<SyncChange[]> {
  const routine = await get('routine', m.routine_id);
  if (!routine) return [];
  const E = m.effective_from;
  const out: SyncChange[] = [];
  const put = (row: Row) => out.push({ entity: 'routine_block', op: 'upsert', row: pending(row) });
  const fresh = (id: string, f: Row, to: unknown): Row => ({
    id,
    routine_id: m.routine_id,
    ...f,
    effective_from: E,
    effective_to: to ?? null,
    version: 1,
    deleted_at: null,
  });
  for (const op of m.ops) {
    if (op.op === 'add') {
      put(fresh(op.block_id, op.fields, null));
      continue;
    }
    const cur = await get('routine_block', op.block_id);
    if (!cur) continue;
    const from = String(cur.effective_from);
    // Already applied (re-apply after a pull): the old row was closed at E by this save.
    const applied = cur._by === m.client_mutation_id;
    const mark = {
      _by: m.client_mutation_id,
      version: applied ? cur.version : Number(cur.version) + 1,
    };
    if (op.op === 'close') {
      put(
        from >= E
          ? { ...cur, ...mark, deleted_at: cur.deleted_at ?? new Date().toISOString() }
          : { ...cur, ...mark, effective_to: E },
      );
      continue;
    }
    if (from >= E) {
      put({ ...cur, ...op.fields, ...mark });
      continue;
    }
    const newId = op.new_block_id;
    const again = newId ? await get('routine_block', newId) : null;
    const to = applied ? (again?.effective_to ?? null) : (cur.effective_to ?? null);
    put({ ...cur, ...mark, effective_to: E });
    if (newId) {
      const {
        id: _id,
        effective_from: _f,
        effective_to: _t,
        version: _v,
        _by,
        _pending,
        ...keep
      } = cur;
      void [_id, _f, _t, _v, _by, _pending];
      put(fresh(newId, { ...keep, ...op.fields }, to));
    }
  }
  out.push({
    entity: 'routine',
    op: 'upsert',
    row: pending({ ...routine, version: m.base_version + 1 }),
  });
  return out;
}

/**
 * Local mirror of the server's category merge/delete (apps/api categoryMerge, categoryDelete): live blocks and
 * one-offs move to `to`, or (`end`) end from today with past days kept; then the category goes. Idempotent.
 */
async function categoryEffects(
  id: string,
  baseVersion: number,
  how: { to?: string; end?: boolean },
  get: GetRow,
  list: ListRows,
): Promise<SyncChange[]> {
  const cat = await get('category', id);
  if (!cat) return [];
  const out: SyncChange[] = [];
  const put = (entity: SyncEntity, row: Row) =>
    out.push({ entity, op: 'upsert', row: pending(row) });
  const uses = (r: Row) => r.category_id === id && !r.deleted_at;
  if (how.to) {
    for (const r of (await list('routine_block')).filter(uses))
      put('routine_block', { ...r, category_id: how.to, version: Number(r.version) + 1 });
    for (const r of (await list('override')).filter(uses))
      put('override', { ...r, category_id: how.to, version: Number(r.version) + 1 });
  } else if (how.end) {
    const p = await get('profile', 'me');
    const today = clockNow(String(p?.time_zone ?? 'America/Toronto')).date;
    const stamp = new Date().toISOString();
    for (const r of (await list('routine_block')).filter(uses)) {
      if (
        r.effective_to !== null &&
        r.effective_to !== undefined &&
        String(r.effective_to) <= today
      )
        continue;
      put(
        'routine_block',
        String(r.effective_from) >= today
          ? { ...r, deleted_at: stamp, version: Number(r.version) + 1 }
          : { ...r, effective_to: today, version: Number(r.version) + 1 },
      );
    }
    for (const r of (await list('override')).filter(uses))
      if (String(r.on_date) >= today)
        put('override', { ...r, deleted_at: stamp, version: Number(r.version) + 1 });
  }
  put('category', {
    ...cat,
    deleted_at: cat.deleted_at ?? new Date().toISOString(),
    version: baseVersion + 1,
  });
  return out;
}

/** The row a mutation's base_version refers to (conflict Reapply). */
export function mutationTarget(m: Mutation): { entity: SyncEntity; id: string } | null {
  if (m.entity === 'profile') return { entity: 'profile', id: 'me' };
  if (m.entity === 'category_merge') return { entity: 'category', id: m.from };
  if (m.entity === 'category_unmerge') return null;
  if (m.entity === 'category_delete') return { entity: 'category', id: m.id };
  if (m.entity === 'routine_save') return { entity: 'routine', id: m.routine_id };
  if (m.entity === 'routine_block_edit') return { entity: 'routine_block', id: m.block_id };
  return { entity: m.entity, id: m.id };
}
