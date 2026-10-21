# Flow_09: Tune Dialed (settings)

## Goal
The Planner sets up categories, notifications and lock-screen behaviour, reaches AI assistant settings, and exports their data — and sees the result everywhere. Trigger: Account sheet → Settings. Success: every setting persists, syncs to other devices, and immediately changes colours, totals, notifications and glance surfaces. Boundary: the Settings stack (root, Categories, Notifications); AI assistant page sections belong to Flow 06 (in-app provider) and Flow 07 (connector); Terms page belongs to Flow 05; sign out/delete actions belong to Flow 01. Neighbours: 01, 03 (entries); 04, 07, 08 (exits/effects).

## References and coverage
REF-001 states: `settings`, `categories`, `catEdit`, `catDelete`, `notifSettings`. Secondary: `terms` (05), `claudeSettings` (06/07), `deleteacct`/`signout` (01). NAT-08 (share sheet).

## Entries, sequence, and exits
**Settings** (pushed, back "Day"): title; group 1 rows with values: Categories (count) · Notifications ("Live Activity · max 6") · Terms and dates (active term) → Flow 05 · AI assistant ("Dialed server" / "ChatGPT · your key" + " + app") → Flow 06/07 page. Group "Account": name + email, Export my data ("JSON + calendar"), Sign out (→ Flow 01 dialog), Delete account (red → Flow 01 dialog). Footer "Dialed 1.0".
**Categories**: sub "Colours show in every view. Hours are per week in <term>."; grouped lists (Projects, School, Life, custom groups) rows: swatch, name, weekly hours, chevron → Edit; dashed "New category" (opens the same create card as the picker in Flow 04).
**Edit category** sheet: Name, Colour palette (11 swatches; light/dark pair applied), Group chips, "N blocks a week use it.", Save; Merge into… (stacked sheet listing other categories → merge immediately, toast "Merged Speedwatch Ontario into WellServices. 3 blocks moved." Undo), Delete (dialog: "Delete Speedwatch Ontario? 3 blocks a week use it. Move them to: [picker]" with option "Delete those blocks too"; Cancel default).
Quiet flag: "Quiet (no Live Activity or reminders)" switch on Edit category (ASSUMED surface, needed by D-07; Meal/Break on by default). Protected flag for School/Class is internal (not shown).
**Notifications** page: live stamp "Today: With these settings you'd get N notifications for the rest of today, plus the Live Activity during work blocks."; Work blocks: Live Activity on the lock screen (switch; off = Line only), Heads-up before they start (Off / 5 min / 10 min); Meals and breaks: "Shown in the line under the date — Always", "Also send a quiet note" (switch, default off); Plans: "When <AI> finishes a plan" (switch); Limits: At most per day (stepper 1–20, default 6), Quiet hours (12 am – 9 am, editable via time pickers); "Lock screen and widgets" → Customize/guide page (Flow 08). If iOS notifications denied: stamp "Off in iPhone" + Turn them on (permHelp).
**Export**: `GET /v1/account/export` → share sheet with `dialed-export.zip` (JSON of all user data + `dialed.ics` of the next 120 days resolved) → toast "Export ready: dialed-export.json and dialed.ics."
Exits: back to Day; Flow 05/06/07/08/01 pages.

## States and feedback
| State | Feedback |
|---|---|
| Rename empty | toast "Give it a name first." warning |
| Duplicate name | inline "You already have a category called <name>." |
| Saved | success haptic, toast "Saved <name>." colours update everywhere immediately |
| Merge | success haptic + Undo toast (restores category and block refs) |
| Delete with reassignment | warning haptic, toast "Deleted <name>." |
| Delete last category in use by plans | allowed; plans keep names (snapshot in plan_changes) |
| Notification count | recomputed live from tomorrow's/today's remaining blocks |
| Export busy/offline | button spinner / stamp "Offline · Connect to export." |
| Settings offline | all changes queue (outbox); export disabled |

## Interaction surface and transitions
Settings, Categories, Notifications: **pushed pages**. Edit category, Merge: **sheets** (merge stacks over edit). Delete: **dialog** with a picker (destructive, needs a choice). Export: **system share sheet**. Haptics: selection on switches/palette/stepper; success on save/merge; warning on delete. Reduce Motion: fades.

## Actions and functions
| Action | Function | Mutation / endpoint | Rules |
|---|---|---|---|
| Edit category | `categories.update(id, {name, color, group, quiet})` | `category` upsert | unique name; colours from palette; quiet changes trigger C-x08 |
| Merge | `categories.merge(from, to)` | compound `category_merge {from, to, from_version, to_version}`; server reassigns routine_blocks/overrides, records ids in `category_merges.moved_json`, soft-deletes `from` | atomic; Undo = `category_unmerge {merge_id}` within 10 min |
| Delete | `categories.delete(id, {reassignTo | deleteBlocks})` | compound `category_delete` | atomic; blocks reassigned or closed from today |
| Notification prefs | `prefs.set(...)` | device prefs (`lock_mode`, `line_on`, `heads_up_min`, `meal_notes`, `daily_cap`, `plan_pushes`) via `PUT /v1/devices/current`; quiet hours via the `profile` mutation (single owner: users) | reschedules locals, LA jobs |
| Export | `account.export()` | `GET /v1/account/export` (streams the zip; no signed URL) | rate 3/day |
| Theme | `prefs.setTheme` | profile | — |

## Data and integrations
- Persistent data: yes
- `categories`, `routine_blocks`/`overrides` (reassignment), `users.profile_json`, `devices.prefs_json`.
- Export bundle schema `dialed-export/v1`: `{exported_at, user:{name,email,time_zone}, categories, terms, routines, routine_blocks, overrides, plans:[{request_text,status,changes}]}` + ICS (VEVENTs for resolved blocks, `UID` = block id + date).

## Security and abuse cases
Ownership on every category id; merge/delete compound mutations validated atomically; export only own data, streamed directly and never cached by Cloudflare (`Cache-Control: no-store`); no secrets in export (no tokens, no keys).

## Accessibility
Rows are buttons with value read ("Categories, 9"); palette swatches have colour names; stepper buttons "Fewer"/"More" with value announced; quiet hours pickers labelled; stamps announced.

## Platform behavior
Share sheet via `expo-sharing`; quiet hours honour iOS Focus (system already suppresses; ours is additional).

## Contracts
C-x08, C-0907, `sync`, `notifications`, `identity-session` (sign out/delete hosted here, owned by Flow 01).

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| Rename/recolour/regroup propagates | `categories.update` | integration (Day colours update) | recording | evidence/flows/Flow_09/category.mp4 | not started |
| Merge + Undo | `category_merge/unmerge` | api + integration | recording | …/merge.mp4 | not started |
| Delete with reassignment / delete blocks | `category_delete` | api tests both branches | screenshot | …/delete.png | not started |
| Quiet flag affects LA + line | prefs → snapshot | integration | device | …/quiet.mp4 | not started |
| Notification count + cap + quiet hours | `notifCount`, scheduler | unit | screenshot | …/notifications.png | not started |
| Export bundle | export handler | api test validates schema + ICS parses | share sheet screenshot | …/export.png | not started |

## Open decisions
Merge undo window (10 min, ASSUMED); quiet flag UI on Edit category (ASSUMED, required by D-07).

## Build seed
First failing test: "merging Speedwatch Ontario into WellServices reassigns 3 routine blocks and removes Speedwatch from list_categories in one revision".
