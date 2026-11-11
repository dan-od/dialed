# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flows 01, 03, 04, 05, 09, 06, 07, 02, 08 (see each `Flow_XX/verification.md`). Design v11 applied.

**Home-lab prep: done in the repo** (2026-11-11, D-114…D-122): compose per Homelab Playbook (no cloudflared; `web` + `dialed-internal`), `infra/homelab/dialed.conf`, `deploy.yml` (off until repo var `DEPLOY_ENABLED=true`), `scripts/homelab-init`, `dist/invite.js`, `dist/test-owner.js`, SMTP transport + startup refusals, `TRUST_PROXY_IP` CIDR, planning guide now ships in the image, iOS Release → `https://dialed.okoro.me` (`scripts/ios_release`). Local run of the prod stack behind a temp nginx passed (healthz, login, sync, invite, test-owner create/delete); fixed the image build (pnpm 9 `deploy --legacy`) and `.env` inline-comment parsing.

**Owner, on the home lab (checklist `infra/homelab/README.md`):** run `homelab-init`, fill SMTP_URL / EMAIL_FROM / BACKUP_DIR / ANTHROPIC_API_KEY, Resend + DNS, nginx conf, tunnel hostname `dialed.okoro.me`, repo secrets + deploy key + `DEPLOY_ENABLED`, first start, go-live sequence, Uptime Kuma.

**Live AI wiring (2026-11-11):** provider factory (`provider-factory.ts`) dispatches by AI_MODE × provider_mode; runner passes real tool schemas; BYO keys per-request only (D-13); retry job fails cleanly for BYO; timetable import uses live Anthropic; per-run logging (provider, tokens, duration).

**Unverified:** real Anthropic plan call on the server key (needs homelab redeploy), real SMTP send, tunnel/Cloudflare path, Release build on the iPhone (Personal Team signing, App Group, 7-day renewal), `chown` of the JWT key on Linux.

**Still open from flows:** owner reviews of Flow 08/02 sheets and the consent page (D-35); `APPLE_TEAM_ID` (D-77); paid account + iPhone for push/LA proof.

**Local dev:** dev Postgres keeps volume `dialed_pgdata` via the dev override. Dev API: `/tmp/f07-api.sh`. CI epoch 2037/2038.
