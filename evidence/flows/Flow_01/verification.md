# Flow 01 — verification (first vertical slice: email path)

Device: iPhone 17e Simulator (390×844 pt @3x), iOS 27.0, dev client built with Xcode 27.1. API on the Mac, local adapters
(EMAIL_TRANSPORT=console). E2E: `API_LOG=… ./scripts/e2e_ios` (Maestro 2.11). Screens: `screens/`.

| Requirement | Implementation | Automated | Runtime (Simulator) | Status |
|---|---|---|---|---|
| Launch routes by session | `src/app/index.tsx`, `_layout.tsx` (Stack.Protected), `AppProvider` (Keychain + SQLite, no network wait) | — | relaunches in every e2e flow | passed (no component test yet) |
| Sign up → verify → empty Day | `(auth)/signup`, `(auth)/verify`, `POST /v1/auth/signup|verify` | api `auth.signup.test.ts` (build-seed test), `auth.flow.test.ts`; Maestro `signup_until_verify` + `verify_code` | welcome.png → signup.png → verify.png → setup.png | passed |
| Invalid inputs | `auth/validate.ts` | jest `validate.test.ts` | signup-invalid.png (errors inline, focus on first) | passed |
| Email taken / invite / none / wrong | api handlers + `AuthNotices` | api tests per code | signin-wrong.png; taken/invite/none notices not screenshotted | partial — runtime screenshots for taken/invite/none missing |
| Code wrong / expired / resend cooldown | `(auth)/verify` | api tests (wrong ×5 → 6th consumes, expired, 1/min) | verify-wrong.png, verify-expired.png (real 10-min expiry) | passed (cooldown label not screenshotted) |
| Forgot + reset link | `(auth)/forgot`, `/v1/auth/password/forgot|reset`, `GET /reset` redirect page | api test (single use, revokes sessions) | forgot screen not run on device; New-password page is D-35 → behind `d35Screens` flag | unverified — D-35 approval pending; https link needs DNS (CLIENT_QUESTIONS #3) |
| Apple sign-in | hidden (D-39 Personal Team) | — | — | unverified by design (Apple Developer Program) |
| Refresh rotation + reuse revoke | `AuthService.refresh` | api test | — | passed (automated) |
| Sign out wipes device | `AppProvider.sessionEnded`, `/v1/auth/logout` | api test (logout revokes) | account.png → signout.png → signed-out.png; app SQLite tables all 0 rows after; server: 0 active sessions | passed |
| Delete account | — | — | — | not started (outside this session's scope) |
| Authorization smoke | `scripts/auth_smoke` | Gate 2 | `evidence/verification/authorization.json` | PASS / UNVERIFIED (see gate2.md) |

## Fidelity deltas vs prototype v9
- "Continue with Apple" / "Sign in with Apple" / "or with email" hidden (D-39). Welcome therefore has two buttons.
- Prototype-only strings dropped: "Type any 6 digits in this prototype.", "Prototype: open the email link", "Dialed 1.0 (prototype)" → "Dialed 0.1.0".
- Forgot sub copy: "It works for an hour" → "It works for 30 minutes" (SECURITY.md sets a 30-minute expiry; the security doc outranks the prototype).
- Verify resend shows "Send again in 0:42" during the 60 s cooldown (Flow 01 states table); the prototype draws only "Send a new code".
- Sign-up email-taken stamp etc. use the server's email in copy, as specified.
- Account sheet uses the native iOS form sheet (Design_Identity platform delta) instead of the drawn sheet.
- Screens enter with the prototype's 18 pt slide + fade (320 ms); the native back swipe is off for now (custom transition).

## E2E notes
- Maestro cannot type into a hidden secure field on the iOS 27 Simulator; flows tap "Show" first (a real user option).
- Fields are driven with the return key (name → email → password → submit), as Flow 01 specifies.
- iOS "Save Password?" (system UI) is dismissed by position after sign-in.
- Maestro 2.11's driver sometimes drops mid-run on iOS 27; `scripts/e2e_ios` retries a flow up to 3 times (final run: every flow passed first try).
