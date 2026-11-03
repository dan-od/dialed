import { z } from 'zod';

const isoDate = z.iso.date();

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayName = (typeof WEEKDAYS)[number];
const weekday = z.enum(WEEKDAYS);

/** Design_Identity palette names (mcp/tools.md); server maps to a dark/light colour pair. */
export const PALETTE_NAMES = [
  'Orange',
  'Amber',
  'Wheat',
  'Coral',
  'Blue',
  'Teal',
  'Lime',
  'Mint',
  'Sky',
  'Rose',
  'Sand',
] as const;
const palette = z.enum(PALETTE_NAMES);

/** "HH:MM" 24h wall-clock on a 5-minute grid; "24:00" stands for midnight (1440). */
const hhmm = z.string().refine((v) => {
  const m = /^([0-1]\d|2[0-4]):([0-5]\d)$/.exec(v);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24 && min !== 0) return false;
  return min % 5 === 0;
}, 'Use 24-hour HH:MM on a 5-minute grid.');

/** Category id, temp id ("c1") or block ref — not always a uuid (fixtures use "seed:…" refs). */
const refId = z.string().trim().min(1).max(100);
const title = z.string().trim().min(1).max(80);
const note = z.string().trim().min(1).max(200);

const NewCategory = z.strictObject({
  temp_id: refId,
  name: z.string().trim().min(1).max(40),
  group: z.string().trim().min(1).max(30),
  palette,
});

const NewTerm = z.strictObject({
  temp_id: refId,
  name: z.string().trim().min(1).max(40),
  starts_on: isoDate,
  ends_on: isoDate,
});

const Repeat = z.strictObject({
  weekday,
  from: isoDate,
  until: isoDate,
});
export type Repeat = z.infer<typeof Repeat>;

const ChangedFields = z
  .strictObject({
    title: title.optional(),
    start: hhmm.optional(),
    end: hhmm.optional(),
    category_id: refId.optional(),
  })
  .refine((f) => Object.keys(f).length > 0, 'Change at least one field.');

const CreateCategoryChange = z.strictObject({
  kind: z.literal('create_category'),
  title,
  new_category: NewCategory,
  note,
});

const CreateTermChange = z.strictObject({
  kind: z.literal('create_term'),
  title,
  new_term: NewTerm,
  note,
});

/** Term date edit applied inside Approve (Flow 02 "Found N classes" term fields). */
const UpdateTermChange = z.strictObject({
  kind: z.literal('update_term'),
  title,
  term_id: refId,
  starts_on: isoDate,
  ends_on: isoDate,
  note,
});

const NewChange = z.strictObject({
  kind: z.literal('new'),
  title,
  category_id: refId,
  repeat: Repeat.optional(),
  on_date: isoDate.optional(),
  start: hhmm,
  end: hhmm,
  note,
});

const MovedChange = z.strictObject({
  kind: z.literal('moved'),
  title,
  block_ref: refId,
  close_from: isoDate.optional(),
  repeat: Repeat.optional(),
  to_weekday: weekday.optional(),
  on_date: isoDate.optional(),
  to_date: isoDate.optional(),
  start: hhmm.optional(),
  end: hhmm.optional(),
  note,
});

const ChangedChange = z.strictObject({
  kind: z.literal('changed'),
  title,
  block_ref: refId,
  from: isoDate.optional(),
  on_date: isoDate.optional(),
  fields: ChangedFields,
  note,
});

const RemovedChange = z.strictObject({
  kind: z.literal('removed'),
  title,
  block_ref: refId,
  from: isoDate,
  note,
});

const SkipChange = z.strictObject({
  kind: z.literal('skip'),
  title,
  block_ref: refId,
  on_date: isoDate,
  note,
});

/** mcp/tools.md `propose_changes.changes[]`, one entry — the wire shape an AI sends. */
export const PlanChange = z
  .discriminatedUnion('kind', [
    CreateCategoryChange,
    CreateTermChange,
    UpdateTermChange,
    NewChange,
    MovedChange,
    ChangedChange,
    RemovedChange,
    SkipChange,
  ])
  .superRefine((change, ctx) => {
    const xor = (a: unknown, b: unknown) => (a != null) !== (b != null);
    if (change.kind === 'new' && !xor(change.repeat, change.on_date)) {
      ctx.addIssue({
        code: 'custom',
        message: 'A new block needs exactly one of repeat or on_date.',
      });
    }
    if (change.kind === 'moved') {
      if (!xor(change.repeat, change.on_date)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A moved block needs exactly one of repeat or on_date.',
        });
      } else if (change.repeat && !change.to_weekday) {
        ctx.addIssue({ code: 'custom', message: 'A repeating move needs to_weekday.' });
      } else if (change.on_date && !change.to_date) {
        ctx.addIssue({ code: 'custom', message: 'A one-off move needs to_date.' });
      }
    }
    if (change.kind === 'changed' && !xor(change.from, change.on_date)) {
      ctx.addIssue({ code: 'custom', message: 'A change needs exactly one of from or on_date.' });
    }
  });
export type PlanChange = z.infer<typeof PlanChange>;

export const PLAN_CHANGE_KINDS = [
  'new',
  'moved',
  'changed',
  'removed',
  'skip',
  'create_category',
  'create_term',
  'update_term',
] as const;

export const PlanCheck = z.strictObject({
  id: z.string().trim().min(1).max(60),
  passed: z.boolean(),
  detail: z.string().max(200),
});
export type PlanCheck = z.infer<typeof PlanCheck>;

/** mcp/tools.md `propose_changes` input — same shape used by the in-app tool loop. */
export const ProposeChangesInput = z.strictObject({
  proposal_id: z.uuid().optional(),
  request_text: z.string().trim().min(1).max(4000),
  changes: z.array(PlanChange).min(1).max(60),
  checks: z.array(PlanCheck).max(50).default([]),
});
export type ProposeChangesInput = z.infer<typeof ProposeChangesInput>;

export const ProposeChangesError = z.object({
  /** -1 = the whole plan (too_many_changes, range_too_long), not one change. */
  change_index: z.number().int().min(-1),
  code: z.string(),
  message: z.string(),
});
export type ProposeChangesError = z.infer<typeof ProposeChangesError>;

export const ProposeChangesOutput = z.object({
  proposal_id: z.uuid(),
  status: z.enum(['ready', 'invalid']),
  errors: z.array(ProposeChangesError),
  review_hint: z.string(),
});
export type ProposeChangesOutput = z.infer<typeof ProposeChangesOutput>;

// ----- plan entity (BACKEND_SETUP §3 lifecycle, 0001_init.sql) -----

export const PLAN_SOURCES = ['in_app', 'mcp', 'timetable', 'calendar'] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export const PLAN_STATUSES = [
  'drafting',
  'question',
  'ready',
  'approved',
  'discarded',
  'failed',
  'stale',
  'cancelled',
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_MESSAGE_ROLES = ['question', 'answer', 'reply'] as const;

export const PlanChangeRow = z.object({
  id: z.uuid(),
  ord: z.number().int(),
  kind: z.enum(PLAN_CHANGE_KINDS),
  title: z.string(),
  payload: z.record(z.string(), z.unknown()),
  note: z.string(),
  enabled: z.boolean(),
  validation: z.record(z.string(), z.unknown()),
});
export type PlanChangeRow = z.infer<typeof PlanChangeRow>;

export const PlanMessage = z.object({
  id: z.uuid(),
  role: z.enum(PLAN_MESSAGE_ROLES),
  body: z.string(),
  options: z.array(z.string()).optional(),
  created_at: z.iso.datetime(),
});
export type PlanMessage = z.infer<typeof PlanMessage>;

/** "What this does to your week" row (one per touched day, plus Weekend and Week). */
export const PlanImpactRow = z.object({
  label: z.string(),
  before: z.string(),
  after: z.string(),
});
export type PlanImpactRow = z.infer<typeof PlanImpactRow>;

export const PlanDTO = z.object({
  id: z.uuid(),
  source: z.enum(PLAN_SOURCES),
  provider: z.string(),
  client_name: z.string().nullable(),
  request_text: z.string(),
  status: z.enum(PLAN_STATUSES),
  version: z.number().int(),
  base_revision: z.number().int(),
  changes: z.array(PlanChangeRow),
  messages: z.array(PlanMessage),
  checks: z.array(PlanCheck),
  impact: z.array(PlanImpactRow),
  error_code: z.string().nullable(),
  created_at: z.iso.datetime(),
  ready_at: z.iso.datetime().nullable(),
  decided_at: z.iso.datetime().nullable(),
});
export type PlanDTO = z.infer<typeof PlanDTO>;

export const PlanSummary = z.object({
  id: z.uuid(),
  source: z.enum(PLAN_SOURCES),
  client_name: z.string().nullable(),
  request_text: z.string(),
  status: z.enum(PLAN_STATUSES),
  created_at: z.iso.datetime(),
  change_count: z.number().int(),
});
export type PlanSummary = z.infer<typeof PlanSummary>;

// ----- request bodies (BACKEND_SETUP §5) -----

export const PROVIDER_IDS = ['anthropic', 'openai', 'gemini', 'custom'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const CreatePlanBody = z.strictObject({
  source: z.literal('in_app'),
  request_text: z.string().trim().min(1).max(4000),
  provider_mode: z.enum(['server', 'byo']),
  provider: z.enum(PROVIDER_IDS).optional(),
  answer_to: z.uuid().optional(),
});
export type CreatePlanBody = z.infer<typeof CreatePlanBody>;

export const AnswerPlanBody = z
  .strictObject({
    option: z.string().trim().min(1).max(200).optional(),
    text: z.string().trim().min(1).max(2000).optional(),
  })
  .refine(
    (b) => (b.option ? 1 : 0) + (b.text ? 1 : 0) === 1,
    'Send exactly one of option or text.',
  );
export type AnswerPlanBody = z.infer<typeof AnswerPlanBody>;

export const ReplyPlanBody = z.strictObject({
  text: z.string().trim().min(1).max(2000),
});
export type ReplyPlanBody = z.infer<typeof ReplyPlanBody>;

export const TogglePlanChangeBody = z.strictObject({
  enabled: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type TogglePlanChangeBody = z.infer<typeof TogglePlanChangeBody>;

export const ApprovePlanBody = z.strictObject({
  plan_version: z.number().int().min(1),
});
export type ApprovePlanBody = z.infer<typeof ApprovePlanBody>;

export const RecentPlansQuery = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(10),
});
export type RecentPlansQuery = z.infer<typeof RecentPlansQuery>;
