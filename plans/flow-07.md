# Flow 07 — Plan from an AI app (connector): outline

Build after Flow 06 is green; it reuses the contracts `mcp.ts`, the tool handlers in `planning/tools.ts`, the validator, plan storage and Review.

Sources:
- `flows/Flow_07_Plan_From_AI_App.md`, its sub-interactions file
- `mcp/tools.md`, `mcp/planning-guide.md`
- BACKEND_SETUP §7
- SECURITY.md line 29 (OAuth) and line 80 (malicious clients)
- C-0706, C-0907
- `assets/references/mcp-server-sketch.ts`

## Scope
- OAuth 2.1 authorization server for MCP clients.
- The `/mcp` Streamable HTTP server.
- `propose_changes` → `push.chat_draft`.
- The connector section of AI assistant settings.

Review and approve are already built in Flow 06.

## Steps
1. **Read tools over MCP (build seed first).**
   - Mount `@modelcontextprotocol/sdk` at `/mcp` in the API process, behind `MCP_ENABLED`. This is a new dependency, already named in BACKEND_SETUP §1.
   - Server `instructions`, the resource `dialed://planning-guide` (rendered per user) and the prompt `plan_schedule`.
   - Read tools reuse `planning/tools.ts`, with `readOnlyHint`.
   - **Failing test first:** an MCP client with a valid token calling `get_schedule` for 2026-10-19..2026-10-25 receives the owner's 7 days and no rows from other users.
2. **OAuth server** (`apps/api/src/oauth/`):
   - Discovery: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
   - `POST /oauth/register` (RFC 7591): 10/h per IP, https redirect URIs or loopback, names of 80 characters or fewer.
   - `GET/POST /oauth/authorize`: sign in with the Dialed account, CSRF, PKCE S256 only, exact redirect match, a 60 s single-use code.
   - `POST /oauth/token`: authorization_code and refresh. Access tokens last 1 h; refresh tokens last 30 d and rotate, with reuse revoking the family.
   - Only token hashes are stored.
   - Scopes are `schedule:read plans:draft`.
   - Tokens are bound to the `/mcp` audience: app tokens are refused at `/mcp`, and MCP tokens are refused by `/v1`. This fully enables `wrong_role_denied` in `auth_smoke`.
   - Tests: the spec flows, a bad verifier, a bad redirect, code replay, refresh reuse.
3. **Sign-in and consent pages** (NAT-06: `oauth-signin`, `oauth-consent`, `oauth-done`).
   - Server-rendered HTML of 30 KB or less, Anton + the system font, light/dark, reduced motion.
   - **Stop point:** these are D-35 surfaces. Production UI needs a flow-prototype review and the owner's approval (`evidence/design/consent-approval.md`). Until then, build them behind the flag with the functional copy from the flow file, and report them as unverified by design.
4. **Drafts.**
   - `propose_changes` runs the shared validator. If invalid, the errors go back to the AI, the Planner sees nothing, and the AI gets 3 rounds.
   - If valid, the plan is stored with `source=mcp`, `client_name` from the OAuth client and `proposal_id`.
   - The same `proposal_id` revises the plan (`version+1`; an in-flight Approve gets `plan_changed`). After a decision, `plan_not_ready`.
   - Enqueue `push.chat_draft` with the copy "<Client> sent a plan from chat · N changes to <Term>…", using the Flow 06 push handler and deep link.
   - Limits: 60 calls/min per token and 20 ready drafts/day per client. Every call is audited as `ai:<client>`.
   - `ask_user` is not exposed over MCP.
5. **Connector API and settings.**
   - Routes: `GET /v1/connector`, `DELETE /v1/connector/:clientId`, `DELETE /v1/connector` (these revoke only the caller's tokens), and `POST /v1/connector/test-draft` (3/day).
   - Settings section "Plan from your AI app":
     - not connected: steps, the URL `api.okoro.me/mcp` with Copy, "I've added it";
     - connected: client rows named by redirect host, per-row swipe Disconnect, "Send a test draft from chat", "Connect another app";
     - "Disconnect all" opens a dialog (NAT-14, a D-35 surface, behind the flag).
6. **Proof.**
   - Locally, MCP Inspector against `http://localhost`: OAuth, tools, draft → logged push → Review on the Simulator → Approve.
   - Cross-user denial test, disconnect test.
   - The real Claude custom connector is **unverified by design** until a public HTTPS host exists. The owner still has to do the Cloudflare DNS and tunnel (CQ #3), and DNS / Cloudflare changes are a stop condition.

## Open items
- D-29 OAuth specifics (ASSUMED).
- The consent page design needs prototype approval.
- Whether the owner wants the tunnel set up before Flow 07, so the real-client proof can run inside the flow.

## Main risks
- Changes in the MCP SDK or the authorization spec. Pin the SDK version and test against Inspector.
- Confused-deputy and token-passthrough attacks. Use audience-bound tokens that are never forwarded.
- Client registration spam. Rate limits plus showing the client name and redirect host.

