-- 0001_init.sql — Dialed initial schema (PostgreSQL 16).
-- Frozen once applied anywhere. Changes go in new forward migrations.
BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- schema_migrations is created and maintained by scripts/migrate (not by migrations).

-- ---------- identity ----------
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext UNIQUE,
  email_verified_at timestamptz,
  password_hash     text,
  display_name      text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80),
  time_zone         text NOT NULL DEFAULT 'America/Toronto',
  day_start_min     int  NOT NULL DEFAULT 540  CHECK (day_start_min BETWEEN 0 AND 1439),
  day_end_min       int  NOT NULL DEFAULT 1440 CHECK (day_end_min BETWEEN 1 AND 1440),
  quiet_start_min   int  NOT NULL DEFAULT 0    CHECK (quiet_start_min BETWEEN 0 AND 1439),
  quiet_end_min     int  NOT NULL DEFAULT 540  CHECK (quiet_end_min BETWEEN 0 AND 1440),
  week_start        smallint NOT NULL DEFAULT 0 CHECK (week_start BETWEEN 0 AND 6),   -- 0 = Monday
  theme             text NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  profile_json      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- priorities, limits, custom phrases for the planning guide
  ai_mode           text NOT NULL DEFAULT 'server' CHECK (ai_mode IN ('server','own')),
  ai_provider       text NOT NULL DEFAULT 'anthropic' CHECK (ai_provider IN ('anthropic','openai','gemini','compatible')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  version           int NOT NULL DEFAULT 1,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (day_end_min > day_start_min)
);

CREATE TABLE apple_identities (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  apple_sub          text NOT NULL UNIQUE,
  email_relay        citext,
  refresh_token_enc  bytea,           -- AES-256-GCM with APPLE_TOKEN_ENC_KEY; used only to revoke on delete
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invites (
  email       citext PRIMARY KEY,
  invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id           uuid NOT NULL,
  refresh_token_hash  text NOT NULL UNIQUE,
  device_id           uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_used_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  replaced_by         uuid REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_family_idx ON sessions(family_id);

CREATE TABLE email_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       citext NOT NULL,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash   text NOT NULL,
  attempts    int  NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_codes_lookup_idx ON email_codes(email, purpose) WHERE consumed_at IS NULL;

CREATE TABLE devices (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform                   text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios','android')),
  apns_token                 text,
  live_activity_start_token  text,
  app_version                text,
  prefs_json                 jsonb NOT NULL DEFAULT '{}'::jsonb,  -- lock_mode, line_on, heads_up_min, meal_notes, daily_cap, plan_pushes (quiet hours live on users)
  last_seen_at               timestamptz NOT NULL DEFAULT now(),
  created_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_user_idx ON devices(user_id);

-- ---------- schedule ----------
CREATE TABLE revisions (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision    bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  group_name   text NOT NULL CHECK (char_length(group_name) BETWEEN 1 AND 30),
  color_dark   text NOT NULL CHECK (color_dark ~ '^#[0-9A-Fa-f]{6}$'),
  color_light  text NOT NULL CHECK (color_light ~ '^#[0-9A-Fa-f]{6}$'),
  weight       numeric(3,2) NOT NULL DEFAULT 0.75 CHECK (weight BETWEEN 0.1 AND 1),   -- visual bar height share
  quiet        boolean NOT NULL DEFAULT false,
  protected    boolean NOT NULL DEFAULT false,   -- classes: AI may not move/remove unless named
  sort         int NOT NULL DEFAULT 0,
  version      int NOT NULL DEFAULT 1,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE UNIQUE INDEX categories_name_uniq ON categories(user_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE terms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  is_draft    boolean NOT NULL DEFAULT false,
  version     int NOT NULL DEFAULT 1,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX terms_user_idx ON terms(user_id, starts_on) WHERE deleted_at IS NULL;

CREATE TABLE routines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id     uuid NOT NULL UNIQUE,
  name        text NOT NULL,
  version     int NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (term_id, user_id) REFERENCES terms(id, user_id) ON DELETE CASCADE
);

CREATE TABLE routine_blocks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id      uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday         smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),     -- 0 = Monday
  start_min       int NOT NULL CHECK (start_min BETWEEN 0 AND 1435),
  end_min         int NOT NULL CHECK (end_min BETWEEN 5 AND 1440),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  category_id     uuid NOT NULL,
  effective_from  date NOT NULL,
  effective_to    date,
  source          text NOT NULL DEFAULT 'user' CHECK (source IN ('user','plan','timetable','calendar','seed')),
  version         int NOT NULL DEFAULT 1,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (routine_id, user_id) REFERENCES routines(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id),
  CHECK (end_min > start_min),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX routine_blocks_lookup_idx ON routine_blocks(routine_id, weekday) WHERE deleted_at IS NULL;

CREATE TABLE plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source         text NOT NULL CHECK (source IN ('in_app','mcp','timetable','calendar')),
  provider       text NOT NULL,
  client_name    text,
  request_text   text NOT NULL CHECK (char_length(request_text) <= 4000),
  status         text NOT NULL DEFAULT 'drafting'
                 CHECK (status IN ('drafting','question','ready','approved','discarded','failed','stale','cancelled')),
  base_revision  bigint NOT NULL,
  version        int NOT NULL DEFAULT 1,            -- bumped on every revise/toggle; Approve must send it
  proposal_id    uuid,                              -- MCP revisions use the same proposal_id
  idempotency_key text,
  range_from     date,                              -- dates the plan touches (staleness scope)
  range_to       date,
  attempts       int NOT NULL DEFAULT 0,
  error_code     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  ready_at       timestamptz,
  decided_at     timestamptz,
  UNIQUE (id, user_id),
  UNIQUE (user_id, idempotency_key)
);
CREATE UNIQUE INDEX plans_proposal_uniq ON plans(user_id, proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX plans_user_recent_idx ON plans(user_id, created_at DESC);

CREATE TABLE plan_changes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  ord              int NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('new','moved','changed','removed','skip','create_category','create_term','update_term')),
  title            text NOT NULL,
  payload_json     jsonb NOT NULL,
  note             text NOT NULL DEFAULT '',
  enabled          boolean NOT NULL DEFAULT true,
  validation_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (plan_id, ord)
);

CREATE TABLE overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  on_date           date NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('skip','modify','add','move')),
  routine_block_id  uuid,
  title             text CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 80),
  start_min         int CHECK (start_min IS NULL OR start_min BETWEEN 0 AND 1435),
  end_min           int CHECK (end_min IS NULL OR end_min BETWEEN 5 AND 1440),
  category_id       uuid,
  moved_to_date     date,
  note              text,
  source            text NOT NULL DEFAULT 'user' CHECK (source IN ('user','plan','calendar')),
  plan_id           uuid REFERENCES plans(id) ON DELETE SET NULL,
  version           int NOT NULL DEFAULT 1,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (routine_block_id, user_id) REFERENCES routine_blocks(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id),
  CHECK (kind = 'add' OR routine_block_id IS NOT NULL),
  CHECK (kind <> 'move' OR moved_to_date IS NOT NULL),
  CHECK (start_min IS NULL OR end_min IS NULL OR end_min > start_min)
);
CREATE INDEX overrides_user_date_idx ON overrides(user_id, on_date) WHERE deleted_at IS NULL;

CREATE TABLE plan_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('question','answer','reply')),
  body          text NOT NULL CHECK (char_length(body) <= 2000),
  options_json  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- sync ----------
CREATE TABLE change_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision    bigint NOT NULL,
  entity      text NOT NULL CHECK (entity IN ('category','term','routine','routine_block','override','plan','profile')),  -- every server-side write appends here (sync push, approve, signup defaults, merges)
  entity_id   uuid NOT NULL,
  op          text NOT NULL CHECK (op IN ('upsert','delete')),
  row_json    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_log_pull_idx ON change_log(user_id, revision);

CREATE TABLE mutation_receipts (
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_mutation_id  uuid NOT NULL,
  result_json         jsonb NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_mutation_id)
);

-- ---------- live activities ----------
CREATE TABLE live_activities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_key      text NOT NULL,              -- '<routine_block_id|override_id>:<YYYY-MM-DD>'
  push_token     text,                       -- per-activity update/end token reported by the device
  state          text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled','started','ended','dismissed')),
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, block_key)
);

-- ---------- category merges (undo window) ----------
CREATE TABLE category_merges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_category_id uuid NOT NULL,
  to_category_id   uuid NOT NULL,
  moved_json       jsonb NOT NULL,           -- {routine_block_ids:[], override_ids:[]}
  created_at       timestamptz NOT NULL DEFAULT now(),
  undone_at        timestamptz,
  FOREIGN KEY (from_category_id, user_id) REFERENCES categories(id, user_id),
  FOREIGN KEY (to_category_id, user_id) REFERENCES categories(id, user_id)
);

-- ---------- jobs, usage, audit ----------
CREATE TABLE jobs (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,
  dedupe_key   text UNIQUE,
  run_at       timestamptz NOT NULL DEFAULT now(),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','dead')),
  attempts     int NOT NULL DEFAULT 0,
  lease_until  timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_due_idx ON jobs(run_at) WHERE status IN ('queued','failed');

CREATE TABLE usage_counters (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  plan_runs   int NOT NULL DEFAULT 0,
  imports     int NOT NULL DEFAULT 0,
  tokens_in   bigint NOT NULL DEFAULT 0,
  tokens_out  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  actor       text NOT NULL,              -- 'user' | 'system' | 'ai:<client>'
  action      text NOT NULL,
  target      text,
  meta_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_user_idx ON audit_log(user_id, created_at DESC);

-- ---------- MCP OAuth ----------
CREATE TABLE oauth_clients (
  id             text PRIMARY KEY,                  -- generated client_id
  name           text NOT NULL CHECK (char_length(name) <= 80),
  redirect_uris  text[] NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oauth_codes (
  code_hash        text PRIMARY KEY,
  client_id        text NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri     text NOT NULL,
  code_challenge   text NOT NULL,
  scope            text NOT NULL,
  expires_at       timestamptz NOT NULL,
  consumed_at      timestamptz
);

CREATE TABLE oauth_tokens (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           text NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token_hash   text NOT NULL UNIQUE,
  refresh_token_hash  text UNIQUE,
  scope               text NOT NULL,
  expires_at          timestamptz NOT NULL,
  refresh_expires_at  timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_tokens_user_idx ON oauth_tokens(user_id) WHERE revoked_at IS NULL;

COMMIT;
