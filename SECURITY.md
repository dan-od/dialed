# Security model (pass 1)

Pass 2 runs per flow during build (attack the implemented flow). Pass 3 is a fresh adversarial review of the full diff before release.

## Trust boundaries
1. **iPhone app ↔ API** over HTTPS through Cloudflare Tunnel. The app is untrusted input. Every rule is enforced server-side.
2. **Widget/Live Activity extension ↔ app** via App Group container (read-only snapshot for the extension; no tokens in the App Group).
3. **API ↔ Postgres** on the Docker internal network only. Postgres has no published port in production.
4. **API ↔ AI providers** (Anthropic, OpenAI, Google, user-supplied OpenAI-compatible URL). Provider output is untrusted: it only ever becomes a validated draft.
5. **External AI apps ↔ MCP `/mcp`** with OAuth tokens. The AI app is untrusted and may be prompt-injected by content the Planner pastes into it.
6. **API ↔ APNs**, **API ↔ SMTP**, **API ↔ Apple ID** (token verification and revocation).
7. **Operator ↔ home lab** (SSH, Docker). Out of app scope; admin endpoints never routed through the tunnel by default.

## Data classification
| Class | Examples | Handling |
|---|---|---|
| Secret | JWT signing key, APNs .p8, Apple client secret key, SMTP creds, server AI key, OAuth token hashes, Apple refresh token, BYO AI keys | Env/secret files only; never logged; BYO keys never persisted server-side (Keychain on device, `X-Provider-Key` per request) |
| Personal | email, name, schedule, routines, plans and request text, time zone, device tokens | Postgres; TLS in transit; exported on request; purged on deletion within 30 days; request text not logged (length only) |
| Transient personal | uploaded timetables | 0600 temp file, deleted after parse, hard limit 1 hour (sweeper) |
| Operational | metrics, redacted logs, audit log | 30-day log retention; audit log kept with the account; on purge `user_id` is nulled and `meta_json` stripped so only anonymous counts remain |

## Authentication
- Passwords: argon2id (m=64 MiB, t=3, p=1), min 8 chars, checked against a small common-password list; no max below 128.
- Email verification: 6-digit code, 10-minute expiry, hashed (SHA-256 with server pepper), 5 attempts then invalid (check `attempts < 5` before incrementing; the 6th try returns `code_invalid` and consumes the code — never a 500), resend limited to 1/min and 5/hour per email.
- Login: generic `bad_credentials` on wrong password; `/v1/auth/login/check` (for the "No account for that email" state) is rate-limited 5/min/IP and 20/hour/email to limit enumeration. ASSUMED acceptable for an invite-only beta; revisit before open sign-ups.
- Password reset: single-use token (32 bytes, hashed), 30-minute expiry, sent as a URL **fragment** (`/reset#token=…`) so it never reaches server or Cloudflare logs; the link opens the app via universal link; reset revokes all sessions. Logs never include query strings.
- Sign in with Apple: verify identity token signature against Apple JWKS, `iss`, `aud` = bundle ID, `exp`, and nonce (SHA-256 of a client nonce). Store `sub`. On delete, revoke via Apple's revoke endpoint.
- Sessions: access JWT (EdDSA, 15 min, claims `sub`, `sid`, `scope:app`), refresh token 32 random bytes (hashed in DB), 60-day sliding, rotated on every use; reuse of a rotated token revokes the whole family. Stored in iOS Keychain (`expo-secure-store`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`), excluded from backups.
- MCP OAuth: authorization code + PKCE (S256 only), exact redirect URI match, codes single-use 60s, access 1h, refresh 30d rotating, consent screen names the client, tokens revocable from Settings, scope `schedule:read plans:draft` only. Audience-bound to `/mcp`; app access tokens are not accepted at `/mcp` and MCP tokens are not accepted by the app API.

## Authorization matrix
Every query is scoped by `user_id` from the token (`WHERE user_id = $auth`), enforced in one repository layer, not in route handlers. Upserts are `INSERT … ON CONFLICT (id) DO UPDATE … WHERE <table>.user_id = $auth` and a zero-row result is reported as `not_found`; composite `(id, user_id)` foreign keys make cross-user references impossible at the database level. Object IDs from clients are always re-checked for ownership. Cross-user access returns 404 (not 403) to avoid existence leaks.

| Actor | Action | Allowed |
|---|---|---|
| Unauthenticated | health, auth endpoints, OAuth metadata/authorize page | yes (rate-limited) |
| Unauthenticated | anything else | 401 |
| Planner (app token) | read/write own categories, terms, routines, blocks, overrides, profile, devices | yes |
| Planner | read/approve/discard own plans | yes |
| Planner | another user's anything | 404 |
| Planner | delete own account (re-auth within 5 min) | yes |
| External AI (MCP token) | read own schedule, categories, terms, recent plans (summaries) | yes |
| External AI | create/revise drafts (`propose_changes`) | yes, rate-limited |
| External AI | approve, discard, edit routines, change settings, read account/email, delete | never (no such tools) |
| In-app AI engine | same as External AI, in-process | yes |
| Worker | send pushes, purge, sweep | system only |
| Operator | `/admin/*` (job queue, usage) | `ADMIN_TOKEN`, internal network only |

## Input and file validation
- All bodies Zod-validated; unknown fields rejected; strings length-capped (titles 80, names 40, request 4000).
- Times on a 5-minute grid within 0–1440; dates ISO; IANA time zone allowlist.
- Uploads: max 15 MB, allowlist by sniffed magic bytes (JPEG, PNG, HEIC, PDF, DOCX), never by extension; DOCX parsed with entity expansion disabled (mammoth uses a safe XML parser); PDF parsed with JS disabled; image decode in a worker with size limit (max 40 MP).
- OpenAI-compatible base URL: `https://` only; DNS resolved once and the connection **pinned to that IP** (prevents DNS rebinding); private/link-local/loopback ranges blocked unless `ALLOW_PRIVATE_PROVIDER_URLS=true`; no redirects followed; 60s timeout.

## AI-specific threats
- **Prompt injection via timetable/file/pasted text or external chat**: model output is data. It can only produce a draft; the validator enforces every hard rule; Approve is the only write. Tools never return other users' data. Drafts show source ("From Claude chat").
- **Over-reach**: protected categories (`protected = true`, Class by default) cannot be moved/removed unless the request names them (validator).
- **Data exfiltration through tools**: tools return only the authenticated user's schedule; no email, tokens, or device data.
- **Cost abuse**: per-user daily caps on server key, per-plan token ceiling, 90s wall clock, max 8 tool turns, max 3 correction rounds, max 25 changes.
- **Key leakage**: BYO key only in header for that request; redacted from logs, errors and traces; never echoed back.

## Abuse, rate limits, replay, idempotency, concurrency
- Client IP for limits = `CF-Connecting-IP`, trusted only from the cloudflared container (see BACKEND_SETUP §11); never raw `X-Forwarded-For`.
- Global: 120 req/min/user, 30 req/min/IP unauthenticated. Auth endpoints stricter (above). Plans: 10/min/user. MCP: 60 calls/min/token, 20 drafts/day/client.
- Sync push idempotent by `client_mutation_id` (receipts 30 days). Approve idempotent by plan state (approved plan returns 200 with same result). Double-tap Approve guarded client-side and by row lock (`SELECT … FOR UPDATE` on plan).
- Optimistic concurrency with `version` on every mutable row; plan approval checks `base_revision` for touched entities inside one transaction.
- Jobs use leases + `dedupe_key`; Live Activity start/end jobs deduped per (device, block, date).

## Secrets and logging
- `.env` on the home lab with 0600; Docker secrets for `.p8` and keys. Rotation: JWT key supports two active keys (`kid`). 
- pino redaction list in `BACKEND_SETUP.md §11`. No request bodies logged. Error responses never include stack traces.

## Destructive actions and recovery
- Delete category: reassign or delete blocks explicitly (dialog). Delete block: Undo toast (client keeps snapshot; server soft-deletes, `deleted_at`). Discard plan: confirm dialog. Delete account: re-auth + confirm dialog, soft delete then purge after 30 days; export offered first.
- Backups nightly with weekly restore test. No hard deletes outside the purge job.

## Category-specific threats likely after launch
- Account takeover via email (mitigate: verified email required, code attempts, session list later).
- Enumeration via login/check (mitigate: rate limits; switch to generic copy if sign-ups open).
- Malicious MCP client registration (mitigate: consent screen, pushes and Settings rows show the client name **with its redirect host** (e.g. “Claude · claude.ai”); revocation; per-client limits). `DELETE /v1/connector/:clientId` revokes only the caller's tokens for that client (`oauth_clients` are global, tokens are per user).
- Deleted accounts: the email is tombstoned at deletion so the address can sign up again immediately; the old account is purged at +30 days.
- Push token theft is low impact (content minimal: titles and times only; no notes).
- Lock-screen privacy: schedule titles show on the lock screen by design; a "Hide titles on lock screen" setting is a post-v1 candidate (ASSUMED not in v1).

## Platform controls
iOS: ATS on (no arbitrary loads), Keychain for tokens/keys, App Group holds no secrets, universal links validated via `apple-app-site-association`, deep links (`dialed://`) parse an allowlist of routes only, backups exclude Keychain items. API: HTTPS only (Cloudflare), HSTS, strict CORS (no browser origins except the OAuth pages on the same origin), CSRF tokens on the OAuth consent form, secure same-site cookies only on OAuth pages.
