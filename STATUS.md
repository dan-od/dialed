# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings, 06 Plan with AI. Design v11 applied.

**Flow 06 complete.** Steps 1–14 done. 115 API tests pass (1 pre-existing `sync.test.ts` failure), 153 mobile tests pass. Maestro e2e: plan_happy, plan_question, plan_reply, plan_errors, plan_stale, ai_settings (dark + light). Evidence: 23 screenshots, 2 recordings, contact sheet, verification.md. Bugs fixed: null safety (changes/impact/checks after approve), duplicate React key, approve validation bypass for fixtures (D-61–D-63). **Next:** Flow 02, then 07.

**Parallel track:** Flow 08 Glance (widgets, Live Activity, push) needs a physical iPhone run; not started.

**Blockers:** none. Pre-existing: `sync.test.ts`'s `routine_block_edit` test hardcodes a now-past date (`2026-11-02`) — needs a fixed test clock.

**Suggested model:** Sonnet for 02. Opus at Medium for 07.
