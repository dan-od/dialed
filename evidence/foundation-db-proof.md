# Foundation database proof

Run on 2026-10-20 in the foundation workspace (not the product repo) against a real PostgreSQL 16 server, after the cold-review fixes.

```text
fresh DB replay_a: migrate 0001 ok, fingerprint d96f06751cffd5dea494920ebb5fe11d
fresh DB replay_b: migrate 0001 ok, fingerprint d96f06751cffd5dea494920ebb5fe11d
re-run 0001 on existing schema: refused inside its transaction, DB unchanged (expected; scripts/migrate skips applied versions via schema_migrations)
seed run 1: ok — 61 routine blocks, 12 overrides, 27 categories, 3 users, 1 plans
seed run 2: ok — 61 routine blocks, 12 overrides, 27 categories, 3 users, 1 plans
owner weekly work hours (non-quiet): 64.25 (displayed 64.3, half-up)
composite FK check (alice block → bob category must fail): violates foreign key constraint
psql (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
```

- Migration replays from zero deterministically: two fresh databases give the same fingerprint, recorded in verification/schema.fingerprint.
- Re-running 0001 on an existing schema fails inside its transaction and changes nothing; scripts/migrate must skip applied versions using schema_migrations (which the runner owns).
- Seed is idempotent (fixed UUIDs + ON CONFLICT DO NOTHING); owner week = 64.25 h → 64.3 h displayed, matching the prototype.
- Composite (id, user_id) foreign keys reject cross-user references at the database level.
- Not proven here: bootstrap script, auth_smoke, API — created in Batch 0 (Gate 2 UNVERIFIED until then).
