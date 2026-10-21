# BUILD_AGENT.md — operating prompt for Claude Code

## Mandate
Build Dialed v1 from this foundation, flow by flow, to a TestFlight-ready state on the owner's Mac, with proof. You orchestrate; you may use subagents for bounded research/review, but you own contracts and integration.

## Required reading (in order, completely)
`AGENTS.md` → `00_Brief_Analysis.md` → `CONTEXT.md` → `PROJECT_BIBLE.md` → `00_Flow_Map.md` → `00_Flow_Contracts.md` → `SECURITY.md` → `BACKEND_SETUP.md` → `Design_Identity/design-identity.md` → `mcp/tools.md` → the flow file(s) for the current batch and their `Sub_Interactions`. Open `assets/references/dialed-flow-prototype.html` in a browser for every UI flow.

## Conflict hierarchy
As in `AGENTS.md`.

## Blank-repository bootstrap (Batch 0)
1. Verify tools: Node 22 LTS, pnpm, Docker Desktop, Xcode (+ iOS Simulator runtime), CocoaPods/Ruby as Expo requires, Watchman. Record versions in `BACKEND_SETUP.md §Versions`.
2. Create the monorepo per `BACKEND_SETUP.md §2`: `apps/mobile` via `npx create-expo-app@latest` (TypeScript, Expo Router), `apps/api` (Fastify + Zod + pino + Drizzle), `packages/{schedule,contracts,planning,tokens}`. Copy this foundation's `backend/`, `mcp/`, `assets/`, docs into the repo root unchanged.
3. Infra: `infra/docker-compose.yml` with `postgres:16` (no published port in prod profile; 55432 in dev), `api`, `worker`, `migrate` (one-shot), `cloudflared` (prod profile only), `backup` (prod profile).
4. Scripts (project-owned, executable, documented in root `package.json`): `scripts/bootstrap` (idempotent: deps, compose up postgres, migrate, seed with hashed dev password `dialed-dev-password` for owner/alice/bob), `scripts/migrate` (applies `backend/migrations/*.sql` in order, records SHA-256 in `schema_migrations`, refuses if an applied checksum changed), `scripts/migration_replay` (fresh DB → migrate twice-safe → schema fingerprint compare with `verification/schema.fingerprint`), `scripts/auth_smoke` (writes `$FLOW_BY_FLOW_REPORT_DIR/authorization.json` per `verification/commands.json`, exercising real tokens), `scripts/runtime_proof` (starts API, runs scripted API journeys, writes declared evidence + `evidence/migration-state.json`).
5. CI (GitHub Actions or local `pnpm ci`): format, lint, typecheck, unit tests, api tests against a Postgres service, `migration_replay`, `auth_smoke`, secret scan (gitleaks), dependency audit (`pnpm audit --prod`), `expo prebuild --clean` check, `xcodebuild` of the widget target (macOS runner, optional until Flow 08).
6. Local adapters: `EMAIL_TRANSPORT=console`, `APNS_MODE=log`, `AI_MODE=fixture` with fixtures under `backend/seed/fixtures/` (Bible-study plan, question, failure, timetable REF-002 → 6 classes).
7. Prove: clean checkout → `scripts/bootstrap` twice → `scripts/migration_replay` → `scripts/auth_smoke` (Gate 2 — after Flow 01 endpoints exist, auth_smoke becomes real; before that it must fail honestly, not fake a pass).

## Dependency order
Main line: 0-scaffold → shared-foundation → 01 → 03 → 04 → 05 → 09 → 06 → 02 → 07 (`00_Flow_Map.md`). Parallel native track: 08 after 05 (Simulator-provable parts first; push-to-start, APNs, haptics and Apple sign-in need Apple Developer enrolment + a physical iPhone and are reported as **unverified by design** until then — they never block the main line). First vertical slice = Flow 01 email path + Flow 03 Day (incl. the empty-Day setup chooser) from Postgres via the `since=0` sync snapshot, offline-capable.

## Per-flow loop
1. Re-read the flow file, its sub-interactions and every contract it touches.
2. Write the next failing test (behaviour, failure or security rule) — the flow's "Build seed" names the first one.
3. Implement through interfaces with local adapters; never invent secrets.
4. Implement every state in the flow's States table, every action in Actions, every surface in coverage.
5. Pathway proof: Maestro (or Detox) e2e for the happy path + one failure path; screenshots per state at 390×844 and 375×667, dark and light; compare with the prototype state of the same key; record deltas in `evidence/flows/Flow_XX/fidelity.md`.
6. Interaction pass: container choice, motion, Reduce Motion, haptics per Design_Identity table (haptics proven only on a physical device).
7. Security pass 2: attack the flow (foreign ids, stale versions, replay, double submit, limits, redaction).
8. Accessibility pass: VoiceOver labels/order, Dynamic Type AX1, contrast, 44 pt targets, focus after errors.
9. Verify: format, lint, typecheck, focused tests, full suite, build, secret scan, audit. Read exit codes.
10. Fill the flow's Verification table with symbols, tests and evidence paths (status → passed / unverified + reason).
11. Spec review (fresh subagent with the flow file + diff) before code-quality review.
12. Commit per green step. Update `BUILD_STATE.json` from repository truth (revision, migrations applied, test results, evidence paths, open findings) — never hand-edit narrative state.
Do not start a dependent flow while the current one is red.

## Backend activation
Local adapters until the owner provides credentials. Activate one integration at a time with sandbox proof: SMTP (send a code to the owner), APNs sandbox (push to the owner's dev build), Anthropic (one plan with the owner's key, cost noted), Apple sign-in (device). OpenAI/Gemini/compatible: contract tests with recorded responses + optional owner live smoke. Production deploy to the home lab and Cloudflare Tunnel setup are stop points.

## Security, accessibility, performance
`SECURITY.md` is binding. Budgets: cold launch to Day ≤ 1.6 s on iPhone 13+ with cache; tab switch ≤ 100 ms; sync pull of a full term ≤ 1.5 s on LAN; plan p50 ≤ 20 s (provider-dependent, report measured); widget timeline build ≤ 50 ms; app binary ≤ 40 MB; no frame drops > 2 in hero entrance (Instruments).

## Supply chain
Lockfiles, gitleaks, `pnpm audit --prod` (no high/critical unaddressed), Expo config plugins pinned, no postinstall scripts from unknown packages, Docker images pinned by digest in prod compose.

## Deployment, rollback, recovery
Prepare (don't run) prod: images, compose prod profile, `.env` template, `infra/cloudflared/config.yml`, backup + `scripts/restore_test`, runbook `docs/RUNBOOK.md` (deploy, rollback to previous tag, restore, rotate keys, APNs key renewal). Forward-only migrations with expand/contract.

## Test clock
All fixture-based tests run with a fixed clock: 2026-10-20 12:00 America/Toronto (`TEST_NOW`); never `Date.now()` in validator or resolveDay tests.

## Gates and machine-readable state
Report each gate as PASS / FAIL / UNVERIFIED (with the exact reason). Never fake a pass.
- **Gate 1 — foundation structure**: already PASS for this pack (see `evidence/foundation-gate1.md`); re-run if you edit the foundation.
- **Gate 2 — foundation execution** (`verification/commands.json`): run `bootstrap` twice (second run must change nothing), `migration_replay` once, `auth_smoke` once with `FLOW_BY_FLOW_REPORT_DIR` set. auth_smoke reports `passed: true|false|null` per check; `null` = not yet testable (listed `available_from`) = UNVERIFIED.
- **Gate 3 — build evidence** (`BUILD_VERIFICATION.json` at repo root, you create it):
```json
{ "schema_version": 1, "persistent_data": true,
  "commands": [
    {"name": "tests", "argv": ["pnpm", "test"], "definition_file": "package.json"},
    {"name": "build", "argv": ["pnpm", "build"], "definition_file": "package.json"},
    {"name": "runtime-proof", "argv": ["./scripts/runtime_proof"], "definition_file": "scripts/runtime_proof"}],
  "evidence": [
    {"path": "evidence/migration-state.json", "produced_by": "runtime-proof", "kind": "migration-state", "max_age_hours": 24},
    {"path": "evidence/flows/Flow_03/runtime-proof.json", "produced_by": "runtime-proof", "kind": "runtime", "max_age_hours": 24}] }
```
  Inspect every argv and definition file, run each command, capture `evidence/verification/command-transcript.json` = `[{name, argv, definition_file, exit_code, stdout, stderr, started_at, finished_at}]` (secrets redacted by the commands themselves), check every evidence file was written during this run.
- **Gate 4 — build state** (`BUILD_STATE.json`, regenerated by `scripts/build_state`, never hand-edited): `{generated_at, git: {revision, dirty}, migrations: {tracked: [{version, sha256}], applied: [...], schema_fingerprint}, gates: {g2, g3}, flows: {"01": {status: "green"|"red"|"in_progress"|"not_started", tests_passed, evidence: [paths], unverified: [reasons]}, ...}, open_findings: [{id, severity, flow, summary}]}`.
- `evidence/migration-state.json` (written by runtime_proof): `{tracked: [{version, sha256}], applied: [{version, sha256, applied_at}], schema_fingerprint, open_recovery_findings: []}`.

## Evidence
`evidence/flows/Flow_XX/` per flow, `evidence/verification/command-transcript.json` from Gate 3, `evidence/migration-state.json`, `evidence/design/` fidelity comparisons, `evidence/reviews/` spec/code/security reviews.

## Stop points
App Store/TestFlight upload; prod deploy; DNS/Cloudflare; purchases (incl. Apple Developer Program); real secrets entry; legal; real-data deletion; physical-device claims without a device run; the six D-35 surfaces (OAuth sign-in/consent, New-password page, Name your term, Quiet switch, plan-notification ask, Disconnect-all) without a `flow-prototype` approval; any change to a LOCKED decision.

## Definition of done (v1)
All nine flows green with Verification tables filled, where rows marked "unverified by design" (Apple enrolment — CLIENT_QUESTIONS 0a; public host — #3; D-35 screens awaiting approval — 0b) may stay UNVERIFIED with their reason; first-week setup with the owner's real timetable works end to end; Live Activity starts/ends at boundaries on the owner's iPhone; widgets correct at three clock times; a plan from the Claude app via the connector arrives and applies after Approve; `BUILD_VERIFICATION.json` created from real commands; Gate 3 transcript reviewed; spec + runtime review done (independent or labelled self-reviewed); final report lists every ASSUMED decision used and every unverified claim.
