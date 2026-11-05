# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings, 06 Plan with AI. Design v11 applied.

**Flow 02 code complete.** Backend: timetable extractor (56 planning tests), upload route with magic-byte validation, calendar import route, term date PATCH, daily limit, fixture mode. Mobile: timetable picker (camera/photos/files via ActionSheetIOS), reading page with error states, calendar picker with per-calendar toggles, import API (uploadAsync multipart + calendar POST). 7 API integration tests written (need Postgres). 160 mobile tests pass. All typechecks clean. **Remaining:** Postgres run for API tests, Maestro e2e, evidence capture, `import/found` page if needed.

**Parallel track:** Flow 08 Glance (widgets, Live Activity, push) needs a physical iPhone run; not started.

**Blockers:** none. Pre-existing: `sync.test.ts`'s `routine_block_edit` test hardcodes a now-past date (`2026-11-02`) — needs a fixed test clock.

**Next:** Flow 02 proof (Postgres + Maestro + evidence). Then Flow 07.
