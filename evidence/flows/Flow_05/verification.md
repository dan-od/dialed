# Flow 05 — verification (Routines and terms)

Data: the owner's seeded Fall 2026 routine (59 blocks, 64h a week) in local Postgres, synced to the phone.
Runtime: iPhone 17e Simulator (iOS 27.0, dev build of `me.okoro.dialed`), iPhone SE (3rd gen) for 375×667, Dynamic
Type AX1 on the 17e. Clock: dev preset "today 1:15 pm" (Thu 22 Oct 2026), so "next Monday" is Mon 26 Oct.

Re-run: `pnpm --filter @dialed/api test` (routines.test), `pnpm --filter mobile test` (routineDraft, routinesModel,
blocks), `pnpm --filter @dialed/schedule test`, `./scripts/flow05_evidence` (tour, remove, copy, save, light); by
hand: `e2e/routine_swipe_back.yaml`, `e2e/routine_restore.yaml`, `e2e/term_dates.yaml`, `e2e/ax_tour05.yaml`
(TAG=se on the SE, TAG=ax1 with content size accessibility-medium), `e2e/routine_offline_save.yaml` (API stopped,
then start it). `scripts/dev_evidence_cleanup` puts the owner's routine, terms and overrides back to the seed.

| Requirement | Implementation | Automated | Runtime evidence | Status |
|---|---|---|---|---|
| Build seed: Monday Gym moved to 17:00 from 2026-10-26 leaves Oct 19 unchanged, changes Oct 26 | server `routineSave`; device `draft.ts`, `routineSaveEffects` | api `routines.test.ts` (Postgres + packages/schedule); mobile `routineDraft.test.ts` (offline, idempotent re-apply) | `recordings/save.mp4`: Gym removed + Capstone reading added in routine mode, saved from next Monday; `editor-after-save-*`; server shows Gym ending 2026-10-26 | passed |
| Effective-dated save keeps past days; Next Monday (default) / Today / Pick a date (BACKEND_SETUP §3) | `routine-save.tsx`, `saveSentence`, `saveToast` | `routinesModel.test.ts` (sentence and toast per choice) | `save-sheet-next-monday-*`, `save-sheet-today-*`, `saved-*` ("Fall term saved. Changes start Mon Oct 26.") | passed |
| Atomic save + conflict | one `routine_save` transaction; stale `base_version` → conflict (engine Reapply toast) | api: one bad op rejects the whole save; stale version → conflict; past date refused; foreign routine/block/category → not_found; 200-op cap | — | passed (automated) |
| Remove + Undo | `removeBlock` / `restoreBlock`, toast action | `routineDraft.test.ts`; `toastList.test.tsx` (Undo's "Put back." stays) | `recordings/remove.mp4`, `remove-undo-*`, `remove-put-back-*` (clean again: "Changes start next Monday") | passed |
| Copy day (classes stay, replaces line, nothing picked) | `copyDay`, `routine-copy.tsx` | `routineDraft.test.ts` (replace, keep protected, error) | `recordings/copy.mp4`, `copy-sheet-*` ("Replaces what's on Tue and Thu."), `copy-tuesday-*` | passed |
| Discard guard (Back and swipe-back) | `usePreventRemove` + `Dialog` | — | `discard-routine-*`, `swipe-back-discard-dark.png` (`e2e/routine_swipe_back.yaml`) | passed |
| Draft kept on the phone (app killed mid-edit) | `RoutinesUi` (store meta per routine) | — | `draft-restored-dark.png` (`e2e/routine_restore.yaml`) | passed |
| Offline save then sync | outbox + local effects | `routineDraft.test.ts` | `recordings/offline-save.mp4`, `offline-editor-*`, `offline-save-sheet-*` ("Save on this phone"), `offline-saved-*`, `offline-synced-dark.png` (frame) | passed (API stopped; airplane mode can't be simulated) |
| Add to Mons (Flow 04 sheet, routine mode → draft, no outbox) | `add.tsx` routine mode | `blockForm.test.ts` ("Add to routine") | `add-routine-mode-*`, `editor-added-*` ("Added to every Monday.", highlighted row) | passed |
| Terms: dates inline, status tags, gap/overlap notices, rules | `terms.tsx`, `termNotices`, `termStatus` | `routinesModel.test.ts`; api term tests (ends before starts, save, new term + routine id) | `terms-*`, `terms-rules-*`, `term-date-picker-dark.png`, `term-date-saved-dark.png` (Dec 11 → Dec 18 saved; overlap notice appears) | passed |
| Overlapping terms: earlier start wins | `packages/schedule termFor`, server `termOn` | `changes.test.ts` | `term-date-saved-dark.png` notice | passed (ASSUMED rule) |
| Name your term (NAT-11, D-35) | `name-term.tsx` behind `FEATURES.d35Screens` (`EXPO_PUBLIC_FEATURE_D35`, inlined by Metro; bare builds bake `Constants.expoConfig` in at build time, which is why restarting Metro with the old variable did nothing) | `features.test.ts`; `routinesModel.test.ts` (defaults today → +13 weeks, helper, errors); `blocks.test.ts` (term + routine id) | flag on: `name-term-{dark,light}`, `name-term-error-*`, `name-term-created-*` ("Spring term" → empty Monday editor; removed after) | passed with the flag on; ships off until approved |
| Routines page (active card, other terms, one-off changes) | `routines.tsx`, `oneOffChanges` | `routinesModel.test.ts` | `routines-*` (64h; Mon 10.4 … Sun 3.3 match the prototype) | passed |
| Light theme | tokens | — | `screens/*-light.png` (10) | passed |
| 375×667 (iPhone SE) | layouts are width-relative | — | `screens-se/se-*` (6) | passed |
| Dynamic Type AX1 | status under the title, tabs 4 + 3, times above titles, stacked actions, save choices and term dates | — | `screens/ax1-*` (6) | passed (visual) |
| Haptics | selection on tabs, light on remove/copy, success on save, warning on discard | — | — | unverified (physical device only) |
| Spoken VoiceOver | tabs "Monday, 10.4 hours"; remove "Remove Gym from every Monday"; radio/checkbox states | labels asserted through Maestro's accessibility tree | — | labels passed; speech unverified (no VoiceOver in the Simulator) |

## Fidelity deltas vs prototype v9 (and why)
- Save sheet has the effective-date choice (Next Monday / Today / Pick a date): BACKEND_SETUP §3 says the Planner
  can change it, and it outranks the prototype's fixed sentence. The sentence and toast follow the choice.
- "Recent plans" is not on Routines (prototype: it lives on Plan it, Flow 06). — question for the owner.
- Editor Starts/Ends are read-only tiles (prototype); dates are edited in Terms.
- Empty day copy: prototype's "Nothing repeats on Mondays yet. Add the first block below."
- Copy sheet keeps the prototype sentence and adds the flow file's live "Replaces what's on Tue and Thu." line;
  "Pick at least one day." is inline (a toast can't show over a native sheet); the toast copy is the prototype's
  "Copied Monday to Tue, Thu. Save to keep it."; copying really copies (prototype stub) and keeps classes.
- Dirty = the draft differs from the saved week, so Undo back to it clears "Unsaved changes" (prototype kept it).
- Discard drops only the local draft (prototype reset the sample routine).
- Routine-mode Add writes to the draft, not the outbox; push alert default off (D-32).
- Terms: reached from Routines (Settings is Flow 09), back label "Routines"; Draft/Past tags use `text` on `surf2`
  (prototype ink on surf2 is 1.2:1 in dark). Active/Next tags use the onStatus token (ink in dark, cream in light) so they reach 4.5:1 (owner review 2026-10-22).
- Exam weeks shows "0h" (computed; the seed has no Exam weeks blocks; prototype hard-codes 42h).
- One-off changes row: the note is the title, the line is generated ("11 blocks skipped · Sermon Sync 2h added");
  the prototype's "Classes off. Only a 2h Sermon Sync session" isn't stored anywhere.
- The active card shows this week's hours and, when a saved change starts later, a line like "64h → 63h from Mon Oct 26" (owner review 2026-10-22).
- Winter "Set up" and the Terms Winter hint say timetable import arrives with Flow 02; "Describe a change" says
  planning arrives with Flow 06.

## Bugs found on the Simulator and fixed in this flow
- Toast actions cleared after running, wiping the action's own toast (Undo → "Put back." never showed; shared).
- Save sheet stuck on its spinner (it waited for the draft to vanish; the editor reopens a clean one).
- Discard after a cancelled swipe-back re-triggered the guard instead of leaving.
- Terms back link read "Back to Back".
- AX1 truncation/overflow in the editor, Save sheet and Terms.
- The dev evidence cleanup had soft-deleted the seed's Thanksgiving skips (they carry `source = 'user'`); restored
  through the change log, and the cleanup now leaves overrides with a note alone.

## ASSUMED (listed for the owner)
- Overlapping terms: the earlier start wins (flow file).
- Copy keeps protected categories (Class) on target days and doesn't copy them from the source (prototype + SI).
- A new term's routine id is chosen by the phone (offline "Name your term").
- Routines is pushed from Month with its own floating nav (Month selected).
