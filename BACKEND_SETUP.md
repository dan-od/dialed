# Backend setup and architecture

Read with `SECURITY.md`, `00_Flow_Contracts.md` and `PROJECT_BIBLE.md`. Secrets are named here by key only; values live in `.env` (never committed).

## 1. Stack and why

| Layer | Choice | Why |
|---|---|---|
| Mobile | Expo (latest stable SDK at scaffold) + React Native + TypeScript, Expo Router, dev build | One codebase for iOS now and Android later; owner builds with Claude Code on a Mac with Xcode |
| Local data | `expo-sqlite` + Drizzle (sqlite driver) | Offline-first read model, same query language as server |
| Native extension | WidgetKit + ActivityKit target in SwiftUI, added with the `@bacons/apple-targets` config plugin; shared data via App Group | Live Activities and widgets can only be native; config plugin keeps `expo prebuild` reproducible |
| Native bridge | Small Expo Module (`modules/dialed-native`) exposing: write widget snapshot, reload timelines, start/update/end Live Activity, get push-to-start token, get activity push tokens | Keeps Swift surface tiny and testable |
| API | Node.js 22 LTS, Fastify, Zod, `@fastify/rate-limit`, pino | Fast, typed, small; same language as the app |
| DB | PostgreSQL 16, Drizzle ORM, SQL migrations committed under `backend/migrations` (drizzle-kit generate, reviewed, then frozen) | Deterministic replay; boring and reliable |
| Worker | Same codebase, separate process (`apps/api/src/worker.ts`), Postgres-backed job table with `FOR UPDATE SKIP LOCKED` leases | No Redis needed on the home lab |
| MCP | `@modelcontextprotocol/sdk` (TypeScript), Streamable HTTP mounted at `/mcp` in the API process | Any MCP client can connect |
| AI | Provider adapters: Anthropic SDK, OpenAI SDK, Google Gen AI SDK, OpenAI-compatible (base URL) | Provider-agnostic (D-05) |
| Files | PDF text: `pdfjs-dist`; DOCX: `mammoth`; images and scanned PDFs: provider vision input | Covers photo, screenshot, PDF, Word (D-27) |
| Email | Nodemailer over SMTP (`SMTP_URL`) | Any provider (D-18) |
| Push | APNs HTTP/2 with token auth (`.p8`), `apns2`-style client or `@parse/node-apn` | Plan notifications, Live Activity push-to-start/update/end, silent sync |
| Infra | Docker Compose: `api`, `worker`, `postgres`, `cloudflared`, `backup` | Runs on the home lab; no inbound ports |

### Versions
Pin exact versions at scaffold time in lockfiles. Record Expo SDK, React Native, Node, Postgres and Xcode versions here in a table during the first build task. Never upgrade majors inside a feature flow.

Recorded at Batch 0 (2026-10-20) on the owner's Mac:

| Component | Version | Notes |
|---|---|---|
| macOS | 27.2 (26B5101f) | |
| Xcode | 27.1 (27A9275) | scripts set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` when `xcode-select` points at Command Line Tools (still the case on 2026-10-21) |
| Repo location | `~/Codes/dialed` (moved 2026-10-21) | outside iCloud-synced `~/Documents`, so native builds go through the normal Xcode path |
| iOS Simulator runtimes | iOS 27.0, 27.1 | no iPhone SE runtime installed (375×667 screenshots unavailable) |
| Node | 22.23.3 LTS | official nodejs.org build in `~/.local/share/node22` (Homebrew `node@22` bottle was broken: missing libsimdjson.34); default `node` on PATH stays 25.9 |
| pnpm | 9.15.9 | `packageManager` field; `node-linker=hoisted` for Metro |
| Docker | 29.8.2 via OrbStack | same `docker compose` CLI |
| PostgreSQL | 16.15 (`postgres:16@sha256:ca0bd484…`) | |
| TypeScript | 6.0.3 | 7.x is out but typescript-eslint 8.72 supports < 6.1 |
| Fastify / Zod / Drizzle / pg / jose | 5.12.7 / 4.6.7 / 0.45.4 / 8.23.1 / 6.2.13 | |
| argon2 | @node-rs/argon2 2.2.2 | prebuilt N-API binary, no install script |
| Vitest | 5.0.5 | |
| Expo SDK / React Native / React | 58.0.16 / 0.88.0 / 19.3.0 | `create-expo-app@5.0.0` default template (Expo Router, `src/app`) |
| CocoaPods / Watchman / gitleaks | 1.17.0 / 2026.10.19.00 / 8.30.1 | Homebrew |
| App Groups on Personal Team | not tested yet | Flow 08 |

## 2. Repository layout (pnpm workspaces)

```text
dialed/
  apps/mobile/              Expo app (Expo Router: app/(auth), app/(tabs)/{day,week,month}, app/settings/*, app/plan/*, app/setup/*)
  apps/mobile/targets/widgets/   SwiftUI WidgetKit + ActivityKit extension (apple-targets)
  apps/mobile/modules/dialed-native/  Expo Module bridge (Swift)
  apps/api/                 Fastify API + MCP + worker entry points
  packages/schedule/        Pure TS: types, resolveDay, totals, time math, staleness. Shared by mobile + api. 100% unit tested.
  packages/contracts/       Zod schemas for every API request/response and sync mutation
  packages/planning/        Server-only: validator, planning guide renderer, provider adapters, tool loop, timetable extractor
  packages/tokens/          design tokens JSON → TS (app) + Swift (widgets) generators
  backend/migrations/       Frozen SQL migrations (0001_init.sql …)
  backend/seed/             Deterministic seed (owner's Fall 2026 routine) + test fixtures
  mcp/planning-guide.md     The guide every AI receives (template)
  scripts/                  bootstrap, migrate, migration_replay, auth_smoke, runtime_proof, backup, restore_test
  verification/commands.json
  infra/docker-compose.yml, infra/cloudflared/config.yml
  evidence/
```

## 3. Domain model and lifecycles

Entities (server tables in `backend/migrations/0001_init.sql`; device mirrors the user-owned ones):

- **users** — id, email (citext, unique, nullable for Apple-only; on deletion replaced by tombstone `deleted+<uuid>@invalid` so the address can sign up again immediately), email_verified_at, password_hash (argon2id, nullable), display_name, time_zone (IANA), day_start_min (540), day_end_min (1440), quiet_start_min (0), quiet_end_min (540), week_start (0=Mon), theme, profile_json, ai_mode, ai_provider, status (`active|deleted`), version, deleted_at, created_at. The **profile** sync entity = `{display_name, time_zone, day_start_min, day_end_min, quiet_start_min, quiet_end_min, week_start, theme, ai_mode, ai_provider, profile_json}` (quiet hours live here only).
- **apple_identities** — user_id, apple_sub (unique), refresh_token_enc (for revoke on delete), email_relay.
- **sessions** — id, user_id, refresh_token_hash, device_id, created_at, last_used_at, expires_at, revoked_at, replaced_by.
- **email_codes** — id, user_id/email, purpose (`verify|reset`), code_hash, attempts, expires_at (10 min), consumed_at.
- **invites** — email, invited_by, used_at (when `SIGNUP_MODE=invite`).
- **devices** — id, user_id, platform, apns_token, live_activity_start_token, app_version, last_seen_at, prefs_json `{lock_mode: 'live'|'line', line_on, heads_up_min: null|5|10, meal_notes, daily_cap, plan_pushes}`.
- **live_activities** — id, device_id, user_id, block_key (`<block id>:<date>`), push_token (per-activity token reported by the device), state, starts_at, ends_at. Needed to end/update push-started activities.
- **category_merges** — id, user_id, from/to category, moved_json, created_at, undone_at (10-minute undo).
- **categories** — id (uuid), user_id, name, group_name, color_dark, color_light, weight (0.1–1), quiet (bool), protected (bool), sort, version, deleted_at.
- **terms** — id, user_id, name, starts_on, ends_on, status (`draft|upcoming|active|past`, derived from dates + draft flag), version, deleted_at.
- **routines** — id, user_id, term_id (unique per term), name, version.
- **routine_blocks** — id, routine_id, user_id, weekday (0–6, Mon=0), start_min, end_min (> start, ≤ 1440), title, category_id, effective_from (date), effective_to (date, nullable), source, version, deleted_at. Editing a routine block closes the old row (`effective_to = effective date`) and inserts a new row (`effective_from = effective date`), so past days never change. If the effective date equals the old row's `effective_from` (same-day edit), the row is updated in place instead. Deleting a routine block = closing it (`effective_to`), never `deleted_at` (reserved for blocks created by mistake and never resolved on a past date). All ownership references use composite `(id, user_id)` foreign keys.
- **overrides** — id, user_id, on_date, kind (`skip|modify|add|move`), routine_block_id (nullable for add), title, start_min, end_min, category_id, moved_to_date, note, source (`user|plan`), plan_id, version, deleted_at.
- **plans** — id, user_id, source (`in_app|mcp|timetable|calendar`), provider, client_name (MCP client, e.g. "Claude"), request_text, status (incl. `cancelled`), base_revision (server-set when the draft becomes ready), version (bumped on every revise/toggle), proposal_id (MCP), idempotency_key, range_from/range_to (dates the plan touches), attempts, error_code, created_at, ready_at, decided_at.
- **plan_changes** — id, plan_id, ord, kind (`new|moved|changed|removed|skip|create_category|create_term`), title, payload_json (typed by `contracts.PlanChange`, see §6 mapping), note, enabled, validation_json.
- **plan_messages** — id, plan_id, role (`question|answer|reply`), body, options_json.
- **revisions** — user_id, revision (bigint), updated_at. One row per user.
- **change_log** — id (bigserial), user_id, revision, entity, entity_id, op (`upsert|delete`), row_json, created_at. Source for sync pull.
- **mutation_receipts** — user_id, client_mutation_id (uuid), result_json, created_at. Idempotency for sync push (kept 30 days).
- **jobs** — id, kind, run_at, payload_json, status (`queued|running|done|failed|dead`), attempts, lease_until, last_error.
- **oauth_clients**, **oauth_codes**, **oauth_tokens** — MCP authorization (dynamic client registration), token hashes only.
- **usage_counters** — user_id, day, plan_runs, imports, tokens_in, tokens_out.
- **audit_log** — id, user_id, actor (`user|ai:<client>|system`), action, target, meta_json, created_at.

Lifecycles:
- Plan: `drafting → question → drafting → ready → approved | discarded`; `drafting → cancelled`; `drafting → failed` (after 3 attempts, `error_code` `provider_error` or `validation_failed` with detail `validation_exhausted`); `ready → stale` when any `change_log` row with revision > `base_revision` touches a date in `[range_from, range_to]` or a routine/category the plan references (checked on open and inside Approve); `stale → drafting` on Redo. Only `ready` can be approved.

### Effective dates (one rule, implemented once in `packages/schedule.effectiveFrom(context, date)`)
| Context | Default effective date | Planner can change it |
|---|---|---|
| Routine editor save (Flow 05) | next Monday (week start) | yes: Today / Next Monday / pick a date |
| Edit block → "Every <weekday>" (Flow 04) | the date of the occurrence being edited (today for today's row) | no |
| Plan change with `repeat.from` (Flow 06/07) | `repeat.from` as proposed by the AI; validator clamps to ≥ tomorrow | via reply |
| Imports (Flow 02) | term start, or tomorrow if the term already started | via term dates |
- Account: `active → deleted` (soft) → purged by worker after 30 days.
- Term status derived nightly and on read: draft flag wins; else by date.
- Live Activity per work block: `scheduled → started (push-to-start at block start; the device reports its per-activity push token) → ended at block end (push to that token, `dismissal-date` = end)`; `dismissed` if the Planner swipes it away (never restarted for that block). The countdown is a client-side timer, so update pushes are needed only when the block's end time changes.

### Resolving a day (single source of truth)
`packages/schedule.resolveDay(date, data)`:
1. Find the term covering `date` (active/upcoming/past; drafts excluded unless previewing). None → only `add` overrides.
2. Take routine blocks with `weekday = weekday(date)` and `effective_from ≤ date < effective_to`.
3. Apply overrides for `date`: `skip` removes, `modify` replaces fields, `move` removes here and adds on `moved_to_date`, `add` inserts.
4. Sort by start; attach category (with quiet flag). Totals exclude quiet blocks.
Unit tests cover term edges, DST days (wall-clock minutes unaffected), moved blocks, deleted categories.

## 4. Sync protocol (offline-first)

- Server is authoritative. Every committed change increments `revisions.revision` and writes `change_log` rows in the same transaction.
- **Pull**: `GET /v1/sync/pull?since=<revision>&limit=500` → `{ revision, changes: [{entity, op, row}], more }`. `since=0` (first sync, or when the server answers `resync_required` because `since` is older than retained change_log) returns a **full snapshot**: every live row of every synced entity as `upsert`, paged, with `revision` = current. Otherwise rows come from `change_log`. Every server-side write — sync push, plan approve, signup defaults, category merge, purge — goes through one `recordChange(tx, entity, row)` helper that bumps the revision and appends `change_log` in the same transaction. Seed data relies on the snapshot path. Device applies a page inside one SQLite transaction and stores the cursor.
- **Push**: `POST /v1/sync/push` with `{ mutations: [{ client_mutation_id, entity, op, id, base_version, fields }] }` (max 100). Server processes in order, each in its own transaction:
  - Duplicate `client_mutation_id` → return stored receipt (idempotent).
  - `base_version` ≠ current `version` → `conflict` with current row; nothing applied.
  - Validation failure → `rejected` with error code.
  - Else apply, bump row `version`, bump revision → `applied`.
- Compound mutations (one server transaction each, same receipt/idempotency rules; schemas in `packages/contracts/sync.ts`): `routine_save {routine_id, base_version, effective_from, ops:[{op:'add'|'update'|'close', block_id?, fields?}]}` (Flow 05), `routine_block_edit {block_id, base_version, effective_from, fields?, close?: true, reopen?: true}` (`reopen` clears `effective_to` — used by Undo after a delete) (Flow 04 "every" edits/deletes — close + insert or in-place update atomically), `category_merge {from, to, from_version, to_version}`, `category_unmerge {merge_id}` (10 min), `category_delete {id, base_version, reassign_to | delete_blocks}` (Flow 09). Simple entity mutations: `category`, `term`, `override`, `profile` upserts. Plan approval is not a sync mutation; it is `POST /v1/plans/:id/approve`.
- Device outbox: mutations persist in SQLite, sent FIFO with exponential backoff (1s→60s, jitter) when online; app foreground, network regain and silent push trigger a push+pull. Pill shows outbox size ("2 to sync") and "Syncing".
- Conflict UI: toast "<Title> was changed on another device. Your edit wasn't applied." action Reapply (re-queues with new base_version).
- After every successful pull that changes today or tomorrow, the app rewrites the widget snapshot and reloads timelines (contract C-x08).

## 5. REST API (v1, JSON, Zod-validated; all routes except auth/health need `Authorization: Bearer <access>`)

| Method & path | Purpose | Flow |
|---|---|---|
| GET /healthz, /readyz | liveness / DB readiness | ops |
| POST /v1/auth/signup | email, password, name → sends code; 409 `email_taken`; 403 `invite_required` | 01 |
| POST /v1/auth/verify | email, code → tokens | 01 |
| POST /v1/auth/resend | email, purpose | 01 |
| POST /v1/auth/login | email, password → tokens; 401 `bad_credentials` (same response for unknown email unless account-exists check endpoint used) | 01 |
| POST /v1/auth/login/check | email → `{exists}` rate-limited, powers "No account for that email" | 01 |
| POST /v1/auth/apple | identityToken, authorizationCode, nonce, name? → tokens, `is_new` | 01 |
| POST /v1/auth/password/forgot | email → always 202; emails `https://<domain>/reset#token=…` (token in the URL fragment so it never reaches server or Cloudflare logs) | 01 |
| POST /v1/auth/password/reset | token, new password | 01 |
| POST /v1/auth/refresh | refresh token → rotated pair (reuse detection revokes family) | shared |
| POST /v1/auth/logout | revoke this session; unregister device push | 01 |
| DELETE /v1/account | re-auth required (password or Apple) → soft delete, revoke all, Apple revoke | 01 |
| GET /v1/account/export | streams `dialed-export.zip` (JSON + ICS) directly, `Cache-Control: no-store`; 3/day | 09 |
| PUT /v1/devices/current | APNs token, Live Activity push-to-start token, prefs, app version | 08 |
| PUT /v1/devices/current/activities/:blockKey | per-activity push token (and state `started|dismissed`) reported when an activity starts | 08 |
| GET /v1/sync/pull, POST /v1/sync/push | sync | shared |
| POST /v1/plans | `{source:'in_app', request_text, provider_mode, provider?, byo_key? (header X-Provider-Key), answer_to?}` → plan id (202), runs async | 06 |
| GET /v1/plans/:id | plan + changes + messages | 06, 07 |
| GET /v1/plans/:id/events | Server-Sent Events: `status`, `step` while drafting (polling fallback) | 02, 06 |
| POST /v1/plans/:id/answer | answer a question | 06 |
| POST /v1/plans/:id/reply | revise ("make it 7:30") | 06 |
| PATCH /v1/plans/:id/changes/:cid | `{enabled}`; for `create_term`/`update_term` changes also `{payload: {starts_on, ends_on, name?}}`; bumps plan version | 02, 06 |
| POST /v1/plans/:id/approve | `{plan_version}` → server locks the plan, rejects 409 `plan_changed` if version differs (MCP revised or toggled elsewhere), checks staleness with the **stored** `base_revision` (409 `plan_stale`), re-runs the validator on the enabled set (409 `plan_invalid` with errors), then applies atomically | 06 |
| POST /v1/plans/:id/discard | discard | 06 |
| POST /v1/plans/:id/redo | re-draft stale plan | 06 |
| POST /v1/plans/:id/cancel | cancel drafting (keeps text) | 06 |
| GET /v1/plans?limit=10 | recent plans | 06 |
| POST /v1/imports/timetable | multipart file (jpeg/png/heic/pdf/docx ≤ 15 MB) → plan (source `timetable`) | 02 |
| POST /v1/imports/calendar | parsed events from device → plan (source `calendar`) | 02 |
| POST /v1/ai/test-key | provider + key header → `{ok}` (1 tiny call) | 06 |
| GET /v1/connector | connected MCP clients | 07 |
| DELETE /v1/connector/:clientId, DELETE /v1/connector | disconnect one/all | 07 |
| POST /v1/connector/test-draft | create sample chat draft + push | 07 |

Error envelope (global contract `error-taxonomy`): `{ "error": { "code": "snake_case", "message": "Plain sentence for the user.", "retryable": bool, "details"?: {} } }`. Codes listed in `00_Flow_Contracts.md`.

## 6. Planning engine (server)

Pipeline for every plan (in-app, timetable, calendar, MCP-originated revisions):
1. **Load context** for the user: resolved schedule for the affected range (default: today → term end, max 120 days), categories, terms, recent 10 plans, profile (day bounds, priorities, limits).
2. **Render guide** (`mcp/planning-guide.md` with profile fill-ins) as system instructions.
3. **Tool loop** with the provider adapter. In-process tools mirror the MCP tools: `get_schedule`, `list_categories`, `list_terms`, `get_recent_plans`, `propose_changes`, `ask_user`. Max 8 tool turns, 90s wall clock, per-plan token ceiling (`PLAN_MAX_TOKENS`).
4. **Validate** every `propose_changes` through `packages/planning.validate()`; on errors return them to the model as the tool result; up to 3 corrective rounds. Still invalid → plan `failed` with `validation_exhausted` (user sees error screen, text kept).
5. **Persist** plan `ready` (or `question` when `ask_user`), push "Your plan is ready" if the app isn't foregrounded.

Validator rules (hard, server-enforced, mirrored in guide):
- Times valid (0 ≤ start < end ≤ 1440, 5-minute grid); dates inside an existing term or a term created by a `create_term` change in the same plan (the proposed term counts as existing during validation; imports for a brand-new account always include one).
- No overlap with another work block on the same resolved day after applying all enabled changes, unless the change is flagged `overlap_ok` by the Planner's own request (then a failed check, shown in review).
- Class blocks (category group School + name/category `Class`, or any block imported from a timetable) cannot be moved/removed unless the request names them.
- Day bounds and quiet hours are **soft** checks: a block outside them is allowed but flagged in `checks` and shown in review ("Starts before your day: 8:10 am"). Imported classes never fail on them. Weekly/daily limits from profile are reported as `checks`.
- "Rest of the year" = Dec 31; "this term" = term end; ranges past a term split per term.
- Category references must exist or be created by a `create_category` change in the same plan.
- Dates with no term (e.g. Dec 23–31 for "rest of the year") are dropped from repeating changes with a failed `outside_term` check shown in review — not an error.
- Max 25 changes per plan (imports: 60).

### PlanChange → data mapping (applied inside Approve, in this order)
| kind | payload | Effect |
|---|---|---|
| `create_term` | `{temp_id, name, starts_on, ends_on}` | insert `terms` + `routines` |
| `update_term` | `{term_id, starts_on, ends_on}` | update the existing term's dates (used when the Planner edits term dates on Found classes; applied inside Approve so it doesn't make the plan stale) |
| `create_category` | `{temp_id, name, group, palette}` (palette name from Design_Identity; server maps to `color_dark/light`) | insert `categories` |
| `new` + `repeat` | `{title, category, weekday, start, end, from, until}` | insert `routine_blocks` per covered term (split at term ends; `effective_to` = min(until + 1 day, term end + 1 day)) |
| `new` + `on_date` | `{title, category, on_date, start, end}` | insert `overrides` kind `add` |
| `moved` + `repeat` | `{block_ref, close_from, to_weekday, start, end, from}` | close old routine block at `close_from` (defaults to `from`), insert new on `to_weekday` from `from` |
| `moved` + `on_date` | `{block_ref, on_date, to_date, start?, end?}` | `overrides` kind `move` (+ `modify` if times change) |
| `changed` | `{block_ref, from or on_date, fields}` | repeat → close + insert; one-off → `modify` override |
| `removed` | `{block_ref, from}` | close routine block at `from` |
| `skip` | `{block_ref, on_date}` | `overrides` kind `skip` |
Temp ids resolve to rows created earlier in the same transaction. `block_ref` must belong to the user (composite FK) or the change fails validation.

Provider adapters implement `PlanProvider { id, displayName, supportsVision, run(messages, tools, opts) }`. Keys: server mode uses `ANTHROPIC_API_KEY`; BYO uses the `X-Provider-Key` header for that request only (D-13). OpenAI-compatible uses `X-Provider-Base-URL` (https only, no private-IP SSRF unless `ALLOW_PRIVATE_PROVIDER_URLS=true` for the owner's home lab).

Timetable pipeline: upload → store in `${UPLOAD_DIR}/<uuid>` (0600) → extract (DOCX → text via mammoth; PDF → text via pdfjs, if < 200 chars of text treat as scanned → page images; images → vision) → model returns classes JSON (`title, kind, weekday, start, end, room`) → validator → plan `ready` (source `timetable`, changes `new` per class) → delete file (finally block + hourly sweeper job). Non-vision BYO provider → falls back to Dialed server for the read step only, with consent copy; if server key disabled → error `vision_unavailable`.

## 7. MCP server (`/mcp`)

- Transport: Streamable HTTP. Auth: OAuth 2.1 per MCP authorization spec — protected resource metadata at `/.well-known/oauth-protected-resource`, authorization server metadata at `/.well-known/oauth-authorization-server`, dynamic client registration `/oauth/register`, authorize `/oauth/authorize` (web page: sign in with Dialed email/Apple, consent screen naming the client), token `/oauth/token` (PKCE S256 required). Access tokens 1h, refresh 30d, scopes `schedule:read plans:draft`. Tokens bound to user + client id; listed and revocable in Settings.
- Server `instructions`: what Dialed is, that nothing saves until the Planner approves in the app, read `dialed://planning-guide` first.
- Resource `dialed://planning-guide` (rendered per user). Prompt `plan_schedule(request)`.
- Tools (read-only except draft): `get_schedule(from,to)`, `list_categories()`, `list_terms()`, `get_recent_plans()`, `propose_changes(request_text, changes[], proposal_id?)` → validator; returns `{proposal_id, status:'ready'|'invalid', errors[]}`; on `ready` the server pushes "<Client> sent a plan from chat" to the Planner's devices. `ask_user` is not available over MCP (the chat itself is the conversation); the guide tells external AIs to ask in chat instead.
- Limits: 60 tool calls/min per token, 20 drafts/day per user per client. Every call audited with client name.

## 8. Notifications, Live Activities and widgets

On device (`apps/mobile/src/glance/`):
- **Local scheduler** recomputes the next 48h after every sync, setting change and app foreground: heads-up (if enabled) N min before work blocks; meal notes (if enabled) at quiet-block start; applies quiet hours and daily cap (oldest-first fill, drop the rest, log count). Notification category `BLOCK_REMINDER` with actions `SNOOZE_10` and `OPEN_DAY`.
- **Widget snapshot**: JSON for today+tomorrow resolved days, week totals, categories (colours), settings (lock mode, line on/off, rundown mode default, meals in widgets) written to the App Group container; then `WidgetCenter.reloadAllTimelines()`. Widgets build timeline entries at every block boundary (and every minute only inside the current block for countdown text using `Text(timerInterval:)` so no per-minute reloads).
- **Live Activity** — canonical shape, defined once in `packages/contracts/liveActivity.ts` and mirrored in `targets/widgets/BlockActivityAttributes.swift`: static `BlockActivityAttributes {blockKey: String, title: String, categoryColorHex: String, startsAt: Date}`; `ContentState {endsAt: Date, next: [NextBlock] (max 2)}` with `NextBlock {title: String, startsAt: Date, durationMin: Int}`. Every other file refers to this definition. Started by APNs push-to-start at block start (worker), or locally if the app is foregrounded at block start. Countdown uses `Text(timerInterval:)`. Ended by push at block end with `dismissal-date` = end. Not started for quiet blocks or when lock mode is Line only.

On server (worker jobs):
- `la.schedule` — nightly + after any revision affecting today/tomorrow: enqueue `la.start` at each work block start and `la.end` at end for devices with Live Activity on.
- `push.plan_ready`, `push.chat_draft` — alert pushes (respect device quiet hours; plan pushes never count toward cap but obey the user's quiet hours (`users.quiet_*`) by deferring to quiet-hours end).
- `push.sync_nudge` — silent push (`content-available`) after server-side changes from another device/AI approval.
- `account.purge`, `uploads.sweep`, `usage.reset`, `backup.verify`.
Jobs: lease 60s, max 5 attempts with exponential backoff + jitter; APNs 410 → drop token; 429/5xx → retry; dead jobs logged and visible in `/admin/jobs` (owner-only, behind `ADMIN_TOKEN`, not exposed through tunnel by default).

## 9. Calendar import (device)
`expo-calendar` with full-access permission → read events from selected calendars for the term range → group recurring weekly events into routine blocks (weekday + time + title), one-offs into overrides → `POST /v1/imports/calendar` with normalized events (no raw notes/attendees) → plan `ready` → normal review. Never writes to calendars (D-28).

## 10. Environment keys (`.env.example` has names only)
See `.env.example`. Groups: database, auth/JWT, Apple, APNs, SMTP, AI providers + models + limits, MCP/OAuth, Cloudflare, admin, upload dir, signup mode.

## 11. Observability, cost and operations
- Rate limits and logs use the client IP from `CF-Connecting-IP`, trusted only when the request comes from the cloudflared container's address (Fastify `trustProxy` = that IP); direct requests use the socket address.
- pino JSON logs with `request_id`, `user_id` (hashed), route **without query string**, latency; redact `authorization`, `x-provider-key`, `password`, `code`, `token`, `refresh_token`, file contents, request_text (log length only).
- Metrics endpoint `/metrics` (Prometheus text, internal only): request latency, plan durations, provider errors, validator rejections, job queue depth, APNs results, usage counters.
- Cost: `usage_counters` checked before each plan/import on the server key; 429 `daily_limit` with reset time. Provider spend alerts set in vendor consoles (owner action).
- Deploy: `docker compose up -d` from a tagged image; migrations run by a one-shot `migrate` service before `api`/`worker` start. Rollback: previous image tag; migrations are forward-only, every migration must be backward compatible with the previous app release (expand → migrate → contract over two releases).
- Backups: nightly `pg_dump -Fc` to the home-lab NAS + weekly restore test into a scratch container (`scripts/restore_test`) that runs `migration_replay` checks against the restored DB. A backup without a passing restore test is unverified.
- Health: Cloudflare Tunnel health + `/readyz`; owner gets an email alert (Uptime Kuma or similar on the home lab — ASSUMED).

## 12. Local development
- `scripts/bootstrap`: checks Node/pnpm/Docker, installs deps, starts Postgres via compose, runs migrations, seeds the owner's routine and test users (idempotent: upserts by fixed UUIDs).
- `pnpm dev:api`, `pnpm dev:worker`, `pnpm --filter mobile ios` (dev build on Simulator).
- Local adapters when credentials are absent: `EMAIL_TRANSPORT=console` (codes printed to log), `APNS_MODE=log`, `AI_MODE=fixture` (deterministic recorded plans from `backend/seed/fixtures/plans/*.json`), Apple sign-in disabled unless keys present (button shows on device only).

## 13. Free Apple account mode (`APPLE_TEAM_TIER=personal`, D-39)
The owner builds with a free Apple account (Xcode Personal Team) until enrolling. Apple's published limits for free accounts: 7-day expiring profiles (re-run from Xcode weekly), up to 3 devices per platform, up to 10 App IDs, no App Store Connect/TestFlight ([Apple: Choosing a membership](https://developer.apple.com/support/compare-memberships/)). Paid-only capabilities and what Dialed does instead:

| Feature | Paid program | Free account behaviour |
|---|---|---|
| Push (APNs): plan ready, chat drafts, silent sync | APNs from server | No APNs entitlement. App does a background refresh (`expo-background-fetch` / BGAppRefreshTask, iOS decides timing) that pulls plans and posts a **local** notification; plans also appear on next open. Server skips APNs jobs when the device reports `tier: personal`. |
| Live Activities | push-to-start at block start, push end | No push. The app starts the activity itself whenever it's foreground or wakes in a block (open app, background refresh, a heads-up notification tap). It sets `staleDate` = block end and, right after starting, calls `end(dismissalPolicy: .after(blockEnd))` so the card keeps counting down with `Text(timerInterval:)` and leaves on time without a push. **Verify this on the device** — record whether iOS keeps the ended card visible until `blockEnd`; if not, keep it running and end it on next wake. |
| Widgets (App Group snapshot) | App Group entitlement | Try enabling App Groups on the Personal Team in Xcode first. If Xcode refuses, widgets ship as previews only ("Open Dialed to see your day") until the paid account; the line under the date and Live Activity still work. Record the result in `BACKEND_SETUP.md §Versions`. |
| Sign in with Apple | native button | Hidden. Email sign-in only. Server keeps the endpoint for later. |
| Password reset universal link | `https://api.okoro.me/reset#token=…` opens the app | Associated Domains unavailable. The email links to `https://api.okoro.me/reset#token=…`, a tiny static page that redirects to `dialed://reset#token=…` (the fragment never hits the server) and shows "Open Dialed" if the redirect is blocked. |
| TestFlight / App Store | yes | No. Install with Xcode; re-install weekly. |
| Background push for widget refresh | silent push | Widgets refresh from their own timeline + every app open/background refresh. |

Flip to `APPLE_TEAM_TIER=paid` (app config + server env) after enrolling; no data migration needed. Flow 08 device rows remain **unverified by design** for push-dependent behaviour while on the free account.
