# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings. Design v11 applied.

**Flow 06 server-side complete** (`plans/flow-06.md`): steps 1–8 done. Contracts, planOps/applyOps/planImpact, shared validator, block writers, approve transaction, engine + plan routes, provider adapters (Anthropic/OpenAI/Gemini/compat + SSRF + test-key + redaction), worker jobs (enqueue, plan.retry, push.plan_ready, plans.sweep). 155 tests pass (116 API + 39 planning); 1 pre-existing sync failure. **Next:** step 9 (mobile foundation), then 10–12 (client UI). Then Flow 02, then 07.

**Parallel track:** Flow 08 Glance (widgets, Live Activity, push) needs a physical iPhone run; not started.

**Blockers:** none. Pre-existing: `sync.test.ts`'s `routine_block_edit` test hardcodes a now-past date (`2026-11-02`) — needs a fixed test clock.

**Suggested model:** Sonnet for 02. Opus at Medium for remaining Flow 06 client steps and 07.
