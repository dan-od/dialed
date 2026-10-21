# Context — glossary

Use these words exactly in code, copy, API and tests. One term, one meaning.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Planner | The person using Dialed. One account = one schedule. | "user" in code is fine; in copy say "you" |
| Block | A time span with a title and a category on a day, e.g. "Sermon Sync 12:40–2:30". Times are local wall-clock minutes from midnight (0–1440). | Event (calendar term; we only import events) |
| Work block | A block whose category is not quiet. Gets a Live Activity and optional heads-up. | — |
| Quiet block | A block whose category has `quiet = true` (Meal and Break by default). Never buzzes by default, never gets a Live Activity; shown in the line under the date. | — |
| Gap | Time between blocks inside the Planner's day bounds. | — |
| Category | Unlimited, user-named tag with a group, a colour pair (dark/light), a visual weight and a `quiet` flag. Drives colour and totals. | Group |
| Group | Bucket for categories: Projects, School, Life (default set), user can add. | — |
| Term | A dated span with its own routine: e.g. Fall term Sep 14–Dec 11, Exam weeks Dec 12–22, Winter term from Jan 5. Status `active`, `upcoming` (Next), `draft`, `past`. | Semester (copy uses "term") |
| Routine | The repeating weekly template for one term: blocks per weekday (Mon=0 … Sun=6). | Schedule (the resolved result) |
| Routine block | A block inside a routine, repeating every week of the term. | Override |
| One-off change (override) | A dated change that wins over the routine for one date: `skip` a routine block, `modify` it, `add` a block, or `move` it to another date. Example: Thanksgiving Oct 12. | Routine edit |
| Effective date | When a routine change starts applying. Defaults differ by context and are defined once in BACKEND_SETUP §3 "Effective dates" (routine editor: next Monday; edit-every from Day: that occurrence's date; plans: the change's `from`). Past days never rewrite themselves. | — |
| Resolved day | What a date actually contains: routine blocks of the term covering that date, with overrides applied. The single function `resolveDay(date)` computes it on device and server identically. | — |
| Plan | A request + a draft list of changes produced by an AI, reviewed by the Planner. States: `drafting`, `question`, `ready`, `approved`, `discarded`, `failed`, `stale`, `cancelled`. | Routine |
| Change | One proposed item inside a plan: `new`, `moved`, `changed`, `removed`, `skip`, `create_category`, `create_term`, `update_term`. Has an on/off switch. | Override |
| Approve | The only action that applies a plan. Applies enabled changes atomically against the current revision. | — |
| Stale plan | A plan with any change_log row after its stored `base_revision` that touches a date in the plan's range or a routine/category it references. Approve is disabled; Redo plan re-drafts. | — |
| Planning guide | The rules and phrase meanings every AI receives (`mcp/planning-guide.md`), rendered per user. | System prompt |
| Validator | Server code that checks every draft change (overlaps, terms, limits, protected classes) before the Planner sees it. Bad drafts go back to the AI. | — |
| Provider | The AI vendor/model running the in-app engine: Dialed server (Claude), or bring-your-own Claude / OpenAI / Gemini / OpenAI-compatible. | Connector |
| Connector | The Dialed MCP server at `/mcp`. Any MCP-capable AI app (Claude, ChatGPT, Gemini, Cursor…) connects to it with the Planner's Dialed sign-in. | Provider |
| Draft from chat | A plan created through the connector. Arrives as a notification; reviewed with the same Review screen. | — |
| Revision | Monotonic per-user counter incremented by every server-committed schedule change. Sync cursor and staleness basis. | Version (per-row) |
| Outbox | On-device queue of pending mutations, sent to the server in order with idempotency keys. "2 to sync" pill shows its size. | — |
| Live Activity | iOS ActivityKit card on the lock screen + Dynamic Island for the current work block. | Notification |
| Line under the date | The inline lock-screen accessory widget above the clock ("Dinner · 45m left, then Sermon Sync"). | — |
| Line only | Lock-screen mode with no Live Activities; everything shows in the line. | — |
| Heads-up | Optional local notification N minutes before a work block (default off). | Meal note |
| Meal note | Optional quiet local notification when a quiet block starts (default off). | — |
| Daily cap | Maximum local notifications per day (default 6). Live Activities don't count. | — |
| Quiet hours | No notifications (default 12 am–9 am). | Quiet block |
| Timetable import | Photo, screenshot, PDF or DOCX → found classes → review → added to a term's routine. | Calendar import |
| Calendar import | Read-only import of Apple Calendar events: repeating → routine blocks; one-off → one-off changes. | — |
| Day bounds | The Planner's day start/end (default 9 am–12 am) used for bars, gaps and quiet hours. | — |
