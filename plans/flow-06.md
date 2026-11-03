# Flow 06 — Plan with AI in the app: build plan

Sources:
- `flows/Flow_06_Plan_In_App.md`
- `Sub_Interactions/Flow_06_sub_interactions.md`
- `mcp/planning-guide.md` and `mcp/tools.md`
- BACKEND_SETUP §3 (plan lifecycle), §5 (routes) and §6 (engine and mapping)
- SECURITY.md lines 17–19, 49–60 and 64
- 00_Flow_Contracts: `ai-engine`, C-0306, C-0603, C-0706, C-0803
- Prototype states: `plan*`, `review*`, `claudeSettings`, `claude-own`, `ai-everywhere`. `scrReview` is at about line 1822 and `scrClaudeSettings` at about line 1531.

Run everything with `AI_MODE=fixture` until the live smoke step.

## Design decisions (log as D-61+ in `00_Brief_Analysis.md` while building)
| # | Decision | Why | Status |
|---|---|---|---|
| a | Providers are plain HTTPS adapters (Anthropic Messages, OpenAI Chat Completions, Gemini generateContent, OpenAI-compatible) built on one `safeFetch` (`node:https` with a custom `lookup` for DNS pinning, https only, private ranges blocked unless `ALLOW_PRIVATE_PROVIDER_URLS`, no redirects). Update the BACKEND_SETUP §1 stack row. | No SDK dependencies. One SSRF guard covers Custom URLs. Recorded responses are easy to test. | Owner-approved 2026-11-03 |
| b | The engine runs inside the API process (a runner with one AbortController per plan), not as a `jobs` row. The worker only handles the server-key background retry, pushes and the sweep. | A bring-your-own key must stay in memory only (D-13). A job row would store it. | ASSUMED |
| c | The background retry after 3 failed attempts happens only on the Dialed server key. With your own key, the Exhausted page says the request is saved and no retry happens. | The server can't retry without the key. | ASSUMED |
| d | A sweep marks `drafting` plans older than 2 min as `failed` (`provider_error`, retryable). This covers an API restart in the middle of a plan. | Nothing gets stuck on a loader. | ASSUMED |
| e | The plan-to-data mapping (`planOps`), the pure apply (`applyOps`) and `planImpact` live in `packages/schedule/src/plan.ts`, which is shared. The validator stays in `packages/planning`. | The device recomputes "What this does to your week" instantly when a switch toggles. The server's approve uses the same ops, so the mapping exists once. | ASSUMED |
| f | The app polls `GET /v1/plans/:id` (every 1 s, then every 3 s after 90 s) instead of using an SSE client library. The server still serves the SSE `/events` route for the contract. | No new mobile dependency. The flow file allows polling. | ASSUMED |
| g | A Custom provider stores a server URL, a model name and an optional key in the Keychain. `aiName()` shows the model name. | The flow file names the model in copy but doesn't list the fields. | ASSUMED |
| h | Plan routes are `app/(app)/plan/index.tsx` (composer) and `plan/[id]/{index,drafting,question,review,error,done}.tsx`. `plan/[id]/index` reads the status and replaces itself with the right page, and is the target of `dialed://plan/<id>`. | Pushed pages and deep links, as the flow file requires. | ASSUMED |
| i | Signing out wipes the Keychain AI keys along with the other local data. | Follows the identity-session contract. | ASSUMED |
| j | "Plan this week" (empty Week, D-41 pending) and the NAT-13 "Get told when plans are ready?" sheet are built behind `EXPO_PUBLIC_FEATURE_D35`. | D-35 / D-41 approval is still pending. | Per D-35 |

## Data changes — `backend/migrations/0002_plans_engine.sql` (new forward file)
- Add to `plans`: `provider_mode text check in ('server','byo')`, `checks_json jsonb not null default '[]'`, `step smallint not null default 0`, `bg_retry_at timestamptz null`.
- Index: `plans(user_id, status)`, plus a partial index on `status='drafting'` for the sweep.
- Mirror the missing columns and tables in the Drizzle schema `apps/api/src/db/schema.ts`: the remaining `plans` columns, `plan_changes`, `plan_messages`, `jobs` and `usage_counters`.
- Mobile SQLite: a local-only table `plan_drafts(origin TEXT PK, text, updated_at)` in `data/sqliteStore.ts`. It is not mirrored and is wiped on session end.

## Steps (each one: failing test first → green → `jest && tsc && lint` together with the commit → push)

### 1. Contracts — `flow-06: plan contracts`
- `packages/contracts/src/plans.ts` (Zod):
  - `PlanChange`: a discriminated union on `kind`, covering `new | moved | changed | removed | skip | create_category | create_term | update_term`, with the `repeat` / `on_date` variants.
  - `ProposeChangesInput` / `Output`, `Check`, `PlanDTO` (plan + changes + messages + checks + impact), `PlanSummary`.
  - Request bodies for create / answer / reply / toggle / approve.
- `packages/contracts/src/mcp.ts`: input and output schemas for the tools (`list_terms`, `get_schedule`, `list_categories`, `get_recent_plans`, `propose_changes`, `ask_user`), exported as JSON Schema. Flow 07 reuses them as is.
- `apps/api/src/lib/errors.ts`: map `STATUS` / `MESSAGES` for `plan_stale` (409), `plan_changed` (409), `plan_invalid` (409), `plan_not_ready` (409), `validation_failed` (422), `provider_error` (502, retryable), `provider_key_invalid` (400), `daily_limit` (429). Messages use the flow-file copy.
- Tests: schema round-trips with `bible-study.json`, and a contract test for each new code.

### 2. Pure plan mapping and impact (shared) — `flow-06: planOps, applyOps, planImpact`
- `packages/schedule/src/plan.ts`:
  - `planOps(changes, data, today)` returns ops: `insertTerm` (+ routine), `updateTerm`, `insertCategory`, `insertRoutineBlock` (split at term ends), `closeRoutineBlock`, `insertOverride`. Ops are in BACKEND_SETUP §6 order and resolve temp ids.
  - `effectiveFrom({kind:'plan_repeat'})` clamps start dates to tomorrow or later.
  - `applyOps(data, ops)` returns a new `ScheduleData`.
  - `planImpact(data, changes, weekOf)` returns rows for each touched day, Weekend and Week, using `weekWorkMinutes` and `formatHours` (half-up to 0.1 h).
- **Failing test first:** `bible-study.json` against the seed. The week of 2026-10-26 goes from 64.3 to 65.8, Wednesday from 11.6 to 11.3, the weekend from 8.5 to 11.5.
- Unit tests for each kind: repeat split across terms, `close_from`, one-off move + modify, and skip.

### 3. Validator — `flow-06: validator`
- `packages/planning/src/validate.ts` `validate(input, ctx)` returns `{errors[], checks[], ops}`.
  - Hard errors: `bad_time` (grid / range), `overlap` (after applying all enabled changes; work blocks only, via `overlapOf`), `protected_block` (unless the request names the block), `unknown_block` (not owned), `unknown_category`, `too_many_changes` (25; imports 60), `range_too_long` (120 d), `duplicate_change`, and past dates.
  - Soft checks: `outside_term` (dates are dropped), `day_bounds`, `quiet_hours`, profile limits.
  - Toggling a change off re-runs validation on the enabled set. A dependency broken that way shows up as a failed check (sub-interactions).
- Tests: one unit test per rule (the flow-file Verification row).

### 4. Extract the sync writers — `flow-06: shared block writers`
- Move the close+insert and override writers out of `SyncService` into `apps/api/src/sync/writers.ts`. They take `(tx, rec: ChangeRecorder, userId, …)` and a `source` parameter (`'user' | 'plan'`, plus `plan_id` on overrides).
- Behaviour doesn't change. All existing sync tests stay green and no new test is needed, so this is a refactor commit.

### 5. Approve, discard, staleness — `flow-06: approve transaction`
- `apps/api/src/plans/approve.ts`:
  1. Lock the plan with `FOR UPDATE`.
  2. Check that the status is `ready` (repeat calls are idempotent: an approved plan returns the Done payload).
  3. If `plan_version` doesn't match, return `plan_changed`.
  4. Run the staleness check, which looks at `change_log` rows with revision > the stored `base_revision` that touch `[range_from, range_to]` or a referenced block, category or term. A hit returns `plan_stale` and sets the status to `stale`.
  5. Re-run the validator on the enabled set. Failures return `plan_invalid` with errors.
  6. Run `planOps` through `writers.ts` with one `ChangeRecorder`, so everything lands in one revision.
  7. Set the status to `approved`, write audit `approve` with actor `user`, and return `{revision, applied[], effective_from}`.
- `stale.ts` is also called by `GET /v1/plans/:id`, so stale is detected when the plan is opened.
- **Build-seed failing test:** approving the Bible-study fixture plan does all of the following in one revision:
  - creates the Bible study category;
  - adds Wednesday 19:00–20:30 blocks effective from Oct 21;
  - moves WellServices to Sunday 15:00–16:45;
  - moves Speedwatch to Saturday 17:30–18:45.
- More tests:
  - forced failure partway through → no partial writes;
  - edit after the draft → 409 stale;
  - toggle elsewhere → 409 changed;
  - approving twice → one revision;
  - Bob's seeded plan → 404 (`authorization_report.cross_object_denied`, available from flow-06).

### 6. Engine and plan routes on the fixture provider — `flow-06: engine and plan routes`
- `packages/planning/src/`:
  - `guide.ts`: `renderGuide(template, profile)` fills the `{{…}}` fields from the profile. The template is read from `mcp/planning-guide.md` at startup.
  - `tools.ts`: in-process tool handlers over a `ContextLoader` (resolved range, categories, terms, recent 10 plans). Flow 07 reuses these.
  - `loop.ts`: `runPlan({provider, guide, tools, request, history, limits, signal, onStep})` returns `ready | question | failed`. Limits:
    - 8 tool turns;
    - 90 s wall clock and 30 s per call;
    - `PLAN_MAX_TOKENS`;
    - up to 3 provider retries on 429 / 5xx with backoff;
    - up to 3 corrective validator rounds, then `validation_exhausted`.
  - `providers/fixture.ts`: replays the `backend/seed/fixtures/plans/*.json` files, picked by request text, plus a test hook.
- `apps/api/src/plans/`:
  - `routes.ts` (`plansRoutes(app, service, jwt, auth)` behind `requireApp`), `service.ts`, `runner.ts` (registry, abort, step events), `usage.ts` (`usage_counters` upsert, `PLAN_DAILY_LIMIT` on the server key), `idempotency.ts`.
  - Routes: `POST /v1/plans`, `GET /v1/plans`, `GET /v1/plans/:id`, `GET /v1/plans/:id/events` (SSE), `answer`, `reply`, `PATCH changes/:cid`, `approve`, `discard`, `redo`, `cancel`.
  - Rules:
    - text is 1–4000 characters;
    - a new send cancels a plan that is still drafting;
    - the same Idempotency-Key returns the same plan;
    - plans are limited to 10/min;
    - a reply revises the same plan id (`version+1`, "Updated from your reply." notes);
    - audit records `actor ai:<provider>` for drafts.
- `config.ts`: read `AI_MODE` (`fixture | live`, no longer throwing), `ANTHROPIC_API_KEY`, `PLAN_MODEL_*`, `PLAN_MAX_TOKENS`, `PLAN_DAILY_LIMIT` and `ALLOW_PRIVATE_PROVIDER_URLS`. Model ids come only from env (D-26).
- Logging redaction: add `x-provider-key` and `x-provider-base-url`, and log `request_text` as a length only.
- API tests:
  - send → ready, using `bible-study`;
  - question → answer → ready;
  - reply revises the plan;
  - `failure.json` produces attempts 1–3 and then `failed` with `provider_error`;
  - `validation-exhausted`;
  - the 31st plan → `daily_limit`;
  - cancel;
  - one drafting plan per user;
  - idempotency;
  - "thanks!" → question or "Nothing to change.".

### 7. Live providers and Test key — `flow-06: provider adapters`
- `packages/planning/src/providers/`:
  - `http.ts` (`safeFetch`);
  - `anthropic.ts`, `openai.ts`, `gemini.ts`, `compat.ts`;
  - all implement `PlanProvider {id, displayName, supportsVision, run()}` and map tool calls to and from each vendor's format;
  - errors map to `provider_error` (timeout, 5xx) or `provider_key_invalid` (401 / 403).
- `POST /v1/ai/test-key`: one minimal call, nothing stored, 5/min.
- Tests:
  - contract tests per vendor against recorded responses in `packages/planning/test/recordings/` (no network);
  - SSRF: http, private IP, DNS rebinding to a private IP, and a redirect are all refused;
  - **redaction**: send a sentinel key, then grep the captured pino output and every DB table for it. It must appear nowhere.

### 8. Worker jobs — `flow-06: plan jobs`
- `apps/api/src/jobs/enqueue.ts`: `enqueue(tx, kind, payload, {runAt, dedupeKey})`.
- Handlers registered in `worker.ts`:
  - `plan.retry`: one background retry on the server key only, then a push.
  - `push.plan_ready`: dedupe `push:<plan>`. It defers to the end of the user's quiet hours and skips APNs when the device tier is `personal`. With `APNS_MODE=log`, it logs the payload `PLAN_READY` with `dialed://plan/<id>`.
  - `plans.sweep`.
- Tests: handler tests with the log adapter, quiet-hours deferral, dedupe.

### 9. Mobile foundation — `flow-06: plan client and primitives`
- `src/plan/`:
  - `api.ts`: typed calls through `ApiClient`. A bring-your-own key is read from the Keychain and sent only as a header.
  - `usePlan.ts`: the polling hook.
  - `model.ts`: `PlanChange` to card view-models (tag, title, from → to, note).
  - `copy.ts`: error code to page sentence, with `aiName()` substituted.
  - `drafts.ts`: `plan_drafts` autosave, debounced.
- `aiName()` becomes dynamic from the profile (`ai_mode`, `ai_provider`) plus the Custom model name: Claude, ChatGPT, Gemini or the model. `useAiName()` covers React. Snapshot test with ChatGPT.
- New `src/ui/` pieces:
  - `DialLoader` (from the `LaunchSplash` knob; static with Reduce Motion; `role=img` "Working");
  - `Stamp` (stamp notice);
  - `PinnedFooter`;
  - `StepList` (live region).
- Fix `notifications/reminders.ts` so it cancels only reminder identifiers, not every scheduled notification. Regression test.

### 10. Composer, drafting, question, error — `flow-06: plan it composer to question`
- `plan/index.tsx`:
  - title, sub and composer as in the flow file;
  - starter chips (insert a prefix, cursor at the end);
  - a counter shown from 3500 characters;
  - footer "Plans against your <term>";
  - Recent plans list (`GET /v1/plans?limit=10`; read-only, or Review when still ready);
  - offline stamp with Send disabled;
  - an empty Send shows the inline error with a warning haptic.
- Drafting page:
  - steps 400 ms apart;
  - leaving is safe;
  - Cancel posts `/cancel` and toasts "Stopped. Your text is still here.".
- Question page:
  - option buttons with selection haptic;
  - "Something else, I'll explain" returns to the composer with the text kept.
- Error page: provider, key (+ Open Settings), limit and validation sentences; Try again (attempt n of 3); Edit my request; the Exhausted variant.
- Wire the entry points:
  - Day header AI mark → `/plan`;
  - Routines "Describe a change to <AI>" → `/plan`;
  - setup chooser "Describe your week" → `/plan` (C-0206; the other options stay with Flow 02);
  - empty Week "Plan this week" behind the D-35 flag.
- Component tests: offline, empty send, counter, chips, recent rows.

### 11. Review, Done, Discard, Stale — `flow-06: review and approve`
- Review page:
  - title "N changes to <Term>" and the quoted request;
  - change cards rise with an 80 ms stagger; each switch is labelled "Include: <title>" and `PATCH`es optimistically;
  - impact table recomputed locally with `planImpact` (numeric transition), reconciled with the server;
  - checks lines;
  - "Ask for changes" reply (an empty reply toasts);
  - pinned "Approve N changes", disabled at 0 with "Turn on a change to approve";
  - header Discard;
  - "From <Client> chat" subtitle when `source=mcp` (C-0706).
- Stale: the stamp copy, Redo, Approve disabled, warning haptic. A 409 `plan_changed` reloads with a toast.
- Approve: spinner and safe double-tap. On success: success haptic → `syncNow()` waits for the returned revision → Done page.
- Done page: check pop, "<Term> updated", the effective-date sentence, the applied list, See this week (Week root) and Back to Routines.
- Discard: dialog → Routines + toast "Plan discarded. Your routine is unchanged."
- Tests: toggle count/impact, disabled at 0, stale, the Done focus order.

### 12. AI assistant settings — `flow-06: AI assistant settings`
- `app/(app)/ai-assistant.tsx` and a Settings row. D-59 hides it until now; this flow shows the in-app section only, and Flow 07 adds the connector section.
- Content:
  - the "Dialed server" / "Bring your own" radio cards;
  - provider chips in a tinted panel;
  - key field (URL + model for Custom);
  - Test and the three result lines, using the D-13 copy;
  - the "What keeps any AI on point" rules.
- Keys go to `expo-secure-store` `ai.key.<provider>` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). The choice is saved as a `profile` sync mutation `{ai_mode, ai_provider}`.
- A provider switched while a plan is drafting doesn't affect that plan.
- Tests: a11y labels, chip state, the key never in the SQLite or outbox (unit test).

### 13. Notifications and deep links — `flow-06: plan-ready links and notifications`
- Handle `dialed://plan/<id>` and the response listener for `PLAN_READY` / `CHAT_DRAFT` notifications. A missing or foreign id goes to Day with the toast "That plan isn't available.".
- Free-account mode (D-39): when the app returns to the foreground or a background refresh runs and an own plan has moved from drafting to ready, post a local `PLAN_READY` notification. This uses `expo-background-task`, a new dependency, justified because D-39 needs background refresh without APNs. Record the version in BACKEND_SETUP §Versions.
- The NAT-13 ask sheet appears after the first successful plan, behind the D-35 flag.
- Tests: deep-link router unit tests, notification mapping.

### 14. Proof — `flow-06: evidence, verification, decisions`
- Maestro flows in `apps/mobile/e2e/`:
  - `plan_happy.yaml` (send → ready → toggle → approve → Done → Week);
  - `plan_question.yaml`, `plan_reply.yaml`, `plan_stale.yaml` (edit via the API after the draft), `plan_errors.yaml`, `plan_offline.yaml`, `ai_settings.yaml`.
- `scripts/flow06_evidence` follows the `flow05_evidence` pattern (`ONLY=`, simctl recording compressed to about 2–3 MB). It covers dark and light, iPhone SE and AX1, and an `ai-name` screenshot with ChatGPT.
- Run `scripts/dev_evidence_cleanup` afterwards.
- One contact sheet `flow06-sheet-N.png`, looked at once next to the prototype.
- Interaction pass, security pass 2 (SECURITY AI threats and SSRF), accessibility pass (VoiceOver labels, AX1, 44 pt).
- `evidence/flows/Flow_06/verification.md` mirrors Flow 09's format.
- Fill the flow-file Verification table. Log D-61+. Update STATUS.md and BUILD_STATE.

### 15. Live smoke — stop point
- The owner adds their own provider key or keys to `.env` and `AI_MODE=live` (entering real secrets is a stop condition). Then run one Claude plan end to end and record it in `evidence/flows/Flow_06/providers.md`.
- Other vendors run only if the owner supplies keys. Until then each one is reported as **unverified (no key)**.

## Verification (end of flow)
- `pnpm -r test && pnpm -r typecheck && pnpm -r lint` (API tests run against `dialed_test` via globalSetup).
- `pnpm --filter api test -- plans`, `pnpm --filter planning test`, `pnpm --filter schedule test`
- `scripts/flow06_evidence`, then `scripts/dev_evidence_cleanup`
- `gitleaks detect`, `scripts/auth_smoke` (now includes `cross_object_denied` on plans), `scripts/migration_replay` (0002 replays clean).
- Report separately:
  - automated;
  - static;
  - runtime (Simulator);
  - unverified: live vendors without keys, APNs `PLAN_READY` on a paid tier, background-task timing on a device, and the D-35 flagged screens.

## Risks
- **Size.** Steps 2–8 are server-only and can each be proven with tests before any UI work. If the session budget runs short, split at the step 8 / step 9 boundary.
- **Tool-call format drift across vendors.** Contain it with the recorded-response tests and one internal message format in `loop.ts`.
- **Impact parity.** Device and server use the same `planImpact`, and a parity test covers it.

