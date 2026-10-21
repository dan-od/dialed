# Flow_09 interaction sweep
## Interaction map
Settings rows ×4, Export, Sign out, Delete account. Categories: rows, New category. Edit category: name, palette ×11, group chips, quiet switch, Save, Merge into…, Delete. Merge: back, target rows. Delete dialog: reassignment picker, Cancel, Delete. Notifications: LA switch, heads-up select, meal-note switch, plan switch, cap stepper −/+, quiet hours pickers, Lock screen and widgets row, Turn them on.
## Surface decisions
Pages for lists; sheets for editing one category; stacked sheet for merge target; dialog for delete (requires decision on blocks).
## Spawned surfaces
Share sheet for export; Customize page (08); permHelp sheet (04).
## Hidden states
Category edited on another device while sheet open (save conflict → toast Reapply); export generated while offline (disabled); notification prefs changed while LA active (switching to Line only ends the active LA immediately).
## Edge cases
Renaming to an existing name in different case; deleting a protected category (Class) — allowed with reassignment, protection moves with the blocks? (No: protection is per category; reassigning to non-protected removes AI protection — warn in dialog "Classes moved here won't be protected from AI changes." ASSUMED); cap stepper bounds 1–20; quiet hours spanning midnight; quiet hours covering the whole day (warning "No notifications will arrive.").
## Micro-interactions
Notification count stamp updates live; palette selection ring; stepper long-press repeat.
## Motion and interruption
Sheet dismiss without Save discards edits silently (single field changes; ASSUMED acceptable) — show discard dialog only if name was changed.
## Feedback and semantic haptics
Selection on palette/switch/stepper; success on save/merge; warning on delete.
## Gaps found
Quiet switch on Edit category is a D-35 surface (prototype + owner approval before production UI). The protected-category reassignment warning is a copy line inside the existing delete dialog (ASSUMED).
