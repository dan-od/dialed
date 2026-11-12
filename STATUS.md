# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flows 01, 03, 04, 05, 09, 06, 07, 02, 08 (see each `Flow_XX/verification.md`). Design v11 applied.

**Home-lab prep: done in the repo** (2026-11-11, D-114…D-122): compose per Homelab Playbook (no cloudflared; `web` + `dialed-internal`), `infra/homelab/dialed.conf`, `deploy.yml` (off until repo var `DEPLOY_ENABLED=true`), `scripts/homelab-init`, `dist/invite.js`, `dist/test-owner.js`, SMTP transport + startup refusals, `TRUST_PROXY_IP` CIDR, planning guide now ships in the image, iOS Release → `https://dialed.okoro.me` (`scripts/ios_release`). Local run of the prod stack behind a temp nginx passed (healthz, login, sync, invite, test-owner create/delete); fixed the image build (pnpm 9 `deploy --legacy`) and `.env` inline-comment parsing.

**Owner, on the home lab (checklist `infra/homelab/README.md`):** run `homelab-init`, fill SMTP_URL / EMAIL_FROM / BACKUP_DIR / ANTHROPIC_API_KEY, Resend + DNS, nginx conf, tunnel hostname `dialed.okoro.me`, repo secrets + deploy key + `DEPLOY_ENABLED`, first start, go-live sequence, Uptime Kuma.

**Live AI (2026-11-11):** provider factory by AI_MODE × provider_mode; BYO keys per request only (D-13). Planning context preloaded per run (D-123): today + 14 days, one line per block with refs (b/c/t) mapped back in the validator, cached per user + revision, in the first user message; guide is now rendered and cached as the system prompt; shared read tools with MCP; MCP `get_context`. Seed: ~660 tokens/week. Compare models: `./scripts/plan_compare claude-haiku-5-5 claude-sonnet-5-5`. Plan quality (D-124): partial plans instead of validation_failed, per-round validation log, `PROTECTED NOW` line, PLAN_TEMPERATURE=0, redo route, accurate failure copy in the app.

**Live Activity (2026-11-11):** brand symbol imageset, header/bottom row per owner review (D-108 approved); Release build installed on the iPhone via `scripts/ios_release device` (auto-detects UDID; run with `APPLE_TEAM_ID=AH3LD3CJ26`).

**Unverified:** real Anthropic plan call with the context (needs homelab redeploy; owner keeps the key there only, so turns per request and 3× repeat match are measured with `dist/plan-compare.js`, README §7), Anthropic prompt-cache hits, real SMTP send, tunnel/Cloudflare path, LA on the lock screen after round 2, `chown` of the JWT key on Linux.

**Still open from flows:** owner reviews of Flow 08/02 sheets and the consent page (D-35); `APPLE_TEAM_ID` (D-77); paid account + iPhone for push/LA proof.

**Local dev:** dev Postgres keeps volume `dialed_pgdata` via the dev override. Dev API: `/tmp/f07-api.sh`. CI epoch 2037/2038.
