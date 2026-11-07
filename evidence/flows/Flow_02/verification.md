# Flow 02 — First-week setup: verification (gap closure, 2026-11-07)

Plan: `plans/flow-02.md` (gap closure, approved 2026-11-07). Contact sheet: `evidence/flows/flow02-sheet-1.png`.
Runtime: iPhone 17e Simulator, dev client + Metro, dev API `AI_MODE=fixture`, `DEV_CLOCK=2037-10-20`.
Driver: `API_LOG=/tmp/f02-api.log ./scripts/flow02_evidence` (signs up the dev-only `newplanner@dialed.test`;
`FROM=camera|nothing|limit|partial|happy` resumes).

## Gaps from the proof session → status
| # | Gap | Implementation | Automated | Runtime (screens/) |
|---|---|---|---|---|
| 1 | Found N classes page | `app/(app)/import/found.tsx`, `import/foundClasses.ts` | `foundClasses.test.ts` (10) | `found-dark`, `found-toggled-dark`, `partial-*` |
| 1a | "Check these" < 0.7 | check ids `low_confidence:<ord>` (server) | `imports.test.ts` "low-confidence checks…" | `partial-dark/light/ax1` (2 cards marked) |
| 1b | Overlap notes | `buildFoundModel` overlaps | `foundClasses.test.ts` | `partial-*` ("Overlaps Capstone Study Project on Wednesday") |
| 1c | Term date fields | `update_term`/`create_term` PATCH; repeats follow dates | `imports.test.ts` "editing the term dates…" | `partial-dates-*` (fields shown; wheel edit not driven) |
| 1d | "Add N classes to <term>" | pinned button, approve → Day | — | `found-toggled-dark` (Add 5), `after-approve-dark` |
| 2 | No classes found | Found route, `nothing_found` plan | `imports.test.ts` | `nothing-found-dark` |
| 2 | Partial read stamp | `partialStamp` | `foundClasses.test.ts` | `partial-*` |
| 2 | Limit copy | `readFailure` → Limit page | `imports.test.ts` (own counter, 429 copy) | `limit-dark` |
| 3 | Offline stamps on chooser | `SetupChooser offline` | `setupChooser.test.tsx` | **not runtime** (Simulator network can't be dropped) |
| 4 | After-Approve toasts | Found → `dismissAll` + toast w/ Describe; Review (calendar) → Day + toast | copy in `foundClasses.test.ts` | timetable: `after-approve-dark`; calendar: **not runtime** |
| 5 | Calendar split stamp | `summarizeDeviceEvents`, `previewStamp` | `importFlow.test.ts` | **not runtime** (no seeded Simulator calendar) |
| 6 | Camera denied stamp + Open Settings | `day.tsx` notice, Found/Reading too | — | `camera-denied-dark` |

Approve outcome (DB, newplanner): term `Fall term` 2037-10-20 → 2038-01-20 with 5 Class routine blocks (Capstone switched
off, so not added). Day shows "Free day" in the screenshot only because the device date is the real 2026-11-07 (a
Saturday, before the 2037 term); the server runs on the dev clock.

## Bugs found and fixed during proof
- **Timetable upload could never have worked on device:** `expo-file-system` 58 throws on legacy `uploadAsync`. Now `File.createUploadTask` (foreground session), and Cancel aborts the native request.
- **Daily limit counted the wrong thing:** timetable reads checked and bumped `plan_runs` (the Flow 06 AI-plan counter). They now use `usage_counters.imports`; 20 AI plans no longer block a read, 6 reads do (test).
- **A stale term hint created a past term** (e.g. a 2026 file read in 2037): a hint whose term is already over is ignored (`newTermDates`, D-75).
- **Reanimated warning from Found cards** (opacity on the entering view), whose dev LogBox bar covered the pinned button: dimming moved to an inner view.
- **AX1 pinned-button label clipped** ("Add 4 classes to Fal…"): primary `Button` labels now shrink to fit (`adjustsFontSizeToFit`, min 0.5). Re-captured `partial-ax1.png`; not opened (one-look rule).
- Reading accepts only files inside the app sandbox (deep links can't name others); Retake/Pick another back link reads its own label to VoiceOver.

## Automated
API 164/164 (imports 13), planning timetable 20/20, mobile jest 175/175; tsc, eslint, expo lint (0 errors), prettier clean.

## Static
Security: upload allowlist, size, DOCX bomb unchanged; sandbox-only upload URIs (`isUploadableUri`); fixture variants
by file name only in `AI_MODE=fixture`. A11y: switches "Include <title> <kind>", count announced on toggle, Reading
steps announced, disabled chooser options expose `disabled` and the offline reason.

## Unverified
- Offline chooser at runtime (component test only).
- Calendar Pick calendars split stamp and calendar post-Approve toast at runtime (no seeded Simulator calendar; unit tests only).
- Reading page screenshot (the fixture returns too fast to capture; captured only if still visible).
- Term date wheel edit on device (server PATCH + repeat carry proven by API test).
- iPhone SE size; live REF-002 read with the owner's key (stop point); camera capture itself (Simulator has no camera).

## Visual deltas vs prototype `photoReview` / setup
- "Check these" stamp is the filled warning stamp; the prototype's marker style is lighter.
- Setup "Free day" after approve (dev-clock artifact, above).
