# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings, 06 Plan with AI. Design v11 applied.

**Flow 02 code complete.** Remaining: Postgres run for API tests, Maestro e2e, evidence capture.

**Flow 07 code complete.** OAuth 2.1 server (RFC 7591 dynamic reg, PKCE S256, refresh rotation with family revocation). MCP Streamable HTTP server (`@modelcontextprotocol/sdk` 1.12.1) with tools: list_terms, get_schedule, list_categories, get_recent_plans, propose_changes. Connector settings UI in mobile (behind `FEATURES.d35Screens`). push.chat_draft handler. Auth smoke wrong_role checks filled. oauth.test.ts written (needs Postgres). **Remaining:** Postgres run for tests, consent page design review (D-35 stop point), real Claude connector test (needs public HTTPS).

**CI fixed:** Postgres 16 service container in GitHub Actions. sync.test.ts date-bomb fixed (TEST_NOW clock).

**Parallel track:** Flow 08 Glance (widgets, Live Activity, push) needs a physical iPhone run; not started.

**Blockers:** none. **Next:** Flow 02 proof, then Flow 07 proof (Postgres + evidence). Then Flow 08.
