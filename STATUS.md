# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings. Design v11 applied.

**In progress — Flow 06 Plan in app** (plan: `plans/flow-06.md`). Steps 1–3 done, all pure TS, no Simulator: plan contracts (`packages/contracts/src/plans.ts`, `mcp.ts`), `planOps`/`applyOps`/`planImpact` (`packages/schedule/src/plan.ts`), and the shared validator (`packages/planning/src/validate.ts`). Tests/typecheck/lint green; pushed (`17a7bb8`, `ae0be94`, `c9ce304`).

**Next:** Flow 06 step 4 (extract sync's close+insert writers into `sync/writers.ts`), then step 5 (approve transaction). Then 02 First week setup, then 07 Plan from AI app.

**Parallel track:** Flow 08 Glance (widgets, Live Activity, push) needs a physical iPhone run; not started.

**Blockers / owner decisions:** none recorded. Check `CLIENT_QUESTIONS.md` for open items before continuing Flow 06. Pre-existing, unrelated: `apps/api/test/sync.test.ts`'s `routine_block_edit` test hardcodes `effective_from: '2026-11-02'`, now in the past — fails on real wall-clock dates past that; needs a fixed test clock or a rolling date.

**Suggested model:** Opus at Medium for 06 and 07 (planning engine, validator). Sonnet for 02. Opus at High only if matching or sync bugs stall.
