# Flow map

## Product outcome
The Planner always knows what's now and next (signature moment 1) and changes their week by describing it and approving a draft (signature moment 2). Success metrics for v1: first week set up in < 5 min; a typical plan drafted in < 20 s and approved with ≤ 2 taps; lock-screen information correct at every block boundary; zero schedule changes without an Approve.

## Flow registry
| ID | Flow | Primary actor | Goal | Trigger | Success outcome | Entry flows | Exit flows | Depends on | Proof |
|---|---|---|---|---|---|---|---|---|---|
| 01 | Account access (`flows/Flow_01_Account_Access.md`) | New or returning Planner | Get into their own account (sign up, sign in, recover, leave, delete) | App launch without a session; Account sheet | Valid session on device; or signed out / deleted cleanly | — | 02 (new account), 03 (returning) | shared-foundation | Simulator run: sign up → code → Day; sign in wrong/none; reset; delete; auth_smoke report |
| 02 | First-week setup (`Flow_02_First_Week_Setup.md`) | New Planner | Get a first routine with their classes in it | Day opens with no routine | Approved plan created ≥ 1 routine block in the active term | 01 | 03, 06, 05 | 01, 05, 06 | Import the owner's timetable PNG, a PDF and a DOCX fixture → 6 classes → Approve → Day shows them; calendar import fixture |
| 03 | See my schedule (`Flow_03_See_Schedule.md`) | Planner | Know what's now/next today and how the week/month looks | Open app, tab change, widget/notification tap | Correct resolved Day/Week/Month for the clock, online or offline | 01, 02, 06, 08 | 04, 05, 06 | shared-foundation (sync, resolveDay) | Snapshot + runtime at 3 clock states, offline, sync pill; parity test resolveDay device vs server |
| 04 | Add or change a block (`Flow_04_Block_Changes.md`) | Planner | Add, edit, move, skip or delete one block correctly | + button; tap a row; Add to Mon in routine editor | Block saved (today only or every week) and synced; Undo available | 03, 05 | 03, 08 | 03, 09 (categories) | Add with overlap; edit once vs every; move day; delete + undo; offline add then sync |
| 05 | Maintain routines and terms (`Flow_05_Routines_Terms.md`) | Planner | Keep each term's weekly routine and dates right | Month → Routines; Settings → Terms; Build it myself | Routine saved with an effective date; terms dated | 03, 02, 09 | 03, 06 | 04 | Edit Fall term, copy Mon to Tue/Thu, save effective next Monday; past days unchanged |
| 06 | Plan with AI in the app (`Flow_06_Plan_In_App.md`) | Planner (with in-app AI engine) | Turn a described change into an approved, applied plan | AI mark button; Describe a change; first-run Describe; plan notification | Approved plan applied atomically; routine/one-offs updated | 03, 05, 02, 07, 08 | 03, 05 | 05, shared AI engine | Fixture provider: proposal, question, error ×3, stale, reply, approve; live provider smoke |
| 07 | Plan from an AI app (`Flow_07_Plan_From_AI_App.md`) | External AI assistant acting for the Planner | Read the real schedule and deliver a valid draft for approval | Planner asks their AI app; Settings → connect | Draft `ready` and notified; reviewed in Flow 06 | 09 (connect), — | 06 | 06 (validator, review) | MCP Inspector + Claude connector: OAuth, tools, draft → push → review; cross-user denial |
| 08 | Glance without opening (`Flow_08_Glance.md`) | Planner | See now/next on lock screen, Dynamic Island, widgets and reminders without opening the app | Block boundaries; widget added; notification time | Live Activity for work blocks, correct line/widgets, notifications within cap | 03 | 03, 06 | 03, 04, 05, 09 | Physical iPhone: LA push-to-start at boundary, Line only, widgets at 3 times, cap/quiet hours |
| 09 | Tune Dialed (`Flow_09_Settings.md`) | Planner | Set categories, notifications, AI provider/connector entry and data export the way they want | Account sheet → Settings | Settings saved/synced and reflected everywhere | 01, 03 | 08, 07, 04 | 03 | Rename/recolour/merge/delete category; notification prefs change local schedule; export bundle |

## Dependency order
| Batch | Kind | Includes | Depends on |
|---|---|---|---|
| 0-scaffold | shared | monorepo, CI, Docker Compose, migrations, seed, bootstrap, auth_smoke, migration_replay, tokens package, design primitives, error envelope, logging | none |
| shared-foundation | shared | identity/session (tokens, refresh, Keychain), sync engine (pull/push/outbox), `resolveDay`, local SQLite mirror, notifications infra (APNs client, device registration, local scheduler shell), error taxonomy, observability, AI provider adapters + validator core (`packages/planning`) | 0-scaffold |
| flow-01 | flow | Flow_01 | shared-foundation |
| flow-03 | flow | Flow_03 (first vertical slice ends here: sign in → Day from Postgres via sync) | flow-01 |
| flow-04 | flow | Flow_04 | flow-03, flow-09 categories service (create category from the picker uses the shared category service built in shared-foundation; Flow 09 adds management UI) |
| flow-05 | flow | Flow_05 | flow-04 |
| flow-09 | flow | Flow_09 | flow-03 |
| flow-06 | flow | Flow_06 | flow-05, shared AI |
| flow-02 | flow | Flow_02 | flow-06, flow-05 |
| flow-07 | flow | Flow_07 | flow-06 |
| flow-08 (parallel native track) | flow | Flow_08 — starts after flow-05: snapshot writer, widget target, Simulator previews and locally-started Live Activities; push-to-start, APNs and haptics proofs run when the owner has Apple Developer enrolment + a physical iPhone. Its device rows are **unverified by design** until then and do not block the main line. | flow-05, flow-09 (quiet flag, notification prefs) |

First vertical slice: Batch 0 → shared-foundation → Flow 01 (email path only) → Flow 03 Day view reading the seeded owner routine from Postgres through sync (`since=0` snapshot) into SQLite, offline-capable. Flow 03 also owns the empty-Day setup chooser (its options are wired as Flows 05/06/02 land), so Flow 01's "sign up → empty Day" proof works in the slice. Prove it on the Simulator before anything else.

Main line: 01 → 03 → 04 → 05 → 09 → 06 → 02 → 07, with 08 as the parallel native track. "Never advance while red" applies to the main line; rows marked "unverified by design" (need Apple enrolment, a physical device, a public host, or a D-35 screen still awaiting prototype approval — built behind a feature flag) are reported, not blocking.

## Surface and function coverage
See `00_Surface_Coverage.md` for exact-once ownership of all 76 prototype states plus native-only surfaces. Server functions by flow:
- 01: `/v1/auth/*`, `DELETE /v1/account`, Apple revoke, purge job.
- 02: `/v1/imports/timetable`, `/v1/imports/calendar`, uploads sweeper.
- 03: `/v1/sync/pull`.
- 04, 05, 09 (data): `/v1/sync/push` mutations (`category`, `term`, `routine`, `routine_block`, `override`, `profile`).
- 06: `/v1/plans*`, `/v1/ai/test-key`, `push.plan_ready`.
- 07: `/mcp`, `/oauth/*`, `/.well-known/*`, `/v1/connector*`, `push.chat_draft`.
- 08: `PUT /v1/devices/current`, `la.schedule|start|end`, `push.sync_nudge`.
- 09: `GET /v1/account/export`.

## Cross-flow edges
| Edge | Contract (in `00_Flow_Contracts.md`) |
|---|---|
| 01 → 02 | C-0102 new account lands on setup |
| 01 → 03 | C-0103 returning account lands on Day |
| 02 → 06 | C-0206 describe/timetable/calendar produce a plan reviewed in Flow 06 |
| 02 → 05 | C-0205 "Build it myself" opens the routine editor for the active term |
| 03 → 04 | C-0304 + button and row tap open add/edit sheets |
| 03 → 05 | C-0305 Month → Routines |
| 03 → 06 | C-0306 AI mark / Describe a change opens Plan it |
| 04/05/06/09 → 08 | C-x08 any schedule or settings change refreshes glance surfaces |
| 06 → 03 / 05 | C-0603 approved plan returns to Week or Routines |
| 07 → 06 | C-0706 chat draft reviewed and approved in Flow 06 |
| 08 → 03 / 06 | C-0803 widget/LA/notification taps deep-link into Day/Week/Review |
| 09 → 07 | C-0907 Settings → AI assistant → connector section |
| 01 (sign out/delete) → all | C-01x session end wipes local data and glance surfaces |
