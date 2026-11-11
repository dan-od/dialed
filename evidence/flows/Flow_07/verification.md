# Flow 07 — verification (Plan from an AI app, connector)

Data: the owner's and Alice's seed in local Postgres (2037/2038 calendar). Runtime: local API on :8080 with
`MCP_ENABLED=true`, `DEV_CLOCK=2037-10-20T12:00:00-04:00`, `AI_MODE=fixture`, `APNS_MODE=log`, the worker
running; iPhone 17e Simulator (iOS 27.0, dev build of `me.okoro.dialed`). No public host: everything runs on
`http://localhost` (the connector URL `dialed.okoro.me/mcp` is not live yet, CQ #3).

Re-run:
- `pnpm --filter @dialed/api exec vitest run test/oauth.test.ts test/mcp.proof.test.ts` (36 tests) and the
  full API suite `pnpm --filter @dialed/api test`.
- `apps/api/src/cli/flow07_proof.ts` (scripted MCP client → `runtime/mcp-transcript.json`, OAuth HTML).
- `scripts/flow07_evidence` (Maestro `e2e/connector_1.yaml`, MCP client, `e2e/connector_2.yaml`;
  `ONLY=dark|light`). `scripts/dev_evidence_cleanup` resets plans, plan-approved rows and connector tokens.

## Results

| Requirement | Implementation | Automated | Runtime evidence | Status |
|---|---|---|---|---|
| Discovery + 401 `resource_metadata` | `oauth/routes.ts`, `/mcp` 401 | `oauth.test.ts` discovery, app JWT refused | `runtime/mcp-transcript.json` steps 1–2 | passed |
| Dynamic registration (RFC 7591), https or loopback, 10/h per IP | `OAuthService.register` | register / bad redirect / loopback; 11th from one IP → 429 | transcript `register` | passed |
| Authorize: exact client + redirect, PKCE S256 only, CSRF, code 60 s single use | `routes.ts` authorize, `createCode`, `exchangeCode` | unknown client, unregistered redirect (no redirect), plain PKCE, no CSRF, wrong verifier, token redirect mismatch, code replay | transcript: sign-in, inline error, consent, allow → 302 with code + state, replay refused | passed |
| Consent cancelled → nothing stored | `action=cancel` | redirect `access_denied`, 0 codes | — | passed (automated) |
| Tokens: 1 h access, 30 d rotating refresh, reuse revokes family, hashes only | `issueTokenPair`, `refreshToken` | full code flow, refresh reuse, hashes-only | transcript `token` (`expires_in` 3600) | passed |
| Audience binding (MCP token ≠ app token) | `verifyAccessToken`, `/v1` auth | app JWT at `/mcp` 401; MCP token at `/v1` 401 | transcript `MCP token refused by /v1` | passed |
| Read tools, own data only | `mcp/server.ts` | `get_schedule` 7 days with no Bob rows; Alice never sees owner's term; Bob can't draft on Alice's category | transcript: `list_terms`, `list_categories`, `get_schedule` 7 days, `get_recent_plans`, guide resource, instructions | passed |
| `list_categories` | fixed (see below) | shape test | transcript `list_categories` | passed |
| Read audit `ai:<client>` | `auditRead` (D-67) | 4 tools → 4 `mcp_read` rows | — | passed (automated) |
| `ask_user` not exposed | tool list | exact 5-tool list | transcript `tools/list` | passed |
| Draft invalid → errors to AI only | validator in `propose_changes` | no plan row | transcript `invalid → errors only`; Planner sees nothing | passed |
| Draft valid → ready plan (`source=mcp`, `client_name`) + `push.chat_draft` | `propose_changes`, `enqueueChatDraft` | plan row, one job with client name, `mcp_propose` audit | transcript `valid → ready`; worker log: `push.chat_draft … personal tier — push skipped` (the free-Apple-account path in the flow file: local notification after background refresh, not APNs) | passed |
| Revise with same `proposal_id`; `plan_not_ready` after decision | revise branch | version 2, 2 changes; discard → `plan_not_ready` | — | passed (automated) |
| Review from chat draft ("From <client> chat") → Approve | Flow 06 Review, `planSourceLabel` | — | `review-chat-*`, `approved-chat-*`, `recordings/connector2-dark.mp4` (deep link `dialed://plan/<id>`) | passed |
| Connector: not connected (steps, URL, Copy toast, "Not connected yet") | `ai-assistant.tsx` | — | `connector-not-connected-*`, `connector-copied-*`, `connector-not-yet-*` | passed |
| Connector: connected rows, test draft, connect another, Disconnect all | `ai-assistant.tsx` | test-draft API test | `connector-connected-*` | passed |
| Disconnect (row and all) revokes only the caller's tokens | `/v1/connector[/:id]` | live MCP token → 401 after delete; Bob can't disconnect Alice; delete-all spares Bob | `connector-disconnect-ask-*`, `connector-disconnected-*` (toast) | passed |
| Rate limits | `/mcp` 60/min/token, 20 drafts/day (D-64), route limits | route limit → 429 + `retry-after` (was 500, fixed) | — | passed (automated); 60/min and 20/day not exercised by a test |
| Light theme | tokens | — | `*-light.png` | passed |
| iPhone SE / AX1 | — | — | not captured for Flow 07 (settings rows reuse Flow 09 components proven at SE/AX1) | not run |
| Haptics (success on connect/disconnect, warning on confirm) | `haptic.*` | — | — | unverified (physical device only) |
| Push banner → Review | `push.chat_draft`, deep link | worker job | deep link proven; banner needs APNs + device | unverified (Flow 08 device run) |
| **OAuth sign-in / consent / done pages (NAT-06)** | `oauth/pages.ts`, functional copy | page tests above | HTML on disk: `runtime/oauth-signin.html`, `oauth-signin-error.html`, `oauth-consent.html` (not reviewed as UI) | **unverified by design — D-35 stop point**; needs flow-prototype review + `evidence/design/consent-approval.md` |
| Disconnect-all designed dialog (NAT-14) | native action sheet stands in (D-66) | — | `connector-disconnect-ask-*` (row variant) | **unverified by design — D-35** |
| Real Claude custom connector | — | — | needs a public HTTPS host (CQ #3, Cloudflare tunnel = stop condition) | **unverified by design** |

Totals: API 159/159 (16 files; `oauth.test.ts` + `mcp.proof.test.ts` = 36), planning 56/56, mobile jest 160/160,
typecheck, ESLint, Prettier, `expo lint` (0 errors). Maestro `connector_1.yaml` + `connector_2.yaml` green in
dark and light. Contact sheet: `evidence/flows/flow07-sheet-1.png` (one look, compared with the prototype's
connector markup).

## Bugs found and fixed in this pass
- **Open redirect (security).** `GET /oauth/authorize` accepted any `client_id` / `redirect_uri` and rendered
  sign-in; **Cancel** then redirected to the unvalidated URI (Allow was only safe because `createCode`
  re-checked). Now an unknown client or a redirect that isn't an exact registered match gets an error page and
  is never redirected to (RFC 6749 §4.1.2.1). Failing test first: `refuses an unregistered redirect_uri`.
- **Consent showed the client id, not its name.** It now shows the registered name and the redirect host
  (flow file security: client name spoofing → consent shows the redirect host). Copy only; the page design is
  still the D-35 stop point.
- **`list_categories` always failed over MCP** (`Failed query`: column `"group"` and `usual_minutes` don't
  exist; deleted categories weren't filtered). Fixed to `group_name`, live rows only, `usual_minutes` derived
  (D-68). Test: `list_categories returns the caller's live categories in the tools.md shape`.
- **Read tools weren't audited** (flow file: "audit `ai:<client>` read"). Added (D-67); test `every read tool
  call is audited as ai:<client>`.
- **The whole connector section was behind the D-35 flag**, which ships off: nobody could connect in
  production. Only the Disconnect-all dialog is D-35; the section is now unflagged (D-66).
- **"I've added it" did nothing visible.** Now: spinner while it checks, success haptic when a client is
  connected, toast "Not connected yet. Finish signing in from your AI app." otherwise.
- **One tap on a client row disconnected it**, and Disconnect all appeared only with 2+ clients and ran with no
  confirmation. Both now ask first (native destructive action sheet, flow-file copy); Disconnect all shows
  whenever a client is connected (D-66). Missing copy "A normal Pro or Plus plan covers it; no API key." and
  the row's "Reads your schedule, sends drafts…" line added.
- **Local environment:** migration `0003_mcp_oauth` had never been applied to the dev DB (tests use their own
  DB), `expo-clipboard` (added by Flow 07) wasn't in the installed dev client, and Metro had cached the failed
  lookup, so the app showed a red box. Applied the migration, rebuilt the dev client, restarted Metro.
- **Dev data:** Flow 06 evidence left seven copies of a plan-moved Saturday block (2026-11-05), so every
  Saturday draft failed the overlap check. `dev_evidence_cleanup` now also soft-deletes plan/timetable/calendar
  rows and revokes the owner's connector tokens.
- **Tripped route rate limits answered 500** ("couldn't reach the server") instead of 429 + `retry-after`, on
  every route with its own limit (the limiter's error builder returned a plain body with no status). It now
  throws an `AppError`. Failing test first: `a tripped route limit answers 429`.
- **Dead route `import/found`** in the app layout (Flow 02's unbuilt page) made Expo Router warn on every
  render; the dev warning bar covered the pinned Approve button and swallowed Maestro's tap. Entry removed.
- Tests: the DB-backed registration limit (10/h per IP) persists between local runs; test registrations now use
  their own `remoteAddress`, and one test proves the 11th registration from an IP gets 429.

## Deltas from prototype v11 / the flow file (and why)
- Per-row Disconnect is tap + confirm, not swipe (D-66): no swipe-row component exists yet.
- Disconnect all uses a native action sheet until the designed dialog (NAT-14, D-35) is approved.
- Client rows don't show "Used 2 min ago" (sub-interactions micro-interaction): the connector API has no
  last-used time. Not built.
- Same client registered twice shows two rows but without the "(2)" suffix. Not built.
- A revised chat draft doesn't push again (D-65).
- Visual deltas seen in the contact sheet vs the prototype's connector markup (not changed in this pass): "I've
  added it" is a secondary button (prototype: primary); step 3 sits under the URL row instead of in the
  numbered list; connected rows show the client name with "<host> connected · …" and a Disconnect value
  (prototype: "✓ Claude connected" line). The dev-only LogBox bar still shows in two dark captures.
- Server-side cap of 3 invalid rounds isn't enforced: the planning guide tells the AI to stop after 3; the
  server returns errors every time and stores nothing, so the Planner still sees nothing.

## Decisions taken (ASSUMED, reversible) — recorded in `00_Brief_Analysis.md`
D-64 per-Planner draft limit · D-65 no push on revision · D-66 connector unflagged, native confirms, tap not
swipe · D-67 read audit rows · D-68 derived `usual_minutes` · D-69 scripted SDK client instead of MCP Inspector.
