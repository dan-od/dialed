# Plan: preloaded planning context (Flow 06)

Goal: the in-app AI plans in one model turn from a compact picture of the schedule, and MCP clients get the
same picture (product truth #6). No tool round trips in the normal case.

## What exists today
- `runPlan` (`packages/planning/src/loop.ts`) sends `system = guide`, `messages = history + request`, tools =
  `propose_changes`, `ask_user`. Any other tool call gets "Unknown tool".
- `get_schedule` / `list_terms` / `list_categories` live only in `apps/api/src/mcp/server.ts`, each with its
  own SQL and JSON shaping.
- `block_ref` in every change is a **routine block id** (`validate.ts` `checkBlock`); one-off blocks can't be
  targeted. Category and term fields are real uuids.
- Bug found: `runner.ts` passes the raw guide template, so the model sees `{{user.first_name}}` etc.

## Context format (plain text, built from `ToolContext`)
```
DIALED CONTEXT rev 412 · today Wed 2026-11-11 · America/Toronto · window 2026-11-11..2026-11-25
LIMITS day 07:00-23:00 · quiet 22:00-07:00 · max work 10h/day
TERM t1 Fall 2026 2026-09-02..2026-12-18 active
CATEGORIES
c1 Class (School) protected
c2 Meal (Life) quiet
c3 Gym (Health)
DAYS  (ref = routine block; "-" = one-off, can't be changed by ref)
Wed 11-11
 b1 09:00-10:30 Cryptography c1 P
 b4 12:00-12:45 Lunch c2 Q
 -  18:00-19:00 Dentist c3 one-off
Thu 11-12
 b2 ...
```
- 15 days (today + 14), each resolved with `resolveRange` (routine + overrides). One line per block:
  ref, start-end, title, category ref, flags (`P` protected/class, `Q` quiet, `one-off`, `moved`, `skipped`
  shown as absent). Empty day prints `(free)`.
- Refs are deterministic for a revision: `b` numbered by first appearance in the window (date, start),
  `c` by category sort, `t` by term start. Routine blocks not seen in the window are not listed.
- Estimated tokens = chars / 4 (no tokenizer dependency). Target: a typical week of seed data under ~2k
  for the whole 15-day block; a test asserts it.

## Changes
1. **`packages/planning/src/context.ts`** (new): `buildContext(ctx: ToolContext, window = 15)` returns
   `{ text, refs: RefMap, rev, tokens }`. `RefMap` = `{ b: Map<ref, routineBlockId>, c: …, t: … }`.
2. **Cache**: `apps/api/src/plans/context-cache.ts` (new), in-process Map keyed `userId:revision`, small LRU
   (~200 entries). The worker process gets its own copy; that's fine.
3. **Refs in the validator** (`validate.ts`): `ValidateContext` gets optional `refs`. Before any rule, each
   `block_ref`, `category_id`, `term_id` (and `fields.category_id`) is resolved: known short ref -> real id;
   a real id passes through (MCP clients that used `get_schedule`); anything else -> error `unknown_ref`
   ("b9 isn't in your schedule"). `validate` returns the mapped `changes`; `runPlan` stores those, never the
   short refs. Unknown refs go back to the model through the existing invalid-round path.
4. **First user message**: `runPlan` gets an optional `context: string`; it is prepended to the first user
   message of the conversation (rebuilt each run at the current revision, also on answer/reply runs). The
   guide stays the system prompt, rendered per user with `renderGuide` (fixes the bug above) and otherwise
   static, so Anthropic prompt caching can hit it. I'll mark the system block `cache_control: ephemeral` in
   the Anthropic provider.
5. **Shared read tools**: `packages/planning/src/read-tools.ts` (new) with pure functions over
   `ScheduleData` for `get_schedule`, `list_terms`, `list_categories` (same JSON the MCP returns today; the
   `usual_minutes` average moves from SQL to code). `mcp/server.ts` calls these after loading data. The
   in-app loop answers these three tool calls with the same functions; `get_schedule` inside the window
   returns a short "already in your context" error so the model doesn't waste a turn. Their schemas are
   added to the in-app tool list.
6. **MCP `get_context`**: new tool returning the same text (from the same cache). MCP `propose_changes`
   resolves refs with the context for the *current* revision; it accepts an optional `context_rev`, and if
   refs are used with a stale rev it returns `context_stale` ("call get_context again") instead of guessing.
7. **Guide** (`mcp/planning-guide.md` §1): "Your schedule context is in the first message (in-app) or from
   `get_context` (MCP). Use its refs in changes. Call `get_schedule` only for dates outside its window."
   `mcp/tools.md` gets `get_context` and the ref rules.
8. **Logging**: `plan.run` log adds `contextTokens`, `turns`, `model`.
9. **Model switch + comparison (h)**: `PLAN_MODEL_ANTHROPIC` is already an env var (set it in the home-lab
   `.env`, restart `api` and `worker`); the `plan.run` log names the model so runs can be told apart. New
   `scripts/plan_compare` (owner-run, uses your key, costs a few cents): runs the seed fixture requests against the local dev DB for each model given
   (`./scripts/plan_compare claude-haiku-5-5 claude-sonnet-5-5`), stores nothing, prints a table per request:
   model, turns, tokens in/out, ms, changes, validation errors, and writes the drafts to `/tmp` so you can
   compare them side by side.

## Tests (failing first)
- `context.test.ts`: seed week renders the expected lines; refs deterministic; estimated tokens < 2000.
- `validate.test.ts`: `b1` maps to the right routine block id, `c2` to the right category; real ids pass
  through; `b99` -> `unknown_ref`.
- `loop.test.ts`: "Free up tomorrow" with a mocked provider that returns `propose_changes` (skips with refs)
  on its first call -> `status: ready` after exactly **one** provider call, stored changes carry real ids;
  the mock asserts the first user message contains the context and the system prompt has no `{{`.
- `read-tools.test.ts`: MCP and in-app return identical JSON for the same data.
- MCP: `get_context` returns the text; `propose_changes` with a stale `context_rev` -> `context_stale`.

## Files
New: `packages/planning/src/{context,read-tools}.ts`, `apps/api/src/plans/context-cache.ts`,
`scripts/plan_compare`, tests. Edited: `loop.ts`, `validate.ts`, `tools.ts`, `index.ts`,
`providers/anthropic.ts`, `apps/api/src/plans/runner.ts`, `apps/api/src/mcp/server.ts`,
`mcp/planning-guide.md`, `mcp/tools.md`, `packages/contracts/src/errors.ts` (`unknown_ref`,
`context_stale`), `00_Brief_Analysis.md` (new D-123 for the context design, ASSUMED).

## Not doing
- No change to what a change can target (one-off blocks stay untargetable, as today).
- No tokenizer dependency; estimates only, real counts come from the provider's usage numbers.
