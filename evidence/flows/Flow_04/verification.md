# Flow 04 — verification (Add or change a block)

Data: the owner's seeded Fall 2026 routine in local Postgres, synced to the phone. Runtime: iPhone 17e Simulator
(390×844 pt), iOS 27.0, dev build of `me.okoro.dialed` from `~/Codes/dialed`; iPhone SE (3rd gen, 375×667) for the
small-screen pass. Clock: dev preset 5 = 1:15 pm on the real date (Thu 22 Oct 2026) — the server only takes
"every week" changes dated today or later, so the Flow 03 presets (Mon 19 Oct) can't be used for writes.

Re-run: `pnpm --filter @dialed/api test` (blocks.test), `pnpm --filter mobile test`, `pnpm --filter @dialed/schedule
test`, `./scripts/flow04_evidence`; by hand (see the script header): `e2e/perm_deny.yaml`, `e2e/perm_allow.yaml`
(fresh install each), `e2e/offline_add_1.yaml` → start API → `e2e/offline_add_2.yaml`. Every flow removes what it
adds; `scripts/dev_flow04_cleanup` clears leftovers from an aborted run (dev database only).

| Requirement | Implementation | Automated | Runtime evidence | Status |
|---|---|---|---|---|
| Build seed: "Capstone reading" Mon/Thu 22:00–23:00 every week → routine_block effective today, Day shows it with New | `Blocks.addRoutine`, `AddSheet`, `RestOfToday` | `blocks.test.ts` (build seed), `flow04Rows.test.tsx`, api `blocks.test.ts` ("add every week") | `recordings/add.mp4`, `screens/add-blank-*`, `add-filled-*`, `add-saved-new-*` | passed |
| Add today only / every week + toast copy | `addOneOff`, `addRoutine`, `addToast` | `blockForm.test.ts` (all toast variants), `blocks.test.ts` | `add.mp4` ("Added to every Thursday."), `perm-*-toast-*` | passed |
| Default times: next free 5-min slot, 1 h | `nextFreeSlot` | `packages/schedule/test/changes.test.ts` | `add-blank-*` (10:00–11:00 pm after Prayers) | passed |
| Validation + focus + warning haptic + announcement | `validateAdd`, `AddSheet.onAdd` | `blockForm.test.ts` (exact copy) | `add-invalid-*` (name + category), `add-invalid-time-*` ("End time needs to be after 9:00 pm.") | passed (focus/announcement in code; spoken output unverified) |
| Overlap → "Add anyway" | `overlapOf`, `addPrimaryLabel` | `changes.test.ts`, `blockForm.test.ts` | `add-overlap-*`, `add-overlap-anyway-*` (9–10 pm runs into Prayers) | passed |
| Category picker + create (stacked) | `category.tsx`, `Blocks.createCategory` | `blocks.test.ts` (create, unique ignoring case) | `recordings/category.mp4`, `cat-*`, `cat-create-*` | passed |
| Discard dialog (dirty form only) | `usePreventRemove` + `Dialog` | — | `discard-*`; clean form closes without asking (flow assertion) | passed |
| Edit once vs every; past days unchanged | `modifyOnce`, `modifyEvery` (routine_block_edit + client `new_block_id`) | `blocks.test.ts` (past Monday keeps 975), api `blocks.test.ts` | `recordings/edit.mp4`, `edit-*`, `edit-once-saved-*`, `edit-every-*` | passed |
| Move day (Move to <day>) | `moveOnce`, `moveEvery` | `blocks.test.ts`, api (same week, target in a term) | `edit-move-*` (label), moves themselves automated only | passed (automated) / partial (runtime) |
| Skip / delete + Undo (6 s) | `skipOnce`, `deleteBlock`, close/reopen/restore | `blocks.test.ts` (Undo mutations), api (reopen, restore) | `add.mp4` (Deleted → Undo → Put back), `edit.mp4` (Skipped → Undo), `delete-undo-*`, `skip-undo-*` | passed |
| Offline add then sync | outbox, local effects, quiet vs catch-up sync toast | `syncEngine.test.ts` (8), `blocks.test.ts` | `recordings/offline-add.mp4`, `offline-add-sheet-*`, `offline-add-waiting-*`, `offline-add-synced-dark.png` (frame from the video) | passed (API stopped; airplane mode can't be simulated) |
| Server re-validation | `apps/api/src/sync/service.ts` | api `blocks.test.ts` (14): past date, outside term, foreign routine/category/block, grid, end ≤ start, taken id, stale version | — | passed |
| Permission flow | `nudge.tsx`, `reminders-help.tsx`, `notifications/reminders.ts` | `reminders.test.ts` (plan, quiet hours, cap 6) | `recordings/permission-allowed.mp4`, `permission-denied.mp4`; `nudge-*`, `ios-prompt-*`, `perm-allowed-toast-*`, `perm-denied-toast-*`, `reminders-off-*`, `reminders-help-*` | passed (Simulator; real iOS prompt on a fresh install) |
| Local reminder actually fires | `rescheduleReminders` (next 48 h) | `reminders.test.ts` | — | unverified (needs a device or waiting for a real time) |
| Haptics | `lib/haptics` | — | — | unverified (physical device only) |

## Accessibility
- Automated (`flow04A11y.test.tsx`, `flow04Rows.test.tsx`): chips are buttons with selected state; "+ New" reads
  "New category"; Push alert row reads its value; sheet titles are headers; Close labelled; rows say ", new" and
  ", waiting to sync"; edit day chips and scope are radio groups with selected state.
- Targets: chips 36 + 4 pt slop, day chips / scope 40 + 2, swatches 34 + 5, Notice action 40 + 2, toast Undo 34 + 5.
- Native pieces: time pickers (UIDatePicker), Push alert menu (UIActionSheet), sheets (UISheetPresentationController
  with grabber; drag-to-dismiss on a dirty Add form asks first).
- Unverified: spoken VoiceOver order and focus moves (the Simulator has no VoiceOver).

## Fidelity deltas vs prototype v8 (and why)
- Push alert default "Default (off)" (D-32, named in the flow file).
- Sheets are native iOS sheets (Design_Identity platform deltas): system grabber and dimming instead of the drawn
  scrim; Add/Edit/Category use one tall detent so the keyboard never resizes the sheet under the finger.
- Recent category chips = last 3 used (flow file), topped up with work categories.
- Edit sheet: category opens the picker (flow file); name can't be empty (prototype allowed it) — ASSUMED.
- Delete/skip haptic light (flow file; prototype warning).
- "Move to <day>, this week only" really moves the block to that date (flow file; the prototype only hid it).
- Discard dialog keeps the prototype's custom dialog; reminders help uses the app name, not "Week".
- After saving, Rest of today scrolls the new row into view (the 10 pm row is below the fold) — builder addition.
- "New" chip lasts 5 s (sub-interactions file); the prototype kept it until the next add.
- "Synced N changes." only after catching up from offline/paused (prototype behaviour); online edits sync quietly.
- Overlap and toast copy follow the prototype where the flow file paraphrases.
- Time pickers show iOS's own "10:00 PM" format.

## Known issues
- The LogBox "onAnimatedValueUpdate" dev warning (Flow 03 finding) also follows native sheet transitions.
- Simulator only: the first + tap right after the dev-clock long-presses is sometimes dropped (`_open_add.yaml`
  retries). Not seen with normal taps.
