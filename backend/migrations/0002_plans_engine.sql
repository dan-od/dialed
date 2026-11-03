-- Flow 06: plan engine columns (provider_mode, checks, step, background retry).
ALTER TABLE plans
  ADD COLUMN provider_mode text CHECK (provider_mode IN ('server','byo')),
  ADD COLUMN checks_json   jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN step          smallint NOT NULL DEFAULT 0,
  ADD COLUMN bg_retry_at   timestamptz;

CREATE INDEX plans_user_status_idx ON plans(user_id, status);
CREATE INDEX plans_drafting_sweep_idx ON plans(created_at) WHERE status = 'drafting';
