# Flow_07: Plan from an AI app (connector)

## Goal
An external AI assistant (Claude, ChatGPT, Gemini, Cursor, or any MCP client), acting for the Planner, reads the Planner's real schedule and delivers a valid draft that the Planner approves in Dialed. Trigger: the Planner asks their AI app to plan ("move gym to mornings next week") after connecting Dialed once. Success: a `ready` plan (`source=mcp`) exists, the Planner is notified, and reviews it in Flow 06. Boundary: connection (OAuth), MCP tools/resources, drafting and notification; review/approve is Flow 06. Neighbours: 09 (Settings entry), 06 (exit).

## References and coverage
REF-001 states: `claude-chat` (connected state), `push-chat`. REF-003 planning guide (primary), REF-004 sketch. NAT-06 OAuth sign-in/consent page (**not prototyped — requires a flow-prototype review and owner approval before production UI**). Contract: `mcp/tools.md`, guide `mcp/planning-guide.md`.

## Entries, sequence, and exits
**Connect (in Dialed)** — Settings → AI assistant → "Plan from your AI app":
1. Not connected: copy "Plan in the AI app you already use, then approve here. Works with any assistant that supports MCP connectors: Claude, ChatGPT, Gemini, Cursor and more. A normal Pro or Plus plan covers it; no API key." Steps: 1 In your AI app, add a custom connector · 2 Paste this URL · 3 Sign in with your Dialed account. URL row `api.<domain>/mcp` + Copy (toast "Copied the connector URL."). "I've added it" → refreshes `GET /v1/connector`; if a client is connected → success; if not yet → toast "Not connected yet. Finish signing in from your AI app."
2. Connected: one row per client, named with its redirect host ("Claude · claude.ai connected · Reads your schedule, sends drafts. Nothing changes until you approve here."), "Send a test draft from chat" (sample plan + push), "Connect another app", "Disconnect all" (and per-row swipe Disconnect).
**Connect (in the AI app)** — the AI app discovers `/.well-known/oauth-protected-resource` → registers dynamically → opens `/oauth/authorize` in a browser:
3. **Sign in** page (web, Dialed design identity): Continue with Apple / email + password (+ code if new device policy requires) → **Consent** page: "<Client name> wants to use Dialed" · "It can: see your schedule, categories, terms and recent plans; send you plan drafts to approve. It can't: change your schedule, approve plans, or see your email." · Allow / Cancel. Redirect back with code.
**Plan in chat**:
4. The AI reads `dialed://planning-guide`, calls `list_terms`, `get_schedule`, `list_categories`, `get_recent_plans`, asks clarifying questions in chat, then `propose_changes`. Invalid → errors returned; AI fixes (max 3). `ready` → AI tells the Planner "Your plan is ready to review in Dialed."
5. Server sends push "<Client> sent a plan from chat · 3 changes to Fall term. Review and approve here." → tap → Flow 06 Review (subtitle "From <Client> chat"). Planner can toggle/reply in-app (replies go through the in-app engine) or keep revising in chat with the same `proposal_id` until decided.
Exits: Flow 06 Review.

## States and feedback
| State | Feedback |
|---|---|
| Not connected | steps + URL |
| Connecting (waiting) | "I've added it" spinner ≤ 3 s |
| Connected | success haptic, client rows |
| OAuth sign-in error | web page inline errors (same copy as Flow 01) |
| Consent cancelled | AI app shows its own error; nothing stored |
| Token expired | MCP 401 → client refreshes; refresh revoked → client must reconnect |
| Draft invalid | errors to AI only; Planner sees nothing |
| Draft ready | push (deferred to quiet-hours end); appears in Recent plans "From <Client> chat" |
| Rate limited | MCP error `rate_limited` with retry-after |
| Disconnected | toast "Disconnected. No AI app can see your schedule now." all tokens revoked |
| Draft after Planner already approved/discarded | AI gets `plan_not_ready`; a new `propose_changes` without id creates a new draft |

## Interaction surface and transitions
In-app: section inside the AI assistant **page** (Flow 09 settings stack). OAuth: **web pages** in the AI app's browser (system web auth session). Notification: **system banner** → deep link. Haptics: success on connect; none otherwise. No custom motion on web pages beyond 120 ms fades.

## Actions and functions
| Action | Endpoint / tool | Auth | Side effects | Limits |
|---|---|---|---|---|
| Discover | `GET /.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` | none | — | cached |
| Register client | `POST /oauth/register` (RFC 7591) | none, rate-limited 10/h/IP | `oauth_clients` | name ≤80, https redirect URIs (or loopback for desktop apps) |
| Authorize | `GET/POST /oauth/authorize` | Dialed sign-in + CSRF + PKCE S256 | `oauth_codes` | code 60 s single-use |
| Token | `POST /oauth/token` (authorization_code, refresh_token) | PKCE verifier | `oauth_tokens` (hashes) | access 1 h, refresh 30 d rotating |
| MCP session | `POST/GET /mcp` (Streamable HTTP) | Bearer MCP token, audience `/mcp` | — | 60 calls/min/token |
| Read tools | `list_terms`, `get_schedule`, `list_categories`, `get_recent_plans` | scope `schedule:read` | audit `ai:<client> read` | `get_schedule` ≤ 120 days |
| Draft | `propose_changes` | scope `plans:draft` | validator → plan `ready` + `push.chat_draft`; audit | 20 ready drafts/day/client |
| List/disconnect | `GET /v1/connector`, `DELETE /v1/connector[/:clientId]` | app token | revoke **the caller's** tokens for that client only | — |
| Test draft | `POST /v1/connector/test-draft` | app token | sample plan + push | 3/day |

## Data and integrations
- Persistent data: yes
- `oauth_clients`, `oauth_codes`, `oauth_tokens`, `plans` (`source=mcp`, `client_name`), `audit_log`, `jobs`.
- External: any MCP client; APNs.
- Env: `MCP_ENABLED`, `PUBLIC_BASE_URL`, `OAUTH_*`.

## Security and abuse cases
Confused deputy / token passthrough (MCP tokens audience-bound, never forwarded); malicious client registration (consent shows client name and redirect host; per-client limits; revocation); prompt injection in the external chat (tools read-only + draft-only; validator; Planner approval); data minimisation (no email/device data in tools); open redirect (exact redirect match); CSRF on consent; phishing look-alike pages (consent page lives only on `PUBLIC_BASE_URL`); token theft (hashed at rest, short-lived access).

## Accessibility
Settings section: steps as an ordered list; Copy button labelled "Copy connector URL"; client rows announce status. OAuth web pages: semantic forms, labels, focus order, 200% zoom, AA contrast, `prefers-color-scheme` + `prefers-reduced-motion`.

## Platform behavior
Connector URL: `https://api.okoro.me/mcp` (D-38). Free Apple account: chat drafts notify via local notification after background refresh, not APNs.
OAuth pages are server-rendered HTML (no SPA), ≤ 30 KB, Anton + system font, light/dark. Desktop AI apps may use loopback redirect URIs (allowed per RFC 8252).

## Contracts
C-0907, C-0706, `ai-engine` (shared validator), `notifications` (`CHAT_DRAFT`), `identity-session` (separate token audience), `mcp/tools.md`.

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| OAuth discovery + DCR + PKCE | `oauth/*` | api tests (spec flows, bad verifier, bad redirect) | MCP Inspector connect | evidence/flows/Flow_07/inspector.mp4 | not started |
| Tools return only own data | MCP tools | cross-user test (alice token never sees bob) | — | — | not started |
| propose_changes → validator → ready | tool handler | tests: invalid → errors; valid → plan + job | — | — | not started |
| Push on ready | `push.chat_draft` | job test (APNS_MODE=log) | device | …/push-chat.mp4 | not started |
| Review from chat draft | Flow 06 Review | e2e deep link | recording | …/review-chat.mp4 | not started |
| Disconnect revokes | `/v1/connector` | api test | screenshot | …/disconnect.png | not started |
| Real client | — | — | Claude custom connector end-to-end with owner account — **unverified by design until a public HTTPS host exists** (CLIENT_QUESTIONS #3); proven locally with MCP Inspector on localhost | …/claude-connector.mp4 | not started |
| Consent page prototype approved | flow-prototype | — | approval record | evidence/design/consent-approval.md | not started (stop point) |

## Open decisions
D-29 (OAuth specifics, ASSUMED). Consent page design requires owner approval (prototype) before production.

## Build seed
Build after Flow 06's validator and plans exist. First failing test: "an MCP client with a valid token calling get_schedule for 2026-10-19..2026-10-25 receives the owner's 7 days and no rows from other users".
