# Gate 2 — foundation execution

Run 2026-10-21T05:37Z on the owner's Mac (macOS 27.2, OrbStack, Node 22.23.3), commit e080c57 + the readiness fix in this commit. Clean start: no `.env`, no dev key, empty Postgres volume.

```text
## bootstrap run 1 (clean: no .env, no key, empty volume)
[dialed] Checking tools
[dialed] node v22.23.3 · pnpm 9.15.9 · Docker version 29.8.2 (OrbStack)
[dialed] Writing .env (dev values, 0600)
[dialed] Generating dev JWT signing key (.secrets/, git-ignored)
[dialed] Installing dependencies (frozen lockfile)
[dialed] Starting Postgres 16 (compose, 127.0.0.1:55432)
[dialed] Migrating
[dialed] Seeding (owner, alice, bob; dev password hashed with argon2id)
{"ok":true,"created_files":[".env",".secrets/jwt-ed25519.pem"],"migrate":{"ok":true,"applied":["0001_init"],"skipped":[]},"seed":{"ok":true,"counts":{"routine_blocks":61,"overrides":12,"categories":27,"users":3,"plans":1}},"state_before":"empty","state_after":"cab703d9bd4a68a30c569ea69c301250","changed":true,"schema_fingerprint":"d96f06751cffd5dea494920ebb5fe11d"}
exit=0
## bootstrap run 2
[dialed] Checking tools
[dialed] node v22.23.3 · pnpm 9.15.9 · Docker version 29.8.2 (OrbStack)
[dialed] Installing dependencies (frozen lockfile)
[dialed] Starting Postgres 16 (compose, 127.0.0.1:55432)
[dialed] Migrating
[dialed] Seeding (owner, alice, bob; dev password hashed with argon2id)
{"ok":true,"created_files":[],"migrate":{"ok":true,"applied":[],"skipped":["0001_init"]},"seed":{"ok":true,"counts":{"routine_blocks":61,"overrides":12,"categories":27,"users":3,"plans":1}},"state_before":"cab703d9bd4a68a30c569ea69c301250","state_after":"cab703d9bd4a68a30c569ea69c301250","changed":false,"schema_fingerprint":"d96f06751cffd5dea494920ebb5fe11d"}
exit=0
```

Second run: `state_before == state_after` (`changed: false`), nothing created, migration skipped.

```text
## migration_replay
{"started_at":"2026-10-21T05:37:15.672Z","database":"dialed_replay_17456","migrations":[{"version":"0001_init","sha256":"8e42714feb2925395d171b025bc56895a2f4ad3f023b2424ffac6ab4355c5a09"}],"first_run":{"applied":["0001_init"],"skipped":[]},"second_run":{"applied":[],"skipped":["0001_init"]},"fingerprint":"d96f06751cffd5dea494920ebb5fe11d","expected_fingerprint":"d96f06751cffd5dea494920ebb5fe11d","fingerprint_matches":true,"second_run_applied_nothing":true,"tampered_checksum_refused":true,"tamper_message":"Refusing to run: applied migration 0001_init changed on disk (checksum mismatch). Write a
exit=0

## auth_smoke
PASS       unauthenticated_denied  [no_token_401=true expired_token_401_token_expired=true forged_token_401=true]
UNVERIFIED wrong_role_denied  [app_token_at_mcp_401=true mcp_token_at_sync_push_denied=null mcp_token_at_plan_approve_denied=null]
UNVERIFIED cross_object_denied  [sync_push_bob_routine_block_rejected_not_found=true sync_push_override_on_bob_block_rejected_not_found=true sync_pull_never_returns_bob_rows=true get_bob_plan_404=null mcp_get_schedule_never_returns_bob=null]
report: /Users/ds/Documents/Codes/dialed/evidence/verification/authorization.json
exit=0
```

| Check | Result |
|---|---|
| bootstrap ×2 (second changes nothing) | PASS |
| migration_replay (fingerprint d96f0675…, replay-safe, tamper refused) | PASS |
| auth_smoke unauthenticated_denied | PASS |
| auth_smoke wrong_role_denied | UNVERIFIED — app-token-at-/mcp passes; MCP-token sub-checks need Flow 07 |
| auth_smoke cross_object_denied | UNVERIFIED — sync sub-checks pass; plans need Flow 06, MCP needs Flow 07 |
