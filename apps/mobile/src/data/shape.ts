import type { Mutation, SyncChange, SyncEntity } from '@dialed/contracts';
import type { ScheduleData } from '@dialed/schedule';
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
export async function localEffects(m: Mutation, get: GetRow): Promise<SyncChange[]> {
  switch (m.entity) {
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
      return [
        {
          entity: m.entity,
          op: 'upsert',
          row: pending({ ...base, ...m.fields, id: m.id, version: next(m) }),
        },
      ];
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
    default:
      return [];
  }
}

/** The row a mutation's base_version refers to (conflict Reapply). */
export function mutationTarget(m: Mutation): { entity: SyncEntity; id: string } | null {
  if (m.entity === 'profile') return { entity: 'profile', id: 'me' };
  if (m.entity === 'routine_block_edit') return { entity: 'routine_block', id: m.block_id };
  return { entity: m.entity, id: m.id };
}
