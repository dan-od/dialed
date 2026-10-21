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
});

const simple = <E extends string, F extends z.ZodType>(entity: E, fields: F) =>
  z.strictObject({
    ...base,
    entity: z.literal(entity),
    op: z.enum(['upsert', 'delete']),
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
});

export const Mutation = z.discriminatedUnion('entity', [
  simple('override', OverrideFields),
  simple('category', CategoryFields),
  simple('term', TermFields),
  z.strictObject({
    ...base,
    entity: z.literal('profile'),
    op: z.literal('upsert'),
    base_version: z.number().int().min(0),
    fields: ProfileFields,
  }),
  RoutineBlockEditMutation,
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
});
export type MutationResult = z.infer<typeof MutationResult>;
export const PushResponse = z.object({
  revision: z.number().int(),
  results: z.array(MutationResult),
});
