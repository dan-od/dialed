# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings. Design v11 applied.

**In progress — Flow 06** (`plans/flow-06.md`): steps 1–3 done (plan contracts, `planOps`/`applyOps`/`planImpact`, the shared validator), pushed through `dec3ff7`. **Next:** step 4 (extract sync's close+insert writers), then step 5 (approve transaction). Then 02, then 07.

**Parallel track:** Flow 08 Glance (widgets, Live Activity, push) needs a physical iPhone run; not started.

**Blockers:** none. Check `CLIENT_QUESTIONS.md` before continuing Flow 06. Pre-existing/unrelated: `sync.test.ts`'s `routine_block_edit` test hardcodes a now-past date (`2026-11-02`) and fails on real clock time — needs a fixed test clock.

**Suggested model:** Opus at Medium for 06 and 07 (planning engine, validator). Sonnet for 02. Opus at High only if matching or sync bugs stall.
