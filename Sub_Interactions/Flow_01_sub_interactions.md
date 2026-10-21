# Flow_01 interaction sweep
## Interaction map
Launch splash (non-interactive) → Welcome: Apple button, Sign up, I have an account, Terms link, Privacy link. Sign up: name, email, password, Show/Hide, Create account, Apple, back. Verify: code field (auto-submit), Send a new code (cooldown), Wrong email? (back). Sign in: Apple, email, password, Show/Hide, Forgot password?, Sign in, back, stamp actions (Make an account). Forgot: email, Send reset link, Back to sign in, Send again. Account sheet: close, Settings, Sign out. Dialogs: Cancel/Sign out; Cancel/Delete account.
## Surface decisions
Pages for every form (keyboard, deep-linkable reset, back stack). Account as sheet (context of Day kept, quick dismiss). Sign out/Delete as dialogs because they end the session; default focus Cancel. Apple uses the system sheet (required by HIG).
## Spawned surfaces
Terms/Privacy → in-app browser (SFSafariViewController). Reset link → app page "New password" (NAT-07). Re-auth for delete → password sheet or Apple sheet.
## Hidden states
Session restore while offline (cached Day, refresh deferred); refresh token revoked elsewhere (forced to Welcome with toast "You were signed out. Sign in again."); verify screen reopened after app kill (resume with stored pending email); invite-only rejection; account soft-deleted (sign-in → "No account" copy).
## Edge cases
Double-tap Create account (button disabled + Idempotency-Key); paste code with spaces/dashes (strip non-digits); code autofill from Mail; email with trailing spaces/case (trim, citext); Apple Hide My Email relay addresses; Apple returns no name on second sign-in (keep stored name); user signs up with email then later uses Apple with same email (link only if Apple email is verified and matches — ASSUMED, else separate account warning); clock skew on device (server time authoritative); reset link opened on another device (web fallback page "Open this link on your iPhone").
## Micro-interactions
Show/Hide toggles keep cursor position; resend shows countdown "Send again in 0:42"; code field shows 6 boxes with caret; stamps tilt −2°.
## Motion and interruption
Splash: knob indicator −170°→0 (1 s, overshoot), wordmark rise at 750 ms; skipping not needed (≤1.6 s); backgrounding during splash resumes routing on return. Page push 320 ms; interrupted submit (app backgrounded) completes server-side; on return the screen reflects the result (verify → signed in).
## Feedback and semantic haptics
Warning: validation, taken, wrong, none, code wrong. Success: verified, signed in, Apple success. Warning on confirming Sign out / Delete. None for navigation.
## Gaps found
Reset web fallback page and "New password" page are not prototyped: D-35 — prototype + owner approval before production UI; until then their rows are unverified by design. Apple+email account linking rule ASSUMED (above).
