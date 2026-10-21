import type { SyncEntity } from '@dialed/contracts';

/** Columns sent to devices per entity (never user_id, hashes or account fields). */
export const SYNC_COLUMNS: Record<Exclude<SyncEntity, 'plan' | 'profile'>, string[]> = {
  category: [
    'id',
    'name',
    'group_name',
    'color_dark',
    'color_light',
    'weight',
    'quiet',
    'protected',
    'sort',
    'version',
    'deleted_at',
  ],
  term: ['id', 'name', 'starts_on', 'ends_on', 'is_draft', 'version', 'deleted_at'],
  routine: ['id', 'term_id', 'name', 'version'],
  routine_block: [
    'id',
    'routine_id',
    'weekday',
    'start_min',
    'end_min',
    'title',
    'category_id',
    'effective_from',
    'effective_to',
    'source',
    'version',
    'deleted_at',
  ],
  override: [
    'id',
    'on_date',
    'kind',
    'routine_block_id',
    'title',
    'start_min',
    'end_min',
    'category_id',
    'moved_to_date',
    'note',
    'source',
    'plan_id',
    'version',
    'deleted_at',
  ],
};
export const PROFILE_COLUMNS = [
  'display_name',
  'time_zone',
  'day_start_min',
  'day_end_min',
  'quiet_start_min',
  'quiet_end_min',
  'week_start',
  'theme',
  'ai_mode',
  'ai_provider',
  'profile_json',
  'version',
];
export const PLAN_SUMMARY_COLUMNS = [
  'id',
  'source',
  'client_name',
  'request_text',
  'status',
  'version',
  'created_at',
  'ready_at',
  'decided_at',
];

export const TABLE: Record<keyof typeof SYNC_COLUMNS, string> = {
  category: 'categories',
  term: 'terms',
  routine: 'routines',
  routine_block: 'routine_blocks',
  override: 'overrides',
};

export function pick(row: Record<string, unknown>, cols: string[]): Record<string, unknown> {
  return Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));
}

export function syncRow(entity: SyncEntity, row: Record<string, unknown>): Record<string, unknown> {
  if (entity === 'profile') return pick(row, PROFILE_COLUMNS);
  if (entity === 'plan') return pick(row, PLAN_SUMMARY_COLUMNS);
  return pick(row, SYNC_COLUMNS[entity]);
}
