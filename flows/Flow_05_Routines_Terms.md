# Flow_05: Maintain routines and terms

## Goal
The Planner keeps each term's repeating week and the term dates right, so every day fills itself in. Trigger: Month → Routines; Settings → Terms and dates; Build it myself (Flow 02). Success: routine edits saved with a clear effective date (past days never change); terms dated without gaps the Planner didn't intend. Boundary: whole-routine editing and term dates; single-block edits from Day are Flow 04; AI-drafted routine changes are Flow 06. Neighbours: 03, 02, 09 (entries); 03, 06 (exits); 04 (add sheet in routine mode).

## References and coverage
REF-001 states: `routines`, `routineEdit`, `applyRoutine`, `terms` (+ copy-day sheet and routine discard dialog inside `routineEdit`). Native: NAT-11 ("Name your term" mini-sheet).

## Entries, sequence, and exits
**Routines** (pushed from Month, back "October"):
1. Title "Routines", sub "Your repeating weeks. Every day in the calendar fills in from the routine that covers it."
2. Active term card (orange): "Active now" tag, "Edit week ›", term name, dates, hours/week, 7 mini day bars M–S → tap → Routine editor.
3. Other terms list: "Exam weeks · Dec 12 to Dec 22, starts after Fall term · 42h"; "Winter term · Draft, from Jan 5. Add your new classes · Set up".
4. "Describe a change to <AI>" bar (→ Flow 06 composer) + dashed "+" (new routine: opens Name your term → empty editor).
5. "One-off changes" list: date, title, note (e.g. "Oct 12 Thanksgiving · Classes off. Only a 2h Sermon Sync session"); tap → that date's Day.
6. "Recent plans" list (Flow 06 owns content; shown here as entry).
**Routine editor** (back "Routines", status "Changes start next Monday" / "Unsaved changes"):
1. Starts / Ends date fields for the term.
2. Day tabs Mon–Sun with hours per day.
3. "Every <Monday>" list with "Meals and breaks" switch (hidden by default): rows time range (Anton), swatch, title, remove ✕ (Undo toast "Removed <title> from Mondays." Undo).
4. "+ Add to Mons" (Flow 04 add sheet, routine mode) and "Copy Mon to…" (sheet: weekday checkboxes, "Copy" — replaces target days' blocks after confirmation line "Replaces what's on Tue and Thu.").
5. "Save routine" (disabled until dirty; offline label "Save on this phone") → **Save sheet**: "Save Fall term? Changes start Monday, Oct 26. This week and earlier stay as they were." Effective-date chooser: Next Monday (default) | Today | Pick a date. Save → toast "Fall term saved. Changes start Mon Oct 26." success haptic.
6. Back with unsaved edits → dialog "Discard routine changes? Your edits to Fall term haven't been saved." Keep editing / Discard.
**Terms and dates** (Settings): cards per term with status tag (Active / Next / Draft / Past), Starts / Ends native date fields (inline save, toast "Saved. Days in the new range fill in from the routine."), Winter draft hint "Add your new classes before Jan 5. A photo, PDF or Word doc of the timetable works." (→ Flow 02 timetable import targeting that term), Rules: "“Rest of the year” means Dec 31", "Week starts on Monday".
**Name your term** (NAT-11): name, starts, ends (prefilled), Create.
Exits: Day/Week (03), Plan it (06), Add sheet (04), Timetable import (02).

## States and feedback
| State | Feedback |
|---|---|
| Dirty editor | header "Unsaved changes", Save enabled |
| Remove block | light haptic, collapse, Undo toast 6 s |
| Copy day | toast "Copied Monday to Tuesday and Thursday." light haptic; validation "Pick at least one day." warning |
| Save offline | "Saved on this phone. It syncs when you reconnect." |
| Overlap after copy | rows flagged with warning dot + "Overlaps" text; save allowed (same rule as Flow 04) |
| Term dates invalid | inline "Ends needs to be after starts." / overlap between terms: stamp "Overlaps Exam weeks. Days in both use Fall term." (allowed; earlier-starting term wins — ASSUMED) |
| Gap between terms | info line on Terms page: "Dec 23 – Jan 4 has no term. Those days stay empty unless you add something." |
| Conflict (synced elsewhere) | sync conflict toast; editor reloads the routine and keeps unsaved local edits highlighted (Reapply) |
| Empty routine | "No blocks on Mondays yet." + Add |

## Interaction surface and transitions
Routines, Routine editor, Terms: **pushed pages** (320 ms slide). Save, Copy day, Name your term: **sheets** (short, contextual). Discard: **dialog**. Haptics: selection on day tabs; light on remove/copy; success on save; warning on discard. Reduce Motion: fades.

## Actions and functions
| Action | Function | Mutations | Rules |
|---|---|---|---|
| Edit term dates | `terms.update(id, {starts_on, ends_on})` | `term` upsert | ends ≥ starts; routine blocks keep their own effective ranges |
| Remove block (draft) | editor local state | — until Save | Undo in memory |
| Add to day | Flow 04 routine mode | in editor draft until Save (routine mode writes to draft, not outbox) | — |
| Copy day | `routineDraft.copyDay(from, to[])` | — until Save | replaces targets |
| Save routine | `routines.saveDraft(routineId, draft, effectiveFrom)` | for each changed block: close old (`effective_to = effectiveFrom`), insert new (`effective_from`); removed → close; added → insert | one atomic server transaction via a single `routine_save` mutation `{routine_id, base_version, effective_from, ops[]}` |
| Create term | `terms.create({name, starts_on, ends_on})` | `term` + `routine` upsert | — |
| Toggle meals | view only | — | — |

## Data and integrations
- Persistent data: yes
- Tables: `terms`, `routines`, `routine_blocks` (effective ranges), `overrides` (listed), plans (recent).
- Device keeps an editor draft in SQLite (`routine_drafts`) so leaving the app doesn't lose edits.

## Security and abuse cases
`routine_save` mutation validated server-side (ownership of every block id, times, effective date not in the past more than 0 days — today allowed); large ops arrays capped at 200; stale `base_version` → conflict. Term deletion not in v1 (only date edits; drafts can be removed — ASSUMED post-v1).

## Accessibility
Day tabs are a tab list with selected state and hour values announced ("Monday, 10.4 hours"); remove buttons "Remove Advanced Networking I from every Monday"; Undo reachable; date fields native; Save sheet announces effective date.

## Platform behavior
Native date pickers (inline compact); swipe-back gesture triggers discard check when dirty (`beforeRemove` listener).

## Contracts
C-0305, C-0205, C-0304 (routine mode), `sync`, `schedule-model`, C-x08.

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| Effective-dated save keeps past days | `routines.saveDraft`, server `routine_save` | integration: resolveDay(last Monday) unchanged after save | recording | evidence/flows/Flow_05/save.mp4 | not started |
| Remove + Undo | editor | component | recording | …/remove.mp4 | not started |
| Copy day | `copyDay` | unit | screenshot | …/copy.png | not started |
| Discard guard | `beforeRemove` | component | recording | …/discard.mp4 | not started |
| Terms dates + gap/overlap notices | `TermsScreen` | unit | screenshot | …/terms.png | not started |
| Atomic save + conflict | api `routine_save` | api test (concurrent saves) | — | — | not started |
| Name your term | `NameTermSheet` | component | screenshot | …/name-term.png | not started |

## Open decisions
Overlapping terms precedence (earlier start wins, ASSUMED); term deletion post-v1 (ASSUMED).

## Build seed
First failing test: "saving the Fall routine with Monday Gym moved to 17:00 effective 2026-10-26 leaves resolveDay(2026-10-19) unchanged and changes resolveDay(2026-10-26)".
