# Flow_03 interaction sweep
## Interaction map
Header: date label, sync pill (tap → retry/sync now), avatar, AI mark, theme. Hero (read-only). Day sheet rows (tap → edit). Nav: Day, Week, Month, + ; collapsed pill (current + ↑ expands, +). Week: Lanes/Cards switch, lanes (tap), legend. Cards: back, horizontal snap, totals tiles. Month: prev month, Routines pill, week rows (tap).
## Surface decisions
Tabs as root pages; Cards as pushed page (detail with back); no modals for viewing.
## Spawned surfaces
Account sheet (01), Add/Edit sheets (04), Plan it (06), Routines (05).
## Hidden states
First launch after install with session restored from Keychain backup (Keychain is device-only → no session → Welcome); app open across midnight (date flips, hero recomputes, sheet scroll resets to top); DST change (wall-clock times unchanged; hour bars use local times); term ended (no routine → "Free day" unless next term); time zone change while travelling (prompt "You're in Vancouver time now. Show your schedule in Vancouver time?" — ASSUMED post-v1; v1 uses device zone and updates profile).
## Edge cases
Overlapping blocks (current = earliest-starting active work block; quiet ignored if a work block overlaps); zero-length gaps; block crossing midnight (not allowed; max end 24:00); 20+ blocks in a day (sheet scrolls; bars thin to 2 pt min); very long titles (hero auto-fit then 2-line wrap at min size, rows wrap).
## Micro-interactions
Colon blink 1 s; highlight flash on new rows; nav collapse when sheet scrolled > 24 pt down, expand on scroll up or tap.
## Motion and interruption
Entrance animations play once per tab visit; returning from background does not replay; scrolling during entrance cancels remaining stagger.
## Feedback and semantic haptics
Selection on Lanes/Cards switch and card snaps; light when sync completes; nothing else.
## Gaps found
Time-zone travel prompt deferred (ASSUMED post-v1).
