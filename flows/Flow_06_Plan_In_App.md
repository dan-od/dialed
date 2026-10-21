# Flow_06: Plan with AI in the app

## Goal
The Planner describes a change in plain words (typed or dictated) and gets a validated draft they can switch, revise and approve in one tap; nothing changes before Approve. Trigger: AI mark in the Day header, "Describe a change to <AI>" in Routines, Describe your week (Flow 02), "Plan this week" in an empty Week, a plan-ready or chat-draft notification. Success: an approved plan applied atomically (routine versions/overrides/categories) and visible in Week/Routines. Boundary: composing, drafting, question, review, approve/discard, recent plans and the in-app AI provider setting. Connector setup and MCP drafting are Flow 07; timetable/calendar pre-steps are Flow 02. Neighbours: 03, 05, 02, 07, 08 (entries); 03, 05 (exits).

## References and coverage
REF-001 states: `plan`, `plan-offline`, `planLoading`, `review`, `review-stale`, `planQuestion`, `planError`, `planError-exhausted`, `planDone`, `push-plan`, `claudeSettings`, `claude-own`, `ai-everywhere`. NAT-10 (dictation). REF-003 (guide). Changes from prototype: D-13 copy for BYO keys; loader uses the dial loader (prototype v7+).

## Entries, sequence, and exits
1. **Plan it** composer (back to origin): title "Plan it", sub "Type it, or tap the mic on your keyboard and say it. <AI> drafts the changes and nothing moves until you approve." Composer "What should change?" (multi-line, autosaved draft), footer "Plans against your <term>", send button. Starter chips: Move a block · Add to every week · Plan exam week · Free up a day (insert a prefix and focus). Recent plans list (date, request, Approved/Declined/From <client> chat) → tap opens that plan read-only (or Review if still ready).
2. **Send** → validate non-empty ("Tell <AI> what to change first. For example: “Gym on Sunday mornings for the rest of the year”.") → `POST /v1/plans` → **Drafting your plan** page: dial loader, steps tick in 400 ms apart ("Reading your <term>", "Matching your categories", "Fitting it into your week", "Checking your limits"), sub "You can leave this screen. You'll get a notification when it's ready.", Cancel (keeps text).
3. Result:
   - `question` → **One quick question** page: AI card with the question, 2–3 option buttons + "Something else, I'll explain" (returns to composer with text kept). Answer → drafting again.
   - `ready` → **Review** page: title "3 changes to Fall term", quoted request, change cards (tag New/Moved/Changed/Removed/Skip/New category, title, from → to in Anton, one-line note, switch), "What this does to your week" (Wednesday 11.6h → 11.3h, Weekend 8.5h → 11.5h, Week 64.3h → 65.8h, recomputed live as switches change), "Ask for changes" input + send (reply → drafting → revised review with "Updated from your reply." notes), pinned **Approve N changes** (disabled "Turn on a change to approve" at 0), header Discard.
   - `failed` → **Error** page: "<AI> didn't answer" + reason sentence, request quoted ("Your request, saved"), Try again (attempt n of 3) / Edit my request. After 3 → "Still can't reach <AI>", Got it — request saved; server retries in the background once and notifies.
   - `stale` (detected on open or on Approve 409) → Review with stamp "Out of date: You added a block on Wednesday after <AI> drafted this. Redo the plan so nothing clashes." + Redo plan; Approve disabled.
4. **Approve** → `POST /v1/plans/:id/approve` → **Done** page: check scales in, "<Term> updated", "Changes start this Wednesday. Past days stay as they were.", list of applied changes, See this week (→ Week) / Back to Routines.
5. **Discard** → dialog "Discard this plan? Your routine stays as it is. Your request stays in Recent plans." → Routines + toast "Plan discarded. Your routine is unchanged."
6. **AI assistant settings** (Settings → AI assistant, in-app section): "Dialed server — Claude, on the Dialed server's key. Nothing to set up." | "Bring your own — Claude, ChatGPT, Gemini, or a model on your own server. Subscriptions like Claude Pro or ChatGPT Plus don't include API keys; use the connector below for those." Provider chips (Claude / ChatGPT / Gemini / Custom) in an indented tinted panel; key field (or server URL for Custom) + Test; result lines: "Key works. Stored in the iPhone Keychain. Sent with each plan request, never saved on the Dialed server." / bad-format help with where to get a key / "Billed to your <vendor> account. A plan costs a few cents." The app swaps "Claude" for the chosen provider's name in all planning copy (ChatGPT, Gemini, model name for Custom).
Exits: Week (03), Routines (05), origin screen.

## States and feedback
| State | Feedback |
|---|---|
| Offline composer | stamp "Offline": "You're offline. <AI> needs the server, so sending waits. Your text is kept." Send disabled |
| Empty send | inline error + warning haptic |
| Drafting | loader; leaving is safe; push `PLAN_READY` if backgrounded |
| Cancel drafting | `POST /plans/:id/cancel`, toast "Stopped. Your text is still here." |
| Question | page; answers are buttons |
| Ready | cards rise 80 ms stagger |
| Switch toggles | selection haptic; impact numbers update; button count updates |
| Reply empty | toast "Type what to change, like “make it 7:30”." |
| Stale | stamp + Redo; warning haptic |
| Approve busy | spinner; double-tap safe |
| Approved | success haptic; Done page |
| Failed (provider, key invalid, daily limit, validation exhausted) | error page with specific sentence: provider "didn't answer within 30 seconds"; key "Your <vendor> key was refused. Check it in Settings." (+ Open Settings); limit "You've used today's 30 plans on the Dialed server. Try again tomorrow or bring your own key."; validation "<AI> couldn't make a plan that fits your limits. Try rewording it." |
| Exhausted | Got it; background retry once; notification when ready |
| Plan from notification (deleted/other user) | Day + toast "That plan isn't available." |

## Interaction surface and transitions
All plan screens are **pushed pages** (people read and compare; deep-linkable `dialed://plan/<id>`). Discard: **dialog**. Settings page: pushed page from Settings. Motion: page slide 320 ms; steps 400 ms apart; cards rise 80 ms stagger; switch 200 ms; check pop with overshoot. Haptics: selection on switches/answers; success on Approve/key OK; warning on stale/errors/discard. Reduce Motion: static loader, fades.

## Actions and functions
| Action | Function | Validation / auth | Side effects | Idempotency / retry |
|---|---|---|---|---|
| Send | `POST /v1/plans {source:'in_app', request_text, provider_mode, provider}` + `X-Provider-Key`/`X-Provider-Base-URL` (BYO) + `Idempotency-Key` | session; text 1–4000; daily limit (server key); one drafting plan per user (new Send cancels the old) | plan `drafting`, job `plan.run` | same key → same plan |
| Watch | `GET /v1/plans/:id/events` (SSE: `status`, `step`) with polling fallback | owner | — | reconnect |
| Answer | `POST /v1/plans/:id/answer {option|text}` | status `question` | message, re-run | — |
| Reply | `POST /v1/plans/:id/reply {text}` | status `ready` | message, re-run (same plan id, `revised`) | — |
| Toggle | `PATCH /v1/plans/:id/changes/:cid {enabled}` | `ready` | enabled; plan version +1; impact recomputed; turning off a change that another depends on (e.g. the move that frees the slot) shows the resulting overlap as a failed check before Approve | last write wins |
| Approve | `POST /v1/plans/:id/approve {plan_version}` | `ready`; `plan_version` matches (else 409 `plan_changed` → reload Review with toast "This plan was just updated. Check it again."); not stale against the **stored** base_revision (else 409 `plan_stale`); validator re-run on the enabled set (else 409 `plan_invalid`, cards show the failing checks); ≥1 enabled change | in one transaction (mapping in BACKEND_SETUP §6): create categories, close/insert routine block versions (effective from the earliest date in the change or tomorrow for "every"), overrides, revision++, change_log, audit `approve` | idempotent by state |
| Discard | `POST /v1/plans/:id/discard` | `ready|stale|question|failed` | status | idempotent |
| Redo | `POST /v1/plans/:id/redo` | `stale` | re-run with current schedule | — |
| Test key | `POST /v1/ai/test-key {provider}` + key header | rate limit 5/min | one minimal call; nothing stored | — |
| Save provider choice | profile mutation `{ai_mode, ai_provider}`; key → Keychain (`ai.key.<provider>`) | — | — | — |

Engine: BACKEND_SETUP §6 (load context → guide → tool loop → validator → persist). Provider timeouts 30 s per call, 90 s total; 3 provider retries on 429/5xx with backoff inside one attempt; user-visible attempts count separately (max 3).

## Data and integrations
- Persistent data: yes
- `plans`, `plan_changes`, `plan_messages`, `usage_counters`, `audit_log`; on approve: `categories`, `routine_blocks`, `overrides`, `revisions`, `change_log`.
- Device: composer draft in SQLite; BYO keys in Keychain only.
- External: provider APIs; APNs (`PLAN_READY`).
- Env: `AI_MODE`, `ANTHROPIC_API_KEY`, `PLAN_MODEL_*`, `PLAN_MAX_TOKENS`, `PLAN_DAILY_LIMIT`, `ALLOW_PRIVATE_PROVIDER_URLS`.

## Security and abuse cases
Prompt injection in request text cannot write data (draft only + validator); protected class changes rejected unless named; cross-user plan ids → 404; BYO key never stored/logged (redaction test); SSRF via Custom URL blocked; cost: limits + token ceiling; stale approval race → row lock + base_revision; replayed approve → state check. Audit log records `actor: ai:<provider>` for drafts and `user` for approve.

## Accessibility
Composer labelled "What should change?"; dictation via keyboard; loader `role=img` "Working", steps in a live region; question options are buttons; change cards: switch label "Include: Bible study with Chichi"; impact table read as text; Approve button announces count; Done page focus on title.

## Platform behavior
Free Apple account (D-39): "plan ready" is a local notification posted after background refresh (no APNs); the plan-alerts ask (NAT-13) still requests local notification permission.
Keyboard avoidance keeps composer visible; SSE via `react-native-sse` (or polling); background → plan continues server-side; local notification not needed (APNs `PLAN_READY`, deferred to quiet-hours end).

## Contracts
C-0306, C-0206, C-0603, C-0706 (shared Review), C-0803, `ai-engine`, `sync` (pull after approve), `notifications`, `error-taxonomy`.

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| Send → ready → approve (fixture) | `PlanScreens`, `plans` API, engine | e2e with `AI_MODE=fixture` (`fixtures/plans/bible-study.json`) | recording | evidence/flows/Flow_06/happy.mp4 | not started |
| Question path | engine `ask_user` | fixture `question.json` | screenshot | …/question.png | not started |
| Reply revises same plan | `/reply` | api test | recording | …/reply.mp4 | not started |
| Stale detection | approve 409 | api test (edit after draft) | screenshot | …/stale.png | not started |
| Errors ×3 + exhausted | engine retries | api tests with failing fixture | screenshots | …/errors/*.png | not started |
| Validator rules | `packages/planning.validate` | unit per rule (overlap, protected, term, quiet hours, 25 cap) | — | — | not started |
| Atomic approve | approve txn | api test with forced mid-failure → no partial writes | — | — | not started |
| Impact numbers | `planImpact()` | unit with `backend/seed/fixtures/plans/bible-study.json` → `expected_after_approve` (64.3→65.8, Wed 11.6→11.3, weekend 8.5→11.5; half-up to 0.1 h) | — | — | not started |
| Provider adapters | adapters | contract tests with recorded responses (no network) | live smoke per provider with owner keys | …/providers.md | not started |
| BYO key not stored/logged | redaction | test greps logs/DB for key | — | — | not started |
| AI name swap | `aiName()` | snapshot with provider = ChatGPT | screenshot | …/ai-name.png | not started |

## Open decisions
D-13 (key handling), D-17 limits, D-26 models, D-25 single engine — all ASSUMED.

## Build seed
Start with `packages/planning.validate` and `AI_MODE=fixture` so the whole flow runs without keys. First failing test: "approving the Bible-study fixture plan creates a Bible study category, adds Wednesday 19:00–20:30 blocks effective from Oct 21, moves WellServices to Sunday 15:00–16:45 and Speedwatch to Saturday 17:30–18:45, all in one revision".
