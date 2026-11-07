# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings, 06 Plan with AI. Design v11 applied.

**Flow 02 code complete.** Remaining: Postgres run for API tests, Maestro e2e, evidence capture.

**Flow 07 code complete.** OAuth 2.1 server (RFC 7591 dynamic reg, PKCE S256, refresh rotation with family revocation). MCP Streamable HTTP server (`@modelcontextprotocol/sdk` 1.32.2, one server per request) with tools: list_terms, get_schedule, list_categories, get_recent_plans, propose_changes. Connector settings UI in mobile (behind `FEATURES.d35Screens`). push.chat_draft handler. Auth smoke wrong_role checks filled. oauth.test.ts green on Postgres incl. a real tools/call round trip. **Remaining:** consent page design review (D-35 stop point; it shows the client id, not its name), real Claude connector test (needs public HTTPS), evidence.

**CI green locally (2026-11-05):** test epoch is 2037/2038 (same calendar as 2026/2027; 2036 broke weekdays). Audit ignores GHSA-mrhx-c7xc-m3w5 (zod in @expo/cli, see BACKEND_SETUP §Versions). Local dev DB shifted to 2037/2038 on 2026-11-07 (matches the seed).

**Parallel track:** Flow 08 Glance (widgets, Live Activity, push) needs a physical iPhone run; not started.

**Blockers:** none. **Next:** Flow 02 proof, then Flow 07 evidence. Then Flow 08.
