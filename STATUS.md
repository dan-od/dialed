# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings. Design v11 applied.

**Flow 06 steps 1–13 done.** Server-side (1–8): 155 tests pass. Client-side (9–13): plan API client, polling hook, model/copy/drafts, dynamic aiName, UI primitives (DialLoader, Stamp, PinnedFooter, StepList), composer with starter chips and draft autosave, review/done/stale/error/question pages, AI assistant settings (BYO Keychain), plan-ready notifications and deep links. 153 mobile tests pass. **Next:** step 14 proof (Simulator evidence), then Flow 02, then 07.

**Parallel track:** Flow 08 Glance (widgets, Live Activity, push) needs a physical iPhone run; not started.

**Blockers:** none. Pre-existing: `sync.test.ts`'s `routine_block_edit` test hardcodes a now-past date (`2026-11-02`) — needs a fixed test clock.

**Suggested model:** Sonnet for 02. Opus at Medium for Flow 06 proof step and 07.
