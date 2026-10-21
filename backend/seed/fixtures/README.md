# Test fixtures (golden — do not regenerate expected outputs from the code under test)
- `timetable/timetable-ref002.png` (owner's real schedule screenshot), `timetable.pdf` (text PDF), `timetable-scanned.pdf` (image-only PDF), `timetable.docx` (Word table) → all must extract to `timetable/expected-classes.json`.
- Malicious-file fixtures (DOCX entity bomb, PDF with JavaScript, 20 MB file, `.exe` renamed `.pdf`, 60 MP image) are generated in test code at runtime, not committed.
- All fixture tests run with a fixed clock: 2026-10-20 12:00 America/Toronto.
- `plans/*.json` drive `AI_MODE=fixture`: the fixture provider replays `propose_changes` / `ask_user` / failures deterministically.
- `plans/bible-study.json` `expected_after_approve` are the prototype's numbers (64.3→65.8 h, Wed 11.6→11.3, weekend 8.5→11.5), recomputed from the seed.
