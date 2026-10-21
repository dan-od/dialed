# Flow_02: First-week setup

## Goal
A new Planner gets a first routine with their classes in it. Trigger: Day opens with no routine blocks in any term (after Flow 01). Success: an approved plan (timetable, calendar or described) created ≥ 1 routine block in a term, and Day shows it. Boundary: the four starts and the timetable/calendar pre-review steps; drafting/review/approve mechanics belong to Flow 06, the routine editor to Flow 05. Neighbours: 01 (entry), 06, 05, 03 (exit).

## References and coverage
REF-001 states: `setup` (= `day-first`), `ttSource`, `filePick`, `photo`, `photoReview`, `calDialog`, `calImport`. REF-002 (owner timetable) is the primary import fixture. Native: NAT-02 (Reading your classes), NAT-03 (camera/Photos/Files system UI). Changed from prototype: `filePick` and `photo` are real system pickers/camera; `calDialog` is the real iOS prompt.

## Entries, sequence, and exits
1. **Set up your week** (Day, empty, nav visible): four options — hero **Add your timetable** ("Photo, screenshot, PDF or Word doc. <AI> turns it into classes you check."), **Describe your week**, **Import from Apple Calendar**, **Build it myself**.
2. **Add your timetable** → action sheet: Take a photo / Choose from Photos / Import a file (PDF or Word). Footer: "<AI> reads it once and shows you what it found. Nothing is added until you approve."
   - Take a photo → camera with corner guides "Fit the week in frame", shutter, Photos shortcut. Retake from review.
   - Choose from Photos → `PHPicker` (images only).
   - Import a file → document picker (`com.adobe.pdf`, `org.openxmlformats.wordprocessingml.document`, images).
3. **Reading your classes** page: dial loader, "From <file name>. Takes a few seconds.", steps tick in ("Reading the PDF/Word doc/screenshot/photo", "Finding days, times and rooms", "Matching to <term>"), Cancel (back).
4. **Found N classes** page: one card per class meeting (title, weekday + time range in Anton, kind · room, switch on), Term starts / Term ends date fields (prefilled from the existing term, or from the file — REF-002 shows "Week of Sep 14" → starts 2026-09-14; if no term exists the plan carries a `create_term` change named by month — Fall/Winter/Summer term — editable here), pinned button "Add N classes to <term>" (disabled at 0 "Turn on a class to add"). Back: "Retake" (camera) or "Pick another".
5. Approve → `POST /v1/plans/:id/approve` (Flow 06 contract) → Day (now populated) + toast "Added 6 classes to Fall term. Now tell <AI> about your projects." action **Describe** → Flow 06 composer.
6. **Import from Apple Calendar** → iOS permission prompt (full access) → Pick calendars page: checkbox list with colour dot and event counts (Birthdays, holidays unchecked by default), stamp "Preview: N repeating events become your <term> routine. M one-off events stay as one-off changes." → "Import N events" → plan → **Flow 06 Review** with every imported block as a switchable change (D-06: nothing is added without the Approve tap) → Approve → Day + toast "Imported your calendars into <term>. Check them in Routines."
   Deny → toast "No calendar access. You can still add your timetable or describe your week."
7. **Describe your week** → Flow 06 composer with empty text (C-0206). **Build it myself** → Flow 05 (C-0205).
Exits: Day (03), Plan it (06), Routine editor (05).

## States and feedback
| State | Feedback |
|---|---|
| Setup empty | four options; offline: timetable/describe/calendar show stamp "Offline · Connect to read your timetable" and are disabled; Build it myself works offline |
| Camera permission denied | stamp + "Open Settings" |
| Photos limited access | picker shows limited set (system) |
| File unsupported / too large | stamp "Can't read that": "Use a photo, screenshot, PDF or Word file under 15 MB." |
| Reading | loader + steps; Cancel returns, upload aborted, file deleted server-side |
| Nothing found | page "No classes found" + "Try a clearer photo or a PDF from your student portal." + Retake / Pick another / Describe instead |
| Partial read | review shows found classes; stamp "Check these: 2 times were hard to read." with those cards marked |
| Provider/vision error | Flow 06 error pattern ("<AI> didn't answer", Try again ×3, then saved for later) |
| Daily limit | stamp "Limit": "You've used today's 6 timetable reads. Try again tomorrow or bring your own AI key in Settings." |
| Review toggles | selection haptic; count updates in button |
| Overlapping classes | card note "Overlaps <title> on <day>" (both kept; validator flags) |
| Approve busy | spinner in button |
| Approved | success haptic, Day populated, toast with Describe |
| Calendar empty selection | button "Pick a calendar" disabled |

## Interaction surface and transitions
- Setup: **page** (Day empty state, fade in).
- Source choice: **action sheet** (3 choices, transient).
- Camera/Photos/Files: **system full-screen**.
- Reading / Found classes / Pick calendars: **pages** (reading and comparing; pinned CTA).
- Permission: **system alert**.
Haptics: light on shutter; selection on switches/checkboxes; success on approve/import. Reduce Motion: static loader, cards fade.

## Actions and functions
| Action | Function | Validation / auth | Side effects | Idempotency / retry |
|---|---|---|---|---|
| Upload timetable | `POST /v1/imports/timetable` (multipart, Idempotency-Key) | session; magic-byte allowlist; ≤15 MB; daily limit (server key) | temp file → extractor → plan `source=timetable` → file deleted | resend same key returns same plan; one import at a time |
| Poll / stream plan | `GET /v1/plans/:id` (poll 1 s, max 90 s) or SSE `GET /v1/plans/:id/events` | owner | — | — |
| Toggle class | `PATCH /v1/plans/:id/changes/:cid` | owner, plan `ready` | enabled flag | last write wins |
| Set term dates | new accounts: the plan's `create_term` change; existing term: the plan's `update_term` change — dates edited here via `PATCH …/changes/:cid {payload}`, applied inside Approve (no separate sync mutation, so the plan never goes stale from its own edit) | dates valid, ends ≥ starts | term + routine created inside the approve transaction | — |
| Approve | `POST /v1/plans/:id/approve` | `ready`, base_revision | routine_blocks (source `timetable`, category Class, `protected`) | idempotent by state |
| Calendar read | device `Calendar.getEventsAsync` for term range | permission | none server-side | — |
| Calendar import | `POST /v1/imports/calendar` `{events:[{title,start,end,rrule?,calendar}]}` (titles + times only) | ≤ 500 events | plan `source=calendar` (weekly → routine blocks, one-offs → overrides; category matched by title or Study default) | Idempotency-Key |

## Data and integrations
- Persistent data: yes
- Server: `plans`, `plan_changes`, `terms`, `routines`, `routine_blocks`, `overrides`, `usage_counters`; temp files in `UPLOAD_DIR` (deleted ≤ 1 h, D-19).
- Device: SQLite (after sync), no file copies retained (image picker temp files deleted after upload).
- External: provider vision (server key or BYO if vision-capable; else server read step with notice), `pdfjs-dist`, `mammoth`.
- Extracted JSON contract per class: `{title, kind: lecture|tutorial|lab|seminar|other, weekday, start, end, room?, confidence}`; low confidence (<0.7) → "Check these" marker.

## Security and abuse cases
Malicious files (zip bombs via DOCX, PDF JS, huge images) → limits in SECURITY; prompt injection inside the document ("ignore instructions…") → output is only a draft of classes, validator enforces shape; PII in files (student ID, name) → never stored or logged, file deleted; cross-user plan access → 404; cost abuse → daily limit; calendar data minimisation (no notes/attendees/locations sent).

## Accessibility
Option cards are buttons with full labels; camera shutter labelled "Take photo"; reading state announced via live region per step; review cards: switch label "Include <title> <kind>"; date fields native pickers; button count announced on change.

## Platform behavior
iOS 17+ PHPicker (no Photos permission needed for picking), `NSCameraUsageDescription` ("Take a photo of your timetable so Dialed can read your classes."), `NSCalendarsFullAccessUsageDescription` ("Dialed reads your events once to build your routine. It never changes your calendars."), HEIC converted to JPEG client-side before upload (max 2560 px long edge).

## Contracts
C-0102 (entry), C-0206, C-0205, `ai-engine`, `sync` (pull after approve), `error-taxonomy`.

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| Setup shows for empty account | `DayScreen` empty branch | component test | screenshot | evidence/flows/Flow_02/setup.png | not started |
| PNG timetable → 6 classes | `extractTimetable` (fixture provider) | `timetable.extract.test.ts` with REF-002 → expected 6 meetings | Simulator: upload REF-002 | …/png-review.png | not started |
| PDF text + scanned PDF | `pdfText`, vision fallback | fixtures `timetable.pdf`, `timetable-scanned.pdf` | — | — | not started |
| DOCX | `mammoth` path | fixture `timetable.docx` | — | — | not started |
| File rejects | upload validator | tests: .exe renamed .pdf, 20 MB, docx bomb | — | — | not started |
| File deletion | `uploads.sweep`, finally-delete | test asserts temp dir empty after success/failure | — | — | not started |
| Approve creates term + blocks | approve handler | api test | Day screenshot after | …/after-approve.png | not started |
| Calendar import | `buildCalendarImport` | unit with recurring/one-off fixtures | Simulator with seeded calendar | …/calendar.mp4 | not started |
| Limits | usage counters | api test 7th import → `daily_limit` | — | — | not started |
| Live provider smoke | anthropic adapter | manual with REF-002 (owner key) | recording | …/live-read.mp4 | not started |

## Open decisions
D-17 import limit, D-19 retention (ASSUMED). Term auto-naming by month (Sep–Dec → Fall, Jan–Apr → Winter, May–Aug → Summer) ASSUMED.

## Build seed
Build after Flow 06 (needs plans + review). First failing test: "uploading REF-002 with AI_MODE=fixture creates a ready plan with 6 `new` changes in category Class and deletes the temp file".
