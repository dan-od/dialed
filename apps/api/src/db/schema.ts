// Drizzle table definitions mirroring backend/migrations/0001_init.sql (the SQL file is the source of truth).
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
const day = (name: string) => date(name, { mode: 'string' });

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: citext('email'),
  email_verified_at: ts('email_verified_at'),
  password_hash: text('password_hash'),
  display_name: text('display_name').notNull().default(''),
  time_zone: text('time_zone').notNull().default('America/Toronto'),
  day_start_min: integer('day_start_min').notNull().default(540),
  day_end_min: integer('day_end_min').notNull().default(1440),
  quiet_start_min: integer('quiet_start_min').notNull().default(0),
  quiet_end_min: integer('quiet_end_min').notNull().default(540),
  week_start: smallint('week_start').notNull().default(0),
  theme: text('theme').notNull().default('system'),
  profile_json: jsonb('profile_json').notNull().default({}),
  ai_mode: text('ai_mode').notNull().default('server'),
  ai_provider: text('ai_provider').notNull().default('anthropic'),
  status: text('status').notNull().default('active'),
  version: integer('version').notNull().default(1),
  deleted_at: ts('deleted_at'),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const invites = pgTable('invites', {
  email: citext('email').primaryKey(),
  invited_by: uuid('invited_by'),
  used_at: ts('used_at'),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').notNull(),
  family_id: uuid('family_id').notNull(),
  refresh_token_hash: text('refresh_token_hash').notNull(),
  device_id: uuid('device_id'),
  created_at: ts('created_at').notNull().defaultNow(),
  last_used_at: ts('last_used_at').notNull().defaultNow(),
  expires_at: ts('expires_at').notNull(),
  revoked_at: ts('revoked_at'),
  replaced_by: uuid('replaced_by'),
});

export const emailCodes = pgTable('email_codes', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: citext('email').notNull(),
  user_id: uuid('user_id'),
  purpose: text('purpose').notNull(),
  code_hash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expires_at: ts('expires_at').notNull(),
  consumed_at: ts('consumed_at'),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const devices = pgTable('devices', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').notNull(),
  platform: text('platform').notNull().default('ios'),
  apns_token: text('apns_token'),
  live_activity_start_token: text('live_activity_start_token'),
  app_version: text('app_version'),
  prefs_json: jsonb('prefs_json').notNull().default({}),
  last_seen_at: ts('last_seen_at').notNull().defaultNow(),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const revisions = pgTable('revisions', {
  user_id: uuid('user_id').primaryKey(),
  revision: bigint('revision', { mode: 'number' }).notNull().default(0),
  updated_at: ts('updated_at').notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').notNull(),
  name: text('name').notNull(),
  group_name: text('group_name').notNull(),
  color_dark: text('color_dark').notNull(),
  color_light: text('color_light').notNull(),
  weight: numeric('weight', { mode: 'number' }).notNull().default(0.75),
  quiet: boolean('quiet').notNull().default(false),
  protected: boolean('protected').notNull().default(false),
  sort: integer('sort').notNull().default(0),
  version: integer('version').notNull().default(1),
  deleted_at: ts('deleted_at'),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const terms = pgTable('terms', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').notNull(),
  name: text('name').notNull(),
  starts_on: day('starts_on').notNull(),
  ends_on: day('ends_on').notNull(),
  is_draft: boolean('is_draft').notNull().default(false),
  version: integer('version').notNull().default(1),
  deleted_at: ts('deleted_at'),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const routines = pgTable('routines', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').notNull(),
  term_id: uuid('term_id').notNull(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const routineBlocks = pgTable('routine_blocks', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routine_id: uuid('routine_id').notNull(),
  user_id: uuid('user_id').notNull(),
  weekday: smallint('weekday').notNull(),
  start_min: integer('start_min').notNull(),
  end_min: integer('end_min').notNull(),
  title: text('title').notNull(),
  category_id: uuid('category_id').notNull(),
  effective_from: day('effective_from').notNull(),
  effective_to: day('effective_to'),
  source: text('source').notNull().default('user'),
  version: integer('version').notNull().default(1),
  deleted_at: ts('deleted_at'),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const overrides = pgTable('overrides', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').notNull(),
  on_date: day('on_date').notNull(),
  kind: text('kind').notNull(),
  routine_block_id: uuid('routine_block_id'),
  title: text('title'),
  start_min: integer('start_min'),
  end_min: integer('end_min'),
  category_id: uuid('category_id'),
  moved_to_date: day('moved_to_date'),
  note: text('note'),
  source: text('source').notNull().default('user'),
  plan_id: uuid('plan_id'),
  version: integer('version').notNull().default(1),
  deleted_at: ts('deleted_at'),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const plans = pgTable('plans', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  user_id: uuid('user_id').notNull(),
  source: text('source').notNull(),
  provider: text('provider').notNull(),
  client_name: text('client_name'),
  request_text: text('request_text').notNull(),
  status: text('status').notNull(),
  base_revision: bigint('base_revision', { mode: 'number' }).notNull(),
  version: integer('version').notNull().default(1),
  created_at: ts('created_at').notNull().defaultNow(),
  ready_at: ts('ready_at'),
  decided_at: ts('decided_at'),
});

export const changeLog = pgTable('change_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  user_id: uuid('user_id').notNull(),
  revision: bigint('revision', { mode: 'number' }).notNull(),
  entity: text('entity').notNull(),
  entity_id: uuid('entity_id').notNull(),
  op: text('op').notNull(),
  row_json: jsonb('row_json'),
  created_at: ts('created_at').notNull().defaultNow(),
});

export const mutationReceipts = pgTable(
  'mutation_receipts',
  {
    user_id: uuid('user_id').notNull(),
    client_mutation_id: uuid('client_mutation_id').notNull(),
    result_json: jsonb('result_json').notNull(),
    created_at: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.client_mutation_id] })],
);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  user_id: uuid('user_id'),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  meta_json: jsonb('meta_json').notNull().default({}),
  created_at: ts('created_at').notNull().defaultNow(),
});
