# Flow_02 interaction sweep
## Interaction map
Setup options ×4; source sheet rows ×3 + close; camera: Cancel, shutter, Photos; Files picker; Reading: Cancel; Found classes: Retake/Pick another, switch per class, Term starts/ends, Add N classes; Calendar: permission prompt, checkbox per calendar, Import N events, Review each, back.
## Surface decisions
Action sheet for 3 sources (fast, dismissible). System camera/pickers (privacy, familiarity). Reading/Found/Pick calendars as pages (comparison + pinned CTA). Permission prompt only after an explicit tap.
## Spawned surfaces
Name your term (if no term and dates can't be inferred) — handled inside Found classes via the date fields. Flow 06 error page for provider failures.
## Hidden states
Upload in progress when app backgrounds (continues via `URLSession` background upload — ASSUMED via expo-file-system background session; else restart on foreground with same Idempotency-Key); network drop mid-upload; plan ready while app killed (push opens Found classes); duplicate classes across lecture/tutorial same time; classes outside day bounds (kept, flagged); timetable with two weeks alternating (A/B weeks) → reviewer note "Alternating weeks found; added both — remove the ones you don't need" (ASSUMED).
## Edge cases
HEIC from iPhone, rotated photo (EXIF orientation fixed before upload), multi-page PDF, password-protected PDF (error "That PDF is locked."), DOCX with tables vs paragraphs, 24h vs 12h times, rooms missing, time zones in file (ignored, local), calendar with thousands of events (limit to term range + 500), all-day events (skipped), events that repeat every 2 weeks (one-off list with note).
## Micro-interactions
Shutter flash 120 ms; switch count in button updates instantly; loader steps tick 400 ms apart.
## Motion and interruption
Cancel during reading aborts upload and deletes server file; leaving Found classes keeps plan `ready` (Recent plans) — returning restores toggles.
## Feedback and semantic haptics
Light on shutter; selection on switches/checkboxes; success on approve/import; warning on errors.
## Gaps found
Background upload support depends on Expo module capabilities — verify in build; fallback documented. Alternating-week timetables ASSUMED handling.
