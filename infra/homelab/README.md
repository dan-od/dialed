# Dialed on the home lab — owner checklist

Follows the Homelab Hosting Playbook (§4 conventions, §6 templates, §7 checklist). Public URL: **https://dialed.okoro.me**.

```
iPhone (cellular) → Cloudflare → Tunnel homelab01 → cloudflared → nginx-proxy (dialed.conf) → dialed-api:8080
                                                                    all on network `web`
dialed-api ─┬─ dialed-internal ─ dialed-db (Postgres 16, volume dialed-pgdata)
dialed-worker ┘                  dialed-backup (nightly pg_dump → BACKUP_DIR)
```

| Container | Networks | Notes |
|---|---|---|
| `dialed-api` | `web`, `dialed-internal` | `expose: 8080`, healthcheck `GET /healthz` on 127.0.0.1 |
| `dialed-worker` | `dialed-internal` | jobs, Live Activity scheduling, upload sweep |
| `dialed-db` | `dialed-internal` | never on `web` |
| `dialed-backup` | `dialed-internal` | `pg_dump -Fc` daily, keeps 14 days |
| `dialed-migrate` | `dialed-internal` | one-shot; api/worker wait for it to exit 0 |

The compose file is `infra/docker-compose.yml`. The root `.env` sets `COMPOSE_FILE=infra/docker-compose.yml` and
`COMPOSE_PROFILES=prod`, so every `docker compose …` command below works as written from
`/opt/docker-homelab/sites/dialed`.

---

## 1. In the repo — done

`infra/docker-compose.yml`, `infra/homelab/dialed.conf`, `.github/workflows/deploy.yml`, `scripts/homelab-init`,
`dist/invite.js`, `dist/test-owner.js`, startup validation, `TRUST_PROXY_IP` CIDR support, `scripts/ios_release`.

## 2. On the Docker host (`root@debian`)

Get a shell: `ssh root@100.76.5.106` (or `pct enter 100` on proxmox2). The prompt must read `root@debian`; never
deploy into `/opt/docker-homelab` on proxmox2 itself.

1. **Check space** (the image build needs ~1.5 GB free):
   ```bash
   df -h /opt /tmp
   free -h
   docker system df
   ```
   Short on disk: `docker builder prune -f`, then from Proxmox `pct resize 100 rootfs +20G`.
2. **Folder:**
   ```bash
   mkdir -p /opt/docker-homelab/sites/dialed
   ```
3. **First copy of the code** (later deploys come from GitHub Actions):
   ```bash
   cd /opt/docker-homelab/sites
   git clone https://github.com/dan-od/dialed.git dialed   # private repo: use a deploy key or gh auth
   ```
   or from the Mac: `rsync -az --exclude=.git --exclude=node_modules --exclude=.env --exclude=.secrets ./ root@100.76.5.106:/opt/docker-homelab/sites/dialed/`
4. **Secrets and .env:**
   ```bash
   cd /opt/docker-homelab/sites/dialed
   ./scripts/homelab-init
   ```
   It writes `.env` (0600) with random `POSTGRES_PASSWORD`, `CODE_PEPPER`, `ADMIN_TOKEN`, and
   `.secrets/jwt-ed25519.pem` (0600, owned by uid 1000 = the container's `node` user) plus the matching
   `JWT_KEY_ID`. It never overwrites an existing file. Fill in the four `TODO(owner)` lines (next steps).
   A literal `$` in any value must be written `$$`.
5. **Email (Resend free tier):**
   - Sign up at resend.com → Domains → Add `okoro.me`.
   - In Cloudflare (zone okoro.me → DNS) add exactly the records Resend shows, **DNS only (grey cloud)**:
     DKIM TXT `resend._domainkey`, SPF on the `send` subdomain (MX + TXT `v=spf1 include:amazonses.com ~all`), and
     DMARC TXT `_dmarc` = `v=DMARC1; p=none;` (if okoro.me already has an SPF or DMARC record, merge, don't add a second).
   - Wait for Resend to show the domain Verified → API Keys → create a key with "Sending access".
   - In `.env`: `SMTP_URL=smtps://resend:<the API key>@smtp.resend.com:465` and
     `EMAIL_FROM="Dialed <no-reply@okoro.me>"`.
6. **AI key:** paste the server key into `ANTHROPIC_API_KEY=`. In console.anthropic.com → Billing → set a
   **monthly spend limit**. Your key pays for every invited user's plans when they pick "Dialed server":
   - `PLAN_DAILY_LIMIT` (default **30**) = AI plan runs per user per day.
   - `IMPORT_DAILY_LIMIT` (default **6**) = timetable photo/file reads per user per day.
   Lower them in `.env` (e.g. `PLAN_DAILY_LIMIT=10`) if friends start using it heavily; users who bring their own
   key in Settings don't count against your bill.
7. **Backups folder** on the 2 TB drive (adjust the mount point):
   ```bash
   mkdir -p /mnt/backup/dialed && chmod 700 /mnt/backup/dialed
   ```
   Set `BACKUP_DIR=/mnt/backup/dialed` in `.env`. If the drive is mounted on proxmox2 rather than inside LXC 100,
   bind-mount it into the container first (`pct set 100 -mp0 /mnt/backup,mp=/mnt/backup`).
8. **nginx conf:**
   ```bash
   cp /opt/docker-homelab/sites/dialed/infra/homelab/dialed.conf /opt/docker-homelab/nginx/sites/dialed.conf
   docker exec nginx-proxy nginx -t && docker exec nginx-proxy nginx -s reload
   ```
   Reload, not restart. If `-t` fails, delete the file and fix it; never reload a broken config. The conf uses the
   `resolver` form, so nginx-proxy keeps running even before `dialed-api` exists.

## 3. In Cloudflare

Zero Trust → Networks → Tunnels → **homelab01** → Public Hostnames → Add:
subdomain `dialed`, domain `okoro.me`, service **HTTP → `nginx-proxy:80`**. This also creates the DNS record.
Never point it at `dialed-api:8080` directly (skips nginx, real-IP logging and CrowdSec).
No Cloudflare Access on this hostname: the iPhone app and MCP clients must reach it.

## 4. In GitHub

1. **Deploy key** (on `root@debian`):
   ```bash
   ssh-keygen -t ed25519 -f /root/.ssh/dialed_deploy -N "" -C "gh-actions-dialed"
   echo "from=\"100.64.0.0/10\" $(cat /root/.ssh/dialed_deploy.pub)" >> /root/.ssh/authorized_keys
   cat /root/.ssh/dialed_deploy      # paste into DEPLOY_SSH_KEY, then:
   rm /root/.ssh/dialed_deploy
   ```
   `DEPLOY_KNOWN_HOST`: run `ssh-keyscan -t ed25519 100.76.5.106` from proxmox2.
2. **Repo secrets** (Settings → Secrets and variables → Actions), the list at the top of
   `.github/workflows/deploy.yml`: `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `DEPLOY_HOST` (100.76.5.106),
   `DEPLOY_USER` (root), `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOST`, `DIALED_POSTGRES_PASSWORD`, `DIALED_CODE_PEPPER`,
   `DIALED_ADMIN_TOKEN`, `DIALED_JWT_KEY_ID`, `DIALED_SMTP_URL`, `DIALED_EMAIL_FROM`, `DIALED_ANTHROPIC_API_KEY`,
   and optionally `DIALED_BACKUP_DIR` (unset → dumps go to `sites/dialed/infra/backups`).
   Copy the first four app values **from the host's `.env`** (the workflow rewrites `.env` on every deploy, and the
   database password and pepper must never change after first start).
3. **Turn deploys on:** Variables tab → New repository variable `DEPLOY_ENABLED` = `true`. Until then the workflow
   skips (pushing it deployed nothing).
4. **Planning model (optional):** Variables tab → New repository variable `PLAN_MODEL_ANTHROPIC`, e.g.
   `claude-haiku-5-5`. Unset → `claude-sonnet-5-5`.

## 5. Start it

```bash
cd /opt/docker-homelab/sites/dialed && docker compose --profile prod up -d --build
docker ps --filter name=dialed                               # all Up (healthy); dialed-migrate Exited (0)
docker exec nginx-proxy wget -qO- http://dialed-api:8080/healthz   # {"ok":true}
docker exec nginx-proxy nginx -T | grep -A3 "dialed.okoro.me"
curl -I https://dialed.okoro.me/healthz                         # 200 from outside
```
If the api refuses to start, `docker logs dialed-api` names the missing key (e.g.
`AI_MODE=live needs ANTHROPIC_API_KEY`, `EMAIL_TRANSPORT=smtp needs SMTP_URL in production`).

## 6. iPhone app (standalone Release, free Apple account)

The Release build embeds the JS bundle and points at `https://dialed.okoro.me`, so it runs with no Metro, no Mac and
works on cellular. `apps/mobile/app.config.ts` uses `DIALED_API_URL` if set, otherwise **Release → dialed.okoro.me,
Debug → localhost** (Xcode passes `CONFIGURATION` to the build phase, so this holds for Xcode-GUI builds too).

- Check it builds (no account needed): `./scripts/ios_release simulator` — verifies `main.jsbundle` is embedded and
  the baked-in `apiBaseUrl`.
- Install on the iPhone: plug it in (or same Wi-Fi with pairing), Developer Mode on, then either
  `./scripts/ios_release device`, or in Xcode: open `apps/mobile/ios/Dialed.xcworkspace` → target **Dialed** and
  **DialedWidgets** → Signing & Capabilities → Team = *your Personal Team* → Product → Scheme → Edit Scheme → Run →
  Build Configuration **Release** → pick the iPhone → Run. First launch: Settings → General → VPN & Device
  Management → trust your developer certificate.
- **7-day profile:** a free account's provisioning profile expires after 7 days and the app stops opening (your
  data stays on the phone and on the server). Renew by connecting the iPhone and pressing Run again in Xcode (or
  re-running `./scripts/ios_release device`); no reinstall or sign-in needed. Free accounts allow 3 sideloaded apps.
- Push, Live Activity pushes and Sign in with Apple need the paid program (`APPLE_TEAM_TIER=personal`, D-39);
  local reminders and widgets work without it. If Xcode refuses the App Group on a Personal Team, that is the
  open D-77 question (`APPLE_TEAM_ID`), not a server problem.

## 7. Go-live sequence

1. Test account for smoke testing (the repo's dev password never works in production):
   ```bash
   docker compose run --rm api node dist/test-owner.js create
   ```
   Note the password it prints once. The test owner gets the seed routine, moved so its Fall term covers today.
2. On the phone, **Wi-Fi off**: sign in as `owner@dialed.test`. Check: schedule loads, edit a block, run a live AI
   plan and Approve it, airplane mode → edit → back online → it syncs.
   Optional, while the test owner exists: measure plan quality on the seed routine with the server's key
   (each request 3 times; prints turns, rules broken and whether the repeats made the same plan; a few cents):
   ```bash
   docker compose run --rm api node dist/plan-compare.js claude-sonnet-5-5 --repeat=3
   ```
   Add more models to compare them (e.g. `claude-haiku-5-5 claude-sonnet-5-5`). Earlier runs' turns are in the
   `plan.run` log lines (`docker compose logs api | grep plan.run`).
3. Invite yourself:
   ```bash
   docker compose run --rm api node dist/invite.js <your-real-email>
   ```
4. Sign out, sign up fresh with your real email (email code → verify → first-week setup → build your real routine).
5. Remove the test account and everything it made:
   ```bash
   docker compose run --rm api node dist/test-owner.js delete
   ```
6. Start using it. Invite friends one at a time with `dist/invite.js` (idempotent; it says if the address is
   already invited or registered).

## 8. Backups

- Nightly `pg_dump -Fc` to `$BACKUP_DIR/dialed-YYYY-MM-DD.dump` (first one 2 minutes after start), 14 days kept.
  Check: `ls -lh /mnt/backup/dialed`; `docker inspect -f '{{.State.Health.Status}}' dialed-backup` turns
  unhealthy if no dump is newer than 26 h.
- **Before any prod change** that touches the database:
  ```bash
  docker exec dialed-db pg_dump -U dialed -d dialed -Fc > ~/dialed-$(date +%F).dump
  ```
- **Restore** (replaces the current data):
  ```bash
  cd /opt/docker-homelab/sites/dialed
  docker compose stop api worker
  docker exec -i dialed-db pg_restore -U dialed -d dialed --clean --if-exists --no-owner < /mnt/backup/dialed/dialed-2026-11-11.dump
  docker compose start api worker
  ```
- Never `docker system prune -a` or anything with `--volumes`: the data lives in volume `dialed-pgdata`.

## 9. Updating

- Normal: push to `main` → GitHub Actions deploys (rsync, `.env` from secrets, `docker compose up -d --build`).
- By hand on the host: `git pull` (or rsync), then `docker compose --profile prod up -d --build`.
- **Change the AI model:** GitHub → Settings → Secrets and variables → Actions → Variables → set
  `PLAN_MODEL_ANTHROPIC`, then Actions → Deploy → Run workflow (or re-run the last Deploy). Editing `.env` on the
  host doesn't stick: every deploy rewrites it from secrets and variables. The `plan.run` log line names the model.
  To compare models first, run `./scripts/plan_compare claude-haiku-5-5 claude-sonnet-5-5` locally.
- Migrations run automatically: `dialed-migrate` applies new `backend/migrations` files before api/worker start;
  a failed migration leaves the old containers running. Edit infra in the repo, never in `sites/dialed/` (the
  next rsync `--delete` replaces it).

## 10. Monitoring

Uptime Kuma → Add monitor: HTTP(s), URL **`https://dialed.okoro.me/healthz`** (the bare host has no page),
interval 60 s, certificate expiry notification on (14/7 days), notification **Osiris Alerts** (Telegram), add it to
the `status.okoro.me` page.

## 11. Troubleshooting

```bash
docker logs --tail 100 dialed-api      # also dialed-worker, dialed-db, dialed-backup, dialed-migrate
docker compose ps
docker exec nginx-proxy wget -qO- http://dialed-api:8080/healthz
```

| Symptom | Fix |
|---|---|
| `dialed-api` restarting, log names a key | Fill it in `.env` (and the GitHub secret), `docker compose up -d` |
| `dialed-api` can't read the JWT key (EACCES) | `chown 1000:1000 .secrets/jwt-ed25519.pem && chmod 600 .secrets/jwt-ed25519.pem` |
| 502 from Cloudflare, api healthy | nginx conf not loaded: `docker exec nginx-proxy nginx -T \| grep dialed.okoro.me`; copy it again and reload |
| Every site down, nginx-proxy log `host not found in upstream` | a conf without the resolver form points at a missing container; fix it, then `cd /opt/docker-homelab && docker compose up -d --force-recreate nginx` |
| 502/1033 right after a host reboot | cloudflared started before nginx-proxy; wait a minute or `docker restart cloudflared` |
| Works from LAN, not from outside | tunnel hostname points at a container instead of `nginx-proxy:80` |
| Sign-up code never arrives | `docker logs dialed-api \| grep -i smtp`; Resend dashboard → Logs; domain still Unverified? |
| Healthcheck always unhealthy | uses `127.0.0.1`, not `localhost` (already so here) |
| Secret with `$` mangled | write `$$` in `.env` |
| Out of disk | `docker builder prune -f`; `pct resize 100 rootfs +20G` from Proxmox |
| Rate limits hit everyone at once | `TRUST_PROXY_IP` wrong: must cover nginx-proxy's address (`172.16.0.0/12`) |
