# Flow_04 interaction sweep
## Interaction map
Add sheet: close, name, recent category chips ×3, Pick a category, Starts, Ends, length chips ×4, Repeat switch, Push alert select, Add/Add anyway. Picker sheet: back, search, rows, create card (swatches ×4+, group chips, Create and use it). Edit sheet: close, name, category chip, Starts, Ends, day chips ×7, scope segmented, Save/Move, Skip/Delete. Nudge sheet: Turn on reminders, Not now. Help sheet: close. Discard dialog: Keep editing, Discard.
## Surface decisions
Sheets for single-block tasks (keep Day context); stacked picker to preserve form; dialog only for losing typed input.
## Spawned surfaces
iOS permission alert (after Turn on reminders only).
## Hidden states
Sheet open while the clock crosses the block's start (form unaffected; saving a block that already started is allowed); editing a block that sync just changed (version conflict on push → toast Reapply); editing while offline then deleting the same block before sync (outbox coalesces ops by entity id); sheet open when app backgrounds (state kept; dirty check on return not needed).
## Edge cases
End before start; end exactly 24:00; 5-minute grid snapping from native picker (picker set to 5-min interval); emoji titles; category deleted on another device while picking (picker refreshes, selection cleared with inline error); moving to a day outside the term (error "That day isn't in Fall term."); skip a one-off block (= delete); undo after navigating away (toast persists 6 s across screens).
## Micro-interactions
Length chips update End live; recent chips show last 3 used; highlight flash on saved row; "New" chip for 5 s.
## Motion and interruption
Drag-to-dismiss with dirty form → discard dialog; keyboard pushes sheet to large detent; interrupted save (app killed) → outbox persisted, sends on next launch.
## Feedback and semantic haptics
Selection: category, length, day chips. Warning: validation, overlap, discard. Success: save. Light: delete/skip, create category.
## Gaps found
D-32 alert default change from prototype (ASSUMED).
