# Flow_05 interaction sweep
## Interaction map
Routines: back, active card (Edit week), term rows (Set up), Describe bar, + new routine, one-off rows, recent plan rows. Editor: back (guarded), Starts/Ends, day tabs ×7, meals switch, remove ✕ per row, Add to Mons, Copy Mon to…, Save routine. Copy sheet: day checkboxes, Copy. Save sheet: effective date choice, Save, Keep editing. Terms: date fields per term, Winter hint link.
## Surface decisions
Pages for multi-item editing; sheets for short confirmations (copy, save); dialog for discarding unsaved edits; Undo toast instead of confirm for single removes.
## Spawned surfaces
Add sheet (04, routine mode), Name your term (NAT-11), Plan it (06), timetable import for a draft term (02).
## Hidden states
Draft editor restored after app kill (routine_drafts); routine changed on another device while editing (on Save: conflict → reload with local edits re-applied where no conflict, highlighted); effective date in the middle of a week (allowed; resolves per date).
## Edge cases
Copy Monday onto a day with overlapping fixed classes (classes kept, copied blocks flagged overlap); removing every block from a day; term end before last routine block's effective date (blocks just stop); terms overlapping (earlier start wins, notice); saving with no changes (button disabled).
## Micro-interactions
Day tabs show hours live; removed rows collapse 200 ms; Unsaved changes label swaps.
## Motion and interruption
Swipe-back mid-edit triggers discard dialog; Save sheet dismiss returns to editor unchanged.
## Feedback and semantic haptics
Selection on tabs; light on remove/copy; success on save; warning on discard.
## Gaps found
Term deletion and overlap precedence ASSUMED.
