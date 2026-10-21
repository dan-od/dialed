# Flow_08 interaction sweep
## Interaction map
Live Activity tap; Dynamic Island tap/long-press (expanded); lock widgets tap; home widgets tap; Rundown configuration (Show, Meals); notification actions (Snooze 10 min, Open day, Later, Review); in-app Customize: mode segmented, line switch, guide previews.
## Surface decisions
System surfaces only; nothing interactive inside widgets except deep links (iOS 17 interactive widgets not used in v1 — ASSUMED).
## Spawned surfaces
None beyond deep links into the app.
## Hidden states
Snapshot older than 26 h (greyed + "Open Dialed to refresh"); device offline at block start (LA started locally next foreground; widgets still correct from snapshot); LA budget throttled by iOS (fallback: line + widgets still correct); user dismisses a Live Activity manually (don't restart it for that block); Focus mode active (iOS handles; we don't bypass); phone restarted (widgets reload from snapshot).
## Edge cases
Back-to-back work blocks (end+start same minute); block shorter than 5 min (no LA); block longer than 8 h (split); overlapping work blocks (LA for the earliest; next list skips overlap); last block crossing midnight (not allowed); time zone change (snapshot regenerated on foreground); cap reached early in the day (later notes dropped, Settings shows count); quiet hours inside a block (LA still runs; notifications suppressed).
## Micro-interactions
Countdown uses system timer text (no battery-heavy reloads); numeric content transition on widget updates.
## Motion and interruption
LA appears with system animation; dismissal at block end immediate.
## Feedback and semantic haptics
None from widgets/LA; notifications use system sound only when not quiet; meal notes passive (no sound).
## Gaps found
Interactive widget buttons (e.g. "Done" on a block) out of scope v1. Hide-titles privacy option post-v1.
