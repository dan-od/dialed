# Flow_04: Add or change a block

## Goal
The Planner adds, edits, moves, skips or deletes one block correctly — for today only or every week — in a few taps, online or offline. Trigger: nav +, tapping a row in Rest of today, or "Add to Mons" in the routine editor. Success: the change is saved locally at once, synced, reflected in Day/Week/glance surfaces, and undoable where safe. Boundary: single-block changes; multi-change planning is Flow 06; routine-wide editing is Flow 05. Neighbours: 03, 05 (entries); 03, 08 (exits); 09 (category service).

## References and coverage
REF-001 states: `add`, `add-invalid`, `add-overlap`, `cat`, `cat-create`, `notifAsk`, `permHelp`, `discard`, `blockEdit`. Native: NAT-09 (iOS notification permission). Changed from prototype: the add sheet's "Push alert" default is **Default (off)** instead of "10 min before" (D-32), because work blocks get a Live Activity and heads-up is off by default (D-24).

## Entries, sequence, and exits
**Add sheet** (+): title "Add a block"; fields: "What are you working on" (text), Category (recent chips: last 3 used + "Pick a category" → picker sheet), Starts / Ends (native time pickers; default next free 5-min slot, 1 h), length chips 30m / 1h / 1h 30m / 2h, "Repeat every <weekday>" switch (in routine mode always on, label "Every <weekday> in <term>"), Push alert (Default (off) · When it starts · 10 min before · 30 min before), primary "Add".
1. Validate → overlap check against work blocks of the resolved day → if overlap: inline warning "Overlaps <title> 4:15–5:30. Add anyway?" button becomes "Add anyway".
2. If alert ≠ off and notification permission not determined → **Get a nudge** sheet ("Turn on reminders" → iOS prompt; "Not now" saves without alert).
3. Save → sheet closes, row highlighted with "New" chip, toast "Added to Monday." / "Added to every Monday." (+ " You'll get a nudge 10 min before." when allowed) / offline "Saved on this phone. It syncs when you're back online."
**Category picker** (stacked sheet): search/create field; grouped list with swatches; typing a non-matching name shows create card: "Create “<name>”", palette swatches, group chips, "Create and use it".
**Edit block sheet** (row tap): name, category (read-only chip → opens picker), Starts/Ends, Day chips Mon–Sun (move), Change: "This <weekday> only" | "Every <weekday>" (only for routine blocks), primary "Save changes" / "Move to <day>" (disabled "No changes yet"), secondary destructive "Skip it this <weekday>" (once) / "Delete block" (every / one-off blocks).
- Save once → override `modify` (or `move` to target date this week). Save every → new routine block version effective today forward (past days unchanged). Delete/skip → Undo toast (6 s).
**Discard dialog**: closing a dirty add sheet → "Discard this block? What you typed will be lost." Keep editing (default) / Discard.
**Reminders off help** sheet (permission denied): steps Settings → Notifications → Dialed → Allow.
Exits: Day/Routine editor with highlight; Flow 08 refresh (C-x08).

## States and feedback
| State | Feedback |
|---|---|
| Invalid | inline: name "Give the block a name, like “Capstone reading”."; category "Pick a category so it gets the right colour and totals."; time "End time needs to be after 4:15 pm." Focus first, warning haptic, VoiceOver announcement |
| Overlap | warning stamp in sheet + "Add anyway" |
| Saving | button spinner 0–700 ms (local write is instant; spinner only while optimistic UI settles) |
| Saved | success haptic, highlight flash 1.2 s, toast |
| Offline save | row "· waiting to sync", pill count +1 |
| Conflict on sync | global conflict toast with Reapply (sync contract) |
| Permission denied + alert set | in-sheet stamp "Reminders off": "iPhone Settings has notifications turned off for Dialed, so this alert won't fire." + Turn them on |
| Delete/skip | light haptic, row collapses, Undo toast |
| Edit no-op | primary disabled "No changes yet" |
| Category created | light haptic, toast "Created <name> in <group>." |

## Interaction surface and transitions
Add, Edit, Category picker, Get a nudge, Reminders help: **bottom sheets** (keep context, one-thumb dismiss; picker stacks over add to keep the half-filled form). Discard: **dialog** (only when dirty). iOS permission: **system alert**. Sheet up 400 ms decel, scrim 250 ms; dialog pop 280 ms. Haptics: selection on category pick/day chip/length chip; warning on validation/overlap/discard; success on save; light on delete/create. Reduce Motion: sheets fade.

## Actions and functions
| Action | Function (device) | Mutation (sync push) | Validation | Side effects |
|---|---|---|---|---|
| Add today only | `blocks.addOneOff(date, fields)` | `override` op upsert kind `add` | title 1–80, category exists, 5-min grid, end>start, end ≤ 24:00 | outbox, snapshot refresh, local notification schedule |
| Add every week | `blocks.addRoutine(routineId, weekday, fields, effectiveFrom=today)` | `routine_block` upsert | same + term active | same |
| Edit once | `blocks.modifyOnce(date, block, fields)` | `override` kind `modify` (or update existing override) | same | same |
| Edit every | `blocks.modifyEvery(block, fields, effectiveFrom=date)` | one `routine_block_edit` compound mutation (close + insert atomically; same-day edit updates in place) | base_version | same |
| Move once | `blocks.moveOnce(date, block, toDate)` | `override` kind `move` (`moved_to_date` within the same week) | target date in a term | same |
| Move every | `blocks.moveEvery(block, toWeekday)` | `routine_block_edit` with `fields.weekday` (close + insert atomically) | base_version | same |
| Skip once | `blocks.skipOnce(date, block)` | `override` kind `skip` | — | Undo deletes the override |
| Delete | `blocks.delete(block)` | routine block: `routine_block_edit {close: true, effective_from: date}` (past days keep it); one-off block: override `deleted_at` | — | Undo reverses (re-open / restore) |
| Create category | `categories.create(name, group, colorIdx)` | `category` upsert | unique name per user (case-insensitive), 1–40 | — |
| Ask permission | `notifications.requestPermission()` | device prefs | — | iOS prompt once |
Server: `/v1/sync/push` mutations only; server re-validates the same rules (shared Zod + `packages/schedule` checks).

## Data and integrations
- Persistent data: yes
- Tables: `routine_blocks`, `overrides`, `categories` (device + server), `outbox`, device notification prefs.
- Per-block alert stored in `profile_json.block_alerts[blockId]` (ASSUMED) and scheduled locally; counts toward daily cap.

## Security and abuse cases
Editing another user's block by id → server `not_found`; stale base_version → `version_conflict`; huge titles/emoji floods → length caps; rapid duplicate taps → client disables button + idempotent mutation id; overlapping is allowed but flagged; editing a past date → allowed only for overrides (history notes), routine edits always effective from today forward.

## Accessibility
Sheets trap focus, close button labelled, drag handle hidden from VO, Escape/two-finger scrub closes (with discard check); time pickers native; chips have selected state; errors linked to fields; toasts announced politely with Undo reachable via VoiceOver magic tap within 6 s.

## Platform behavior
Native `DateTimePicker` (compact) for times; keyboard "Done" closes; sheet detents medium/large with keyboard avoidance; haptics via `expo-haptics` (`selectionAsync`, `notificationAsync(Warning|Success)`, `impactAsync(Light)`).

## Contracts
C-0304, `sync`, `schedule-model`, `notifications`, C-x08, `error-taxonomy`.

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| Add today/every + toast copy | `AddBlockSheet`, `blocks.*` | component + integration | recording | evidence/flows/Flow_04/add.mp4 | not started |
| Validation + focus | `AddBlockSheet.validate` | unit + a11y | screenshot | …/invalid.png | not started |
| Overlap → Add anyway | `overlapOf` | unit | screenshot | …/overlap.png | not started |
| Category picker + create | `CategoryPicker` | component | recording | …/category.mp4 | not started |
| Edit once vs every | `blocks.modifyOnce/Every` | integration: past dates unchanged | recording | …/edit.mp4 | not started |
| Move day | `blocks.moveOnce/Every` | integration | — | — | not started |
| Skip/delete + Undo | `blocks.skipOnce/delete` | integration | recording | …/undo.mp4 | not started |
| Offline add then sync | outbox | integration (network toggle) | recording | …/offline-add.mp4 | not started |
| Server re-validation | sync push handlers | api tests (bad time, foreign id, stale version) | — | — | not started |
| Permission flow | `NotifAsk`, `PermHelp` | component | device | …/permission.mp4 | not started |

## Open decisions
D-32 (ASSUMED): add-sheet alert defaults to "Default (off)"; explicit per-block alerts count toward the daily cap.

## Build seed
First failing test: "adding 'Capstone reading' Monday 22:00–23:00 every week writes a routine_block with effective_from = today and the Day sheet shows it with a New chip".
