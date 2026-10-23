# Flow 09 — verification (Settings)

Data: the owner's seed (Fall term) in local Postgres, synced to the phone; the owner's dev data also holds a
tenth category, "goat" (Life, 0h), not from the seed and left alone. Runtime: iPhone 17e Simulator (iOS 27.0, dev
build of `me.okoro.dialed` rebuilt with expo-file-system), iPhone SE (3rd gen) for 375×667, Dynamic Type AX1 on
the 17e. Clock: dev preset "today 1:15 pm" (Fri 23 Oct 2026). Local adapters only (EMAIL_TRANSPORT=console,
APNS_MODE=log, AI_MODE=fixture).

Re-run: `pnpm --filter @dialed/api test` (categories.test, account.test), `pnpm --filter mobile test`
(settingsModel, categoryEffects, devicePrefs, settingsA11y, reminders); Maestro `e2e/settings_tour.yaml`
(THEME=dark|light|se|ax1), `category_edit`, `category_merge`, `category_delete`, `notif_settings`, `export`,
`cat_quiet` (Metro with `EXPO_PUBLIC_FEATURE_D35=true`). `scripts/dev_evidence_cleanup` puts the seed categories,
block categories and one-offs back.

| Requirement | Implementation | Automated | Runtime evidence | Status |
|---|---|---|---|---|
| Build seed: merging Speedwatch Ontario into WellServices reassigns 3 routine blocks and removes Speedwatch from the list in one revision | server `categoryMerge` (one transaction, `category_merges.moved_json`); phone `Categories.merge` + `categoryEffects` | api `categories.test.ts` (one revision, change_log rows, past + future one-offs move); mobile `categoryEffects.test.ts` (offline effect, idempotent re-apply) | `recordings/merge.mp4`, `merged-dark` (WellServices 6.3h → 10.5h, toast "Merged Speedwatch Ontario into WellServices. 3 blocks moved." + Undo) | passed |
| Merge Undo (10 min) | `category_unmerge`; merge id kept from the push result (`merge:<mutation id>`) | api: Undo restores category and rows, twice refused, after 10 min `too_late`, someone else's refused, rows moved again since stay | `merge-undone-dark` ("Put back.", Speedwatch 4.3h, WellServices 6.3h) | passed (ASSUMED: Undo added; prototype toast has none) |
| Merge/delete refused on stale version, merge into itself, another person's category | ownership + version checks | api tests (conflict, rejected, not_found; nothing moved) | — | passed (automated) |
| Delete with reassignment / delete blocks too | `categoryDelete`; dialog with the iOS menu (`ActionSheetIOS`) | api: reassign; `delete_blocks` ends blocks from today, past one-offs kept, future ones removed; a choice needed while in use; a plain category delete refused while blocks use it (`in_use`) | `delete-menu-dark`, `delete-dialog-dark` ("3 blocks a week use it. Move them to:"), `deleted-dark` (Sermon Sync 14.6h → 18.8h) | passed |
| Rename / recolour / regroup propagate | `Categories.save` (category upsert; colours kept when no palette swatch is picked) | `categoryEffects.test.ts` (empty, taken in any case/spacing, colours kept, `quiet` only when the flagged row is shown) | `recordings/category.mp4`, `cat-empty-dark` ("Give it a name first." as the field's error line), `cat-taken-dark`, `cat-saved-dark` ("Saved Speedwatch."), `cat-week-colour-dark` (Week lanes + legend in Rose) | passed |
| Categories page: grouped, hours a week in the active term | `categoryWeek` | `settingsModel.test.ts` (hours incl. quiet, ended versions excluded, "4.3h", "13h", "0h") | `categories-*` (Sermon Sync 14.6h, WellServices 6.3h, Prayers 4.5h, Speedwatch 4.3h, Class 12.5h, Study 14.7h, Gym 7.5h, Meal 13h, Break 0.3h: the prototype's numbers) | passed |
| Settings root values | `settings.tsx` | `settingsA11y.test.tsx` (rows read with values) | `settings-*` (Categories 10, "Live Activity · max 6", Fall term, Owner / owner@dialed.test, "Dialed 0.1.0") | passed |
| Notification prefs + live count + cap + quiet hours | `DevicePrefsStore` (local, then `PUT /v1/devices/current`); `planReminders` heads-up / meal notes / cap; `notifCount` | api `account.test.ts` (defaults, merge, per device, 1–20, 5/10/null, unknown field 400, 401); mobile `devicePrefs.test.ts` (offline kept, server copy never overwrites a waiting change, Line only keeps the line), `settingsModel.test.ts` (count with heads-up/meal notes/cap, sentence, quiet hours "12 am – 7:30 am") | `notifications-*` (0), `notif-on-dark` (6 with heads-up 10 min + quiet notes), `notif-limits-dark` (stepper 7, quiet hours, "**Off in iPhone Settings,** so none of this will fire. Turn them on"), `notif-line-only-dark` (7, Live Activity clause dropped), `settings-line-only-dark` ("Off · max 7") | passed (local reminders: the planner is unit-tested; delivery needs a device) |
| Export my data | `GET /v1/account/export` (fflate zip), `api.download` + expo-file-system temp file + RN `Share` | api: zip holds `dialed-export.json` (dialed-export/v1, own rows, no secrets) + `dialed.ics` (RFC 5545 escaping, midnight ends, UID = block id + date, owner's Fall term events), `Cache-Control: no-store`, 3 a day then 429 "You can export 3 times a day. Try again tomorrow." | `export-share-dark` (iOS share sheet: dialed-export, ZIP Archive · 11 KB) | passed; toast after sharing unverified (the flow cancels) |
| Settings offline: changes queue, Export disabled with "Offline · Connect to export." | outbox; device prefs kept locally; `OfflineLine` | `devicePrefs.test.ts`, `categoryEffects.test.ts` (offline effects) | — | automated only; offline runtime shot not taken |
| Terms back link from Settings | `terms.tsx` `from=settings` | — | `terms-from-settings-*` ("‹ Settings") | passed |
| Quiet switch (D-35, flag) | `category-edit.tsx` behind `FEATURES.d35Screens` | `categoryEffects.test.ts` (`quiet` sent only with the row) | flag on: `cat-quiet-on-dark` (Meal, no swatch picked, Quiet on), `cat-quiet-off-dark` (explanation swaps) | passed with the flag on; ships off until approved |
| Light theme | tokens | — | `*-light.png` (7) | passed |
| 375×667 (iPhone SE) | rows wrap their values | — | `*-se.png` (7) | passed |
| Dynamic Type AX1 | values under labels (`SetRow` stacked), sheet scrolls | — | `*-ax1.png` (7) | passed (visual) |
| Haptics | selection on switches, palette, stepper; success on save/merge; warning on delete, empty/taken name | — | — | unverified (physical device only) |
| Spoken VoiceOver | rows "Categories, 9"-style values; swatches named radios; stepper "Fewer"/"More" + "6 a day"; live count is a polite live region; Merge back link "Back to Edit category" | labels asserted in `settingsA11y.test.tsx` and through Maestro's accessibility tree | — | labels passed; speech unverified (no VoiceOver in the Simulator) |
| Quiet flag → Live Activity + line, Lock screen and widgets | Flow 08 | — | — | not built (Flow 08) |

## Deltas from prototype v11 / the flow file (and why)
- "Give it a name first." is the Name field's error line, not a toast: toasts render under native sheets (v11 rule:
  field problems are the field's error line). Duplicate names use the flow file's "You already have a category
  called WellServices." the same way.
- Merge offers Undo (6 s toast, server window 10 min); a merge made offline can be undone only once it has synced
  ("Undo works once this phone is back online.").
- Delete dialog: the prototype `<select>` is a field that opens the iOS menu (action sheet); Cancel stays; a line
  about AI protection shows when a protected category (Class) loses or gains blocks.
- Closing Edit category discards edits silently (prototype).
- Quiet hours read from the profile ("12 am – 7:30 am" for the owner) and stay read-only (prototype shows a
  static value; editing needs approval).
- "Lock screen and widgets" row (Flow 08 entry, D-14) is hidden until Flow 08 exists; AI assistant (Flows 06/07) and
  Delete account (Flow 01 re-auth + `DELETE /v1/account`) rows are hidden too, so no row leads to a dead end.
- Export: native share sheet with `dialed-export.zip`; offline the row is disabled and "Offline · Connect to
  export." shows under the Account group (v11 offline pattern); errors are toasts.
- Plans row: "When <AI> finishes a plan" + "Including plans sent from your AI app." (any MCP client).
- Counts are singular for one ("1 block a week uses it.", "1 block moved.").
- Line only drops "plus the Live Activity during work blocks" from the live count (it would be false).
- Notification prefs are per phone (devices.prefs_json); categories, quiet hours and theme sync through the profile.
- Merge and reassignment rewrite the category on every live row, past ones included (a category is a label and the
  old one goes away); "Delete those blocks too" ends blocks from today and removes only future one-offs.

## Bugs found and fixed in this flow
- Export calendar didn't escape semicolons (RFC 5545) — caught by lint, fixed with a test.
- Merge sheet's back link read "Back to Back" to VoiceOver.
- e2e: `_open.yaml`'s blind tap for the "Open in Dialed?" prompt could open a Day row; `_relaunch.yaml` now closes
  a stray Edit sheet.
