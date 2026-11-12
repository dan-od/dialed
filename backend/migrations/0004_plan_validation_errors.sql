-- Flow 06: the last validation round's errors on a plan, so the app can say why a draft failed.
BEGIN;

ALTER TABLE plans
  ADD COLUMN validation_errors_json jsonb;

COMMIT;
