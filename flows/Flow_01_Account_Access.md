# Flow_01: Account access

## Goal
A new or returning Planner gets into their own Dialed account — or leaves it cleanly. Trigger: app launch without a valid session, or the Account sheet. Success: a valid session on this device (new → Flow 02 setup; returning → Flow 03 Day), or a clean sign-out/deletion with no data left on the device. Boundary: identity only; first-week setup and settings live elsewhere. Neighbours: 02, 03, 09 (Account sheet opens Settings), all flows via `identity-session`.

## References and coverage
REF-001 states: `launch`, `welcome`, `apple`, `signup`, `signup-invalid`, `signup-taken`, `verify`, `signin`, `signin-wrong`, `signin-none`, `forgot`, `forgot-sent`, `account`, `signout`, `deleteacct`. Native: NAT-01 (real Sign in with Apple sheet), NAT-07 (reset link landing). Preserved: copy, layout, motion as prototyped. Changed: the drawn Apple sheet is replaced by Apple's native sheet (`expo-apple-authentication`), which offers Share/Hide My Email itself.

## Entries, sequence, and exits
1. **Launch** (every cold start): splash 1.6 s (0.7 s Reduce Motion) while the app reads the Keychain session and SQLite. Valid session → Day (Flow 03) and refresh in background. No session → Welcome. Splash never waits on network.
2. **Welcome**: lockup, "YOUR WEEK, DIALED IN.", sub copy, buttons: Continue with Apple, Sign up with email, I have an account; legal line with Terms/Privacy links (web view).
3. **Sign up**: name, email, password (Show/Hide, "8 or more characters") → Create account → (invite check) → Verify.
4. **Verify**: "Check your inbox", 6-digit code (one-time-code autofill), auto-submit on 6th digit; Send a new code; Wrong email? Change it (back). Success → session → Flow 02 (C-0102).
5. **Sign in**: Sign in with Apple, "or with email", email, password, Forgot password?, Sign in. Success → Flow 03 (C-0103) or Flow 02 if no routine.
6. **Forgot**: email (carried) → Send reset link → "Sent" stamp → Back to sign in / Send again. Link opens the app (universal link `https://<domain>/reset#token=…`, token in the fragment) on a "New password" page (NAT-07; reuse Sign up field style) → success signs in and revokes other sessions.
7. **Apple**: native sheet → identity token → server `/v1/auth/apple` → `is_new` ? Flow 02 : Flow 03.
8. **Account sheet** (Day avatar): avatar initials, name, email, Signed in with, Routine, Reminders status, Settings (→ Flow 09), Sign out, version line.
9. **Sign out** dialog: "Sign out? Your routines stay in your account. Reminders stop on this phone until you sign back in." → `sessionEnded()` → Welcome + toast "Signed out."
10. **Delete account** (from Settings, Flow 09 hosts the row; this flow owns the action): dialog with Export pointer → re-auth (password field or Apple sheet) → `DELETE /v1/account` → Welcome + toast "Account deleted."
Exits: Flow 02, Flow 03, Flow 09, Welcome.

## States and feedback
| State | Feedback |
|---|---|
| Launch | splash animation; no spinner |
| Busy (any submit) | primary button shows spinner, width kept; inputs stay editable but submit disabled |
| Validation | inline `err` text under the field, `aria-invalid`, focus first invalid, haptic warning: "Add your name." / "That email looks incomplete. Check the @ and the dot." / "Use 8 or more characters." / "Add your password." |
| Email taken | stamp "Already in": "There's already an account for <email>." + Sign in instead (email kept) |
| Invite required | stamp "Invite only": "Dialed is invite-only for now. Ask for an invite with this email." |
| Wrong password | inline under password: "That password doesn't match. Try again, or reset it." |
| No account | stamp "No account": "Nobody has signed up with <email> yet." + Make an account (email kept) |
| Code wrong | inline: "That code doesn't match. Check the newest email from Dialed." field clears, focus |
| Code expired / too many tries | inline: "That code expired. Send a new one." |
| Resend | toast "New code sent to <email>." (cooldown 60 s; button shows "Send again in 0:42") |
| Reset sent | stamp "Sent": "Check <email>. The link opens Dialed on this phone so you can pick a new password." |
| Offline | stamp "Offline": "You're offline. Connect to sign in/make an account/send the link." Primary disabled |
| Rate limited | stamp "Slow down": "Too many tries. Wait a minute and try again." |
| Server error | stamp "Hmm": "Dialed couldn't reach the server. Try again." + Try again |
| Apple cancelled | silent, stay on screen |
| Apple failed | toast "Sign in with Apple didn't finish. Try again or use email." |
| Signed out / deleted | Welcome with toast |

## Interaction surface and transitions
- Launch, Welcome, Sign up, Verify, Sign in, Forgot, New password: **pages** (form-heavy, keyboard, deep-linkable reset). Push transition 320 ms slide/fade; Welcome headline rises.
- Apple: **system sheet** (native).
- Account: **sheet** from avatar (keeps Day context, quick dismiss).
- Sign out, Delete account: **centred dialogs** (destructive, interrupting by design). Default focus on Cancel.
- Haptics: warning on validation/taken/wrong/none; success on verify/sign-in/Apple success; warning on confirming sign out/delete. None on navigation.
- Reduce Motion: splash 0.7 s fade; page transitions fade 120 ms.

## Actions and functions
| Action | Function | Inputs | Validation / auth | Side effects | Idempotency / retry | Output |
|---|---|---|---|---|---|---|
| Create account | `POST /v1/auth/signup` | name ≤80, email, password ≥8 | invite check (SIGNUP_MODE), email unique (409 `email_taken`), rate limit | user (unverified), default categories, revision row, email code | Idempotency-Key; resend returns same 202 | 202 `{pending:true}` |
| Verify code | `POST /v1/auth/verify` | email, code | code hash, ≤5 attempts, 10 min | email_verified_at, session, device row | single-use code | tokens, user, `is_new` |
| Resend | `POST /v1/auth/resend` | email, purpose | 1/min, 5/h | new code, old invalidated | — | 202 |
| Sign in | `POST /v1/auth/login` (+ `/login/check` on 401 to choose wrong vs none copy) | email, password | argon2 verify; rate limits | session | — | tokens |
| Apple | `POST /v1/auth/apple` | identityToken, authorizationCode, nonce, fullName? | JWKS sig, iss, aud, exp, nonce | user + apple_identity (new) or session | sub unique | tokens, `is_new` |
| Forgot | `POST /v1/auth/password/forgot` | email | always 202 (no enumeration) | reset token + email if account exists | — | 202 |
| Reset | `POST /v1/auth/password/reset` | token, password | single-use, 30 min | new hash, revoke all sessions, new session | — | tokens |
| Refresh | `POST /v1/auth/refresh` | refresh | rotation + reuse detection | rotate | — | tokens |
| Sign out | `POST /v1/auth/logout` | — | session | revoke session, clear device tokens | safe to repeat | 204 |
| Delete | `DELETE /v1/account` | re-auth proof (password or Apple identity token ≤5 min) | owner only | soft delete, tombstone email, revoke all sessions/OAuth tokens, Apple revoke job (carries the encrypted refresh token) then **delete the `apple_identities` row** so a later Apple sign-in creates a fresh account, purge job at +30 d | repeat → 204 | 204 |

Client functions: `auth.signUp`, `auth.verify`, `auth.signIn`, `auth.apple`, `auth.forgot`, `auth.reset`, `session.restore`, `session.end(reason)` (global `sessionEnded()`).

## Data and integrations
- Persistent data: yes
- Server: `users`, `email_codes`, `sessions`, `apple_identities`, `invites`, `devices`, `audit_log`. Device: Keychain (`refresh`, `access`), SQLite cleared on session end.
- External: SMTP (codes, reset links), Apple ID (token verify + revoke), universal links (`apple-app-site-association` served by API).
- Env: `SIGNUP_MODE`, `JWT_*`, `CODE_PEPPER`, `APPLE_*`, `SMTP_URL`, `EMAIL_FROM`, `EMAIL_TRANSPORT`.
- Retention: on deletion the email is tombstoned immediately (address can sign up again); the account is purged at +30 days (rows cascade); audit rows keep anonymous counts only (user_id nulled).

## Security and abuse cases
Credential stuffing (rate limits per IP + email, argon2 cost); code brute force (5 attempts, 10 min, 1e6 space); enumeration (forgot always 202; login/check rate-limited — see SECURITY); refresh token theft (rotation + family revoke); Apple token replay (nonce, exp); deleted account login (status check → `no_account`); reset link replay (single use); session fixation (new session id on every sign-in); invite bypass (server-side check, not UI). Re-auth required for delete.

## Accessibility
All fields labelled; errors linked via `accessibilityDescribedBy`; code field announces "Code, 6 digits"; VoiceOver focus moves to first error/stamp; Dynamic Type to AX1 without clipping (Anton heading auto-fits); 44 pt targets; Show/Hide toggles announce state; Apple button uses the system component (meets HIG).

## Platform behavior
Free Apple account (D-39): Sign in with Apple hidden; reset email links go through the `api.okoro.me/reset` redirect page to `dialed://reset#token=…` (BACKEND_SETUP §13).
iOS: `textContentType` (`name`, `emailAddress`, `newPassword`/`password`, `oneTimeCode`), password AutoFill + strong password suggestions, keyboard return key submits, Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Apple sign-in only shows on devices (simulator supports with signed-in Apple ID). Universal links require Associated Domains entitlement.

## Contracts
`identity-session`, `error-taxonomy`, `observability`, C-0102, C-0103, C-01x.

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| Launch routes by session | `app/_layout.tsx` `useSessionGate` | `session-gate.test.tsx` | Simulator cold start ×2 (with/without session) | evidence/flows/Flow_01/launch.mp4 | not started |
| Sign up → verify → empty Day | `auth.signUp`, `auth.verify`, routes `(auth)/signup`, `(auth)/verify` | api `auth.signup.test.ts`, e2e `signup.e2e.ts` (Maestro) asserts landing on the empty-Day setup chooser (rendered by Flow 03's empty state; its options are wired when Flows 02/05/06 land) | Simulator recording | evidence/flows/Flow_01/signup.mp4 | not started |
| Invalid inputs | `SignupForm.validate` | unit | screenshot `signup-invalid` | …/signup-invalid.png | not started |
| Email taken / invite / none / wrong | api handlers + `AuthNotices` | api tests per code | screenshots | …/notices/*.png | not started |
| Code wrong/expired/resend cooldown | `VerifyScreen` | unit + api | recording | …/verify-errors.mp4 | not started |
| Forgot + reset link | `password.forgot/reset`, link handler | api + e2e: dev builds also register `dialed://reset#token=…`, opened via `xcrun simctl openurl` (the https universal link needs the real domain + AASA — unverified until CLIENT_QUESTIONS #3) | recording | …/reset.mp4 | not started |
| Apple sign-in | `auth.apple` server verifier | api test with signed fixture JWTs (test JWKS) | physical device — **unverified by design until the owner enrols in the Apple Developer Program** | …/apple.mp4 | not started |
| Refresh rotation + reuse revoke | `sessions` service | api test | — | — | not started |
| Sign out wipes device | `sessionEnded` | integration test (SQLite empty, Keychain cleared, LAs ended) | Simulator | …/signout.mp4 | not started |
| Delete account | `DELETE /v1/account`, purge job | api test incl. Apple revoke mock, purge after clock advance | Simulator | …/delete.mp4 | not started |
| Authorization smoke | `scripts/auth_smoke` | Gate 2 | report JSON | $FLOW_BY_FLOW_REPORT_DIR/authorization.json | not started |

## Open decisions
D-16 (invite-only, ASSUMED), D-18 (SMTP provider, ASSUMED), D-23 (purge window, ASSUMED). Legal pages (Terms/Privacy) needed before external TestFlight — release item, not a build blocker.

## Build seed
Start with Batch 0 auth tables (already in migration 0001), `POST /v1/auth/signup|verify|login|refresh|logout` with `EMAIL_TRANSPORT=console`, then the Expo `(auth)` stack: Welcome → Sign up → Verify → Sign in, storing tokens in SecureStore, then `sessionEnded()`. Apple and reset follow. First failing test: "signup with valid input returns 202 and creates an unverified user with 6 default categories".
