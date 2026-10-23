import { z } from 'zod';

const isoDate = z.iso.date();
const minute = z
  .number()
  .int()
  .min(0)
  .max(1440)
  .refine((m) => m % 5 === 0, 'Times use a 5-minute grid.');

export const SYNC_ENTITIES = [
  'category',
  'term',
  'routine',
  'routine_block',
  'override',
  'plan',
  'profile',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const PullQuery = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  cursor: z.string().max(200).optional(),
});

export const SyncChange = z.object({
  entity: z.enum(SYNC_ENTITIES),
  op: z.enum(['upsert', 'delete']),
  row: z.record(z.string(), z.unknown()),
});
export type SyncChange = z.infer<typeof SyncChange>;

export const PullResponse = z.object({
  revision: z.number().int(),
  changes: z.array(SyncChange),
  more: z.boolean(),
  /** Opaque continuation for paged snapshots (since=0) — pass back as `cursor`. */
  cursor: z.string().optional(),
  snapshot: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponse>;

// ----- push -----
const base = { client_mutation_id: z.uuid() };

export const OverrideFields = z.strictObject({
  on_date: isoDate,
  kind: z.enum(['skip', 'modify', 'add', 'move']),
  routine_block_id: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(80).nullable().optional(),
  start_min: minute.nullable().optional(),
  end_min: minute.nullable().optional(),
  category_id: z.uuid().nullable().optional(),
  moved_to_date: isoDate.nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});
export const CategoryFields = z.strictObject({
  name: z.string().trim().min(1).max(40),
  group_name: z.string().trim().min(1).max(30),
  color_dark: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  color_light: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  weight: z.number().min(0.1).max(1).optional(),
  quiet: z.boolean().optional(),
  sort: z.number().int().optional(),
});
export const TermFields = z.strictObject({
  name: z.string().trim().min(1).max(40),
  starts_on: isoDate,
  ends_on: isoDate,
  is_draft: z.boolean().optional(),
  /** New terms only: id for the term's routine, created with it (client-chosen so offline edits can use it). */
  routine_id: z.uuid().optional(),
});
export const ProfileFields = z.strictObject({
  display_name: z.string().trim().max(80).optional(),
  time_zone: z.string().max(64).optional(),
  day_start_min: minute.optional(),
  day_end_min: minute.optional(),
  quiet_start_min: minute.optional(),
  quiet_end_min: minute.optional(),
  week_start: z.number().int().min(0).max(6).optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  /** Per-block alert (D-32): minutes before start (0 = when it starts); null clears it. Stored in profile_json. */
  block_alerts: z
    .record(z.uuid(), z.union([z.literal(0), z.literal(10), z.literal(30), z.null()]))
    .optional(),
});

/** A new routine block ("add every <weekday>", Flow 04). Edits to existing blocks go through routine_block_edit. */
export const RoutineBlockFields = z.strictObject({
  routine_id: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  start_min: minute,
  end_min: minute,
  title: z.string().trim().min(1).max(80),
  category_id: z.uuid(),
  effective_from: isoDate,
});

const simple = <E extends string, F extends z.ZodType>(entity: E, fields: F) =>
  z.strictObject({
    ...base,
    entity: z.literal(entity),
    // restore = undo a delete (clears deleted_at)
    op: z.enum(['upsert', 'delete', 'restore']),
    id: z.uuid(),
    base_version: z.number().int().min(0),
    fields: fields.optional(),
  });

export const RoutineBlockEditMutation = z.strictObject({
  ...base,
  entity: z.literal('routine_block_edit'),
  block_id: z.uuid(),
  base_version: z.number().int().min(1),
  effective_from: isoDate,
  fields: z
    .strictObject({
      title: z.string().trim().min(1).max(80).optional(),
      start_min: minute.optional(),
      end_min: minute.optional(),
      category_id: z.uuid().optional(),
      weekday: z.number().int().min(0).max(6).optional(),
    })
    .optional(),
  close: z.literal(true).optional(),
  reopen: z.literal(true).optional(),
  /** Client-chosen id for the new version row (close + insert), so offline edits keep stable ids. */
  new_block_id: z.uuid().optional(),
});

const blockCore = {
  weekday: z.number().int().min(0).max(6),
  start_min: minute,
  end_min: minute,
  title: z.string().trim().min(1).max(80),
  category_id: z.uuid(),
};
/** One change inside a routine save. Client-chosen ids keep offline saves stable. */
export const RoutineSaveOp = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('add'), block_id: z.uuid(), fields: z.strictObject(blockCore) }),
  z.strictObject({
    op: z.literal('update'),
    block_id: z.uuid(),
    /** Id for the new version when the block is versioned (close + insert). */
    new_block_id: z.uuid().optional(),
    fields: z.strictObject(blockCore).partial(),
  }),
  z.strictObject({ op: z.literal('close'), block_id: z.uuid() }),
]);
export type RoutineSaveOp = z.infer<typeof RoutineSaveOp>;

/** Flow 05 "Save routine": every change in one server transaction, effective from one date. */
export const RoutineSaveMutation = z.strictObject({
  ...base,
  entity: z.literal('routine_save'),
  routine_id: z.uuid(),
  base_version: z.number().int().min(1),
  effective_from: isoDate,
  ops: z.array(RoutineSaveOp).max(200),
});

/** Flow 09: every block and one-off moves from `from` to `to`, then `from` goes away (one transaction). */
export const CategoryMergeMutation = z.strictObject({
  ...base,
  entity: z.literal('category_merge'),
  from: z.uuid(),
  to: z.uuid(),
  from_version: z.number().int().min(1),
  to_version: z.number().int().min(1),
});
/** Undo of a merge, within 10 minutes of it (Flow 09). */
export const CategoryUnmergeMutation = z.strictObject({
  ...base,
  entity: z.literal('category_unmerge'),
  merge_id: z.uuid(),
});
/** Flow 09 delete: blocks move to `reassign_to`, or end from today (`delete_blocks`); never both. */
export const CategoryDeleteMutation = z
  .strictObject({
    ...base,
    entity: z.literal('category_delete'),
    id: z.uuid(),
    base_version: z.number().int().min(1),
    reassign_to: z.uuid().optional(),
    delete_blocks: z.literal(true).optional(),
  })
  .refine((m) => !(m.reassign_to && m.delete_blocks), 'Pick where the blocks go, or delete them.');

export const Mutation = z.discriminatedUnion('entity', [
  simple('override', OverrideFields),
  simple('category', CategoryFields),
  simple('term', TermFields),
  simple('routine_block', RoutineBlockFields),
  z.strictObject({
    ...base,
    entity: z.literal('profile'),
    op: z.literal('upsert'),
    base_version: z.number().int().min(0),
    fields: ProfileFields,
  }),
  RoutineBlockEditMutation,
  RoutineSaveMutation,
  CategoryMergeMutation,
  CategoryUnmergeMutation,
  CategoryDeleteMutation,
]);
export type Mutation = z.infer<typeof Mutation>;

export const PushBody = z.strictObject({ mutations: z.array(Mutation).min(1).max(100) });

export const MutationResult = z.object({
  client_mutation_id: z.uuid(),
  status: z.enum(['applied', 'conflict', 'rejected']),
  error_code: z.string().optional(),
  message: z.string().optional(),
  /** applied → the new row; conflict → the current server row. */
  row: z.record(z.string(), z.unknown()).nullable().optional(),
  entity: z.string().optional(),
  revision: z.number().int().optional(),
  /** category_merge: the merge to pass to category_unmerge, and how many routine blocks moved. */
  merge_id: z.uuid().optional(),
  moved: z.number().int().optional(),
});
export type MutationResult = z.infer<typeof MutationResult>;
export const PushResponse = z.object({
  revision: z.number().int(),
  results: z.array(MutationResult),
});
