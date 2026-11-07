# Flow 02 — gap closure plan (2026-11-07)

Status: **waiting for owner approval.** Server pipeline is green (imports 7/7). This closes the six mobile gaps the proof session found against `flows/Flow_02_First_Week_Setup.md`. All UI follows prototype v8 states `photoReview` and `calImport`; the new error states reuse the existing Stamp/Page patterns, so no D-35 departure.

## What exists today (checked)
- `reading.tsx` uploads, then `router.replace('/plan/[id]')` → Flow 06 Review. A nothing-found read comes back as a `failed` plan with `error_code = nothing_found` and lands on the generic Flow 06 error page.
- Server: low-confidence classes are stored as plan checks `low_confidence:<weekday>:<start>`; no confidence on the change itself. With an existing term, **no `update_term` change is emitted**, so there is nothing to PATCH dates into.
- Server already sends the exact Limit copy in the `daily_limit` message.
- `calendarImport.importSummary` exists but is unused; the preview stamp shows one total. `getEventsAsync` expands repeating series into instances.
- Camera denied is a toast on Day (`day.tsx:63`). Chooser has no offline handling.
- Review approve always goes to `plan/[id]/done`.

## Steps (failing test first in each)
1. **Server tweaks** (`apps/api/src/imports/routes.ts`, `imports.test.ts`)
   - Low-confidence check id becomes `low_confidence:<change index>` so the client marks the exact card (two classes at the same time no longer collide).
   - With an existing term, emit an `update_term` change prefilled with the term's dates (or the file's "Week of" hint for the start), so Found classes can edit dates via `PATCH …/changes/:cid {payload}`. Approve with unchanged dates is a no-op update.
   - Tests: REF-002 fixture with an existing term → plan has 6 `new` + 1 `update_term`; a low-confidence fixture → check ids point at the right changes.
2. **Pure view model** (new `apps/mobile/src/import/foundClasses.ts` + `__tests__/foundClasses.test.ts`)
   - Splits a timetable plan into class cards, the term change, and category changes (hidden, always on).
   - `lowConfidence` set from checks; `overlaps` among enabled classes and against existing routine blocks in that term → "Overlaps <title> on <day>".
   - Button label: "Add N classes to <term>" / "Turn on a class to add"; partial stamp "Check these: N times were hard to read."; date validation (ends ≥ starts).
3. **Found N classes page** (new `app/(app)/import/found.tsx`)
   - Header back: "Retake" (camera) or "Pick another" (re-opens the source sheet). H1 "Found N classes", sub "From <file>. Check the times, then add them."
   - Cards: title, weekday + time range in Anton, kind · room, switch ("Include <title> <kind>", selection haptic), "Check these" marker, overlap note. Cards fade/rise in (static under Reduce Motion).
   - Term starts / Term ends native date pickers → PATCH the term change payload.
   - Pinned button → `POST approve` (spinner, success haptic) → Day + toast (step 6).
   - States on the same route: **No classes found** page ("Try a clearer photo or a PDF from your student portal." + Retake / Pick another / Describe instead), Partial read stamp.
   - `plan/[id]/index.tsx`: a `ready`/`stale` plan with `source = timetable`, or `failed` with `nothing_found`, routes here (so Recent plans reopen it with toggles restored).
4. **Reading page** (`reading.tsx`)
   - On success route to Found (not Review). Stamps instead of the error page: "Can't read that" ("Use a photo, screenshot, PDF or Word file under 15 MB.") and **Limit** (server message). `vision_unavailable` keeps its current copy. Provider errors fall through to the Flow 06 error pattern.
   - Align copy with the flow file: "From <file name>. Takes a few seconds." and steps "Reading the <PDF|Word doc|screenshot|photo>", "Finding days, times and rooms", "Matching to <term>". (Not in your list, but the flow file names it; small.)
5. **Setup chooser** (`SetupChooser.tsx`, `day.tsx`)
   - `offline` prop: stamp "Offline · Connect to read your timetable" above the options; timetable, describe and calendar disabled (`accessibilityState.disabled`, dimmed); Build it myself still works.
   - Camera denied: replace the toast with an inline stamp on the chooser ("Camera access is off. Turn it on in Settings to take a photo.") + **Open Settings** button; cleared on the next pick.
6. **After-Approve toasts** (`found.tsx`, `review.tsx`, `plan/copy.ts`)
   - Timetable: Day + "Added 6 classes to Fall term. Now tell <AI> about your projects." with **Describe** → Flow 06 composer, empty text.
   - Calendar (`source = calendar`, from Review): skip Done, go to Day + "Imported your calendars into <term>. Check them in Routines." Other sources keep the Done page.
   - The toast is shown after the navigation settles so it lands on Day, not under a closing page.
7. **Calendar preview split** (`calendarImport.ts`, `calendars.tsx`, tests)
   - New pure `summarizeEvents(events)`: repeating = distinct weekly series (title + weekday + start time), one-off = non-repeating instances; all-day events skipped (flow file edge case).
   - `loadCalendars` stores `repeating` / `oneOff` per calendar; stamp "Preview: N repeating events become your <term> routine. M one-off events stay as one-off changes."; button "Import N+M events".
8. **Proof**
   - Unit/component tests above; full mobile + api suites; lint, typecheck.
   - Maestro (new `apps/mobile/e2e/flow02_*.yaml`, output to `/tmp`): offline chooser, timetable fixture → Found 6 → toggle one → dates → Add → Day + toast; nothing-found fixture; limit (7th read); camera denied stamp (`simctl privacy revoke camera`); calendar with seeded Simulator calendar → split stamp → Review → Approve → toast.
   - Screenshots to `evidence/flows/Flow_02/`, light/dark, SE + AX1, **one** contact sheet compared to `photoReview`/`calImport` in a single pass. `verification.md` with automated / static / runtime / unverified.
   - Commit per green step (`flow-02: …`), push when green.

## Assumptions to log (D-70…)
- Offline stamp shown once above the options rather than on each card.
- Existing-term timetable imports always carry an `update_term` change (no-op if dates unchanged).
- Calendar "repeating event" counts one per weekly series, not per instance.
- Calendar deny stays a page (built earlier) though the flow file says toast — **your call**; switching it is ~10 lines.

## Out of scope
- Live REF-002 read with your key (stop point, unchanged).
- Background upload continuation; alternating A/B weeks note.

---

# Flow 02 — First-week setup: outline

Build after Flow 06 is green; it reuses the plans, the engine, Review and Approve.

Sources:
- `flows/Flow_02_First_Week_Setup.md`, its sub-interactions file
- C-0102, C-0206, C-0205
- BACKEND_SETUP §6 (timetable pipeline) and §9 (calendar)
- SECURITY.md lines 49–53
- Fixtures: `backend/seed/fixtures/timetable/` (`timetable-ref002.png`, `timetable.pdf`, `timetable-scanned.pdf`, `timetable.docx`, `expected-classes.json`)

## Scope
- The setup chooser options (Flow 03 renders the chooser; Flow 06 already wires Describe).
- Timetable: source action sheet, camera / Photos / Files, then Reading, then Found N classes.
- Calendar: permission, then Pick calendars, then Flow 06 Review.
- Build it myself goes to the Flow 05 routine editor (C-0205, with the "Name your term" step when there is no term).

## Steps
1. **Extractor (server, fixture first).** `packages/planning/src/timetable.ts`:
   - DOCX is read with `mammoth` (entity expansion off).
   - A PDF with fewer than 200 characters of text is treated as scanned and its pages go to vision; other PDFs are read with `pdfjs-dist` (JS off).
   - Images go to vision through the adapter (`supportsVision`).
   - The output is a `{title, kind, weekday, start, end, room?, confidence}` JSON array → `new` changes in category Class (protected), source `timetable`, plus `create_term` (named by month) or `update_term`.
   - **Failing test first (build seed):** uploading REF-002 with `AI_MODE=fixture` creates a ready plan with 6 `new` changes in category Class and deletes the temp file.
   - New dependencies: `pdfjs-dist` and `mammoth`, both already named in BACKEND_SETUP §1.
2. **Upload route.**
   - `POST /v1/imports/timetable` (multipart) uses the Idempotency-Key and allows one import at a time.
   - Files are allowed by magic bytes (JPEG / PNG / HEIC / PDF / DOCX), up to 15 MB, written to `UPLOAD_DIR/<uuid>` with mode 0600 and deleted in a `finally` block. An hourly `uploads.sweep` job is the backstop.
   - The import counter uses `IMPORT_DAILY_LIMIT` (6).
   - Rejection tests: an .exe renamed to .pdf, a 20 MB file and a DOCX zip bomb.
   - **Security gap to close:** SECURITY.md only covers entity expansion. Add a cap on decompressed size and entry count for DOCX and record it in SECURITY.md.
   - If the bring-your-own provider has no vision, fall back to the server key with consent copy; otherwise `vision_unavailable`.
3. **Term dates on review.** `PATCH changes/:cid {payload}` for `create_term` / `update_term`, applied inside Approve (already in the Flow 06 mapping). Validate that ends ≥ starts.
4. **Calendar import.**
   - Device: `expo-calendar`, a new dependency for D-28 read-only access.
   - `buildCalendarImport` groups weekly recurring events into routine blocks and leaves the rest as one-offs. Only titles and times are sent: no notes, attendees or locations.
   - `POST /v1/imports/calendar` takes at most 500 events. Category is matched by title, with Study as the default.
   - The result goes to the Flow 06 Review (D-36).
   - Unit tests with recurring and one-off fixtures.
5. **Mobile pages.**
   - The source action sheet.
   - Camera and Photos through `expo-image-picker` (one new dependency for both); Files through `expo-document-picker`.
   - HEIC is converted to JPEG at 2560 px or less on the device (`expo-image-manipulator`, or the picker's own output options if they're enough; prefer that to avoid a dependency).
   - The Reading page reuses `DialLoader` / `StepList`; Cancel aborts the upload.
   - The Found N classes page: class cards with "Check these" markers below 0.7 confidence, overlap notes, term date fields, and the pinned button "Add N classes to <term>".
   - States: No classes found, Partial read, Limit, Can't read that, Camera denied (Open Settings).
   - After Approve: Day + toast "Added 6 classes to Fall term…" with a Describe action.
   - Calendar: the Pick calendars page (Birthdays and holidays unchecked, preview stamp), the deny toast.
   - Usage strings: `NSCameraUsageDescription` and `NSCalendarsFullAccessUsageDescription`, which need a native rebuild.
6. **Proof.**
   - Maestro: setup → timetable with an injected fixture image → Found 6 → Approve → Day; calendar with a seeded Simulator calendar.
   - Dark and light, SE and AX1, one contact sheet.
   - `verification.md`.
   - The live REF-002 read with the owner's key is a stop point, as in 06.

## Open items to confirm with the owner
- D-36: calendar import goes through Review. ASSUMED, waiting on the owner's confirmation.
- Term auto-naming by month (ASSUMED).
- D-17 import limit (6) and D-19 retention (ASSUMED).

## Main risks
- Vision output varies from file to file. Rely on fixture determinism, and run the live read as a smoke test only.
- HEIC handling in the Simulator.
- Calendar permission resets between evidence runs.

