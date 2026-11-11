# Live AI wiring

## Problem
`startPlanRun` always calls `createFixtureProvider(requestText)`, ignoring AI_MODE, server key, model, and provider_mode. The live providers exist in `@dialed/planning` but are never used by the in-app plan runner.

## Changes

### 1. `packages/planning/src/tools.ts` (new)
Export `PLAN_TOOL_SCHEMAS` — the propose_changes + ask_user JSON tool definitions that both the runner and MCP surface use (Product truth #6).

### 2. `apps/api/src/plans/provider-factory.ts` (new)
`createPlanProvider(opts)`:
- AI_MODE=fixture → createFixtureProvider(requestText)
- AI_MODE=live + server → createAnthropicProvider({ apiKey: ANTHROPIC_API_KEY, model })
- AI_MODE=live + byo → dispatch by provider field using X-Provider-Key / X-Provider-Base-URL (D-13, never stored); missing key → throw 'byo_key_required'

### 3. `apps/api/src/plans/runner.ts`
- Accept providerMode, provider, byoKey?, byoBaseUrl? in startPlanRun
- Use createPlanProvider instead of createFixtureProvider
- Pass PLAN_TOOL_SCHEMAS to runPlan
- Log provider id, model, tokens in/out, duration, error_code per run (never keys or request text)

### 4. `apps/api/src/plans/routes.ts`
Pass provider_mode, provider, and BYO headers (X-Provider-Key, X-Provider-Base-URL) through to startPlanRun.

### 5. `apps/api/src/jobs/handlers.ts`
Read provider_mode/provider from plan row. Server mode → retry with server key. BYO mode → fail cleanly with 'byo_key_unavailable'.

### 6. `apps/api/src/imports/routes.ts`
AI_MODE=live → createAnthropicProvider (vision-capable) instead of createFixtureProvider('timetable').

### 7. Daily limits
Enforce PLAN_DAILY_LIMIT on the live path (already checked in service.create for server mode; verify it covers answer/reply re-runs too).

### 8. Tests (`packages/planning/test/factory.test.ts`, `apps/api/test/plans/runner.test.ts`)
- Factory picks right provider per mode
- Live mode never returns fixture provider
- PLAN_TOOL_SCHEMAS has both tools with non-empty input_schema
- Mocked Anthropic response yields real changes through runPlan
- BYO without key fails with 'byo_key_required'
- Retry job with BYO plan fails with 'byo_key_unavailable'
