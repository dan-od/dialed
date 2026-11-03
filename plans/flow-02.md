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

