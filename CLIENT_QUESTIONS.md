# Client questions

Everything below has a recommended default that the build uses until you answer. None of them blocks the first vertical slice (sign in → see today). Answer by editing the "Your answer" line or telling Claude Code in chat.

## Decisions that unblock correctness

0a. **Apple Developer Program ($99 USD/yr).**
   Needed for: running on your iPhone with push, Live Activities starting on their own, App Groups for widgets, Sign in with Apple, TestFlight. Recommended: enrol before the build reaches Flow 08 (the native track). Until then, everything else builds and is proven in the Simulator; device rows are reported as unverified.
   Affected flows: 01 (Apple), 08, release. Owner: you. Reversible: n/a (purchase — stop point).
   **Your answer (2026-10-20): free Apple account (Personal Team) for now; paid later.** See BACKEND_SETUP §13 for exactly what works on a free account.

0b. **Approve six small screens that weren't in the prototype.**
   OAuth sign-in/consent page for connecting an AI app, New-password page, "Name your term" sheet, a Quiet switch on Edit category, a "Get told when plans are ready?" ask, and a Disconnect-all dialog. Recommended: Claude prototypes them in the same style (one short round) and you approve. Until then they're built behind a feature flag and reported as "unverified by design", so the rest of the build keeps moving.
   Affected flows: 01, 05, 06, 07, 09. Owner: you. Reversible: yes.
   **Status (2026-10-20): prototyped** in `assets/references/dialed-flow-prototype.html` (v9) → review console group "New screens to approve". Approve or request changes; until then they stay feature-flagged.

1. **Who can create an account at launch?**
   Recommended: invite-only (`SIGNUP_MODE=invite`) with an allowlist of emails. Your server key pays for everyone's AI planning, so open sign-ups could cost money fast. Switch to `open` when you add limits or billing.
   Affected flows: 01, 06, 02. Owner: you. Reversible: yes (env flag).
   Your answer: _(default: invite-only)_

2. **Minimum iOS version.**
   Recommended: iOS 17.2. Below that, the Live Activity can't start on its own at block start (push-to-start). iOS 26 shows the Liquid Glass icon; 17.2–25 show the flat icon.
   Affected flows: 08. Owner: you. Reversible: yes, but lowering it removes automatic Live Activities.
   Your answer: _(default: 17.2)_

3. **Domain for the API and connector.**
   Recommended: `api.<yourdomain>` for the app and `api.<yourdomain>/mcp` for the AI connector, both through the Cloudflare Tunnel. Until you have one: everything runs locally; the https password-reset link and connecting the real Claude app (which needs a public HTTPS address) stay unverified, and dev builds use `dialed://` links instead.
   Affected flows: all networked flows, 07 (connector URL shown in Settings). Owner: you. Reversible: yes, but connected AI apps must reconnect.
   **Your answer (2026-10-20): okoro.me** → API `https://api.okoro.me`, connector `https://api.okoro.me/mcp`, email from `no-reply@okoro.me`. Owner action (stop point for the agent): put okoro.me's DNS on Cloudflare (or add the tunnel CNAME at your registrar) and create the tunnel; add Resend's DNS records for email.

4. **Email sender for verification codes and password resets.**
   Recommended: Resend (free tier is enough), sending from `no-reply@<yourdomain>`. Any SMTP provider works.
   Affected flows: 01. Owner: you. Reversible: yes.
   Your answer: _(default: Resend via SMTP)_

5. **Daily AI limits on the Dialed server key.**
   Recommended: 30 plan runs and 6 timetable imports per person per day, plus a monthly spend alert you set in the provider console. Bring-your-own-key users aren't capped beyond abuse limits.
   Affected flows: 02, 06, 07. Owner: you. Reversible: yes (env).
   Your answer: _(default: 30 / 6)_

6. **Which Claude model runs "Dialed server" planning and timetable reading.**
   Recommended: a current Claude Sonnet-class model for planning and image/PDF reading, set in `PLAN_MODEL_ANTHROPIC`. Haiku-class is cheaper but weaker at multi-change plans.
   Affected flows: 02, 06. Owner: you. Reversible: yes (env).
   Your answer: _(default: Sonnet-class)_

7. **The app's final name and bundle ID.**
   Recommended: keep "Dialed" as the working name; decide before buying the domain and enrolling the Apple bundle ID, because the bundle ID can't change after App Store submission.
   Affected flows: all copy, 08 (App Group ID), 07 (connector name). Owner: you. Reversible: until first TestFlight upload.
   **Your answer (2026-10-21): bundle ID `me.okoro.dialed`** (App Group `group.me.okoro.dialed`). Name stays "Dialed" for now.

## Confirm or correct

These are already decided as reversible defaults (see `00_Brief_Analysis.md` decision register):

- Your own AI key stays in the iPhone Keychain and is sent with each plan request, never saved on the server (D-13). The prototype's "sent only to OpenAI" line is corrected to say this.
- iOS decides where widgets go; the app's Customize sheet sets Live Activity + line vs Line only and shows how to add widgets (D-14).
- An offline edit that conflicts with a newer change on another device is not applied; you get a notice with Reapply (D-15).
- Uploaded timetables are deleted right after reading (D-19). No analytics SDKs (D-20).
- Notification defaults: heads-up off, meal notes off, plan notifications on, max 6 a day, quiet 12 am–9 am (D-24).
- Deleted accounts are purged within 30 days (D-23).
- Calendar import shows every event in the normal Review screen before anything is added (D-36).
- Day bounds and quiet hours are soft checks; your seed starts your day at 7:30 am (D-37).

## Deferred or discoverable

- Privacy policy and terms text: needed before TestFlight external testing and App Store. Not a build blocker; drafted at release time.
- Android, iPad, Apple Watch: out of scope for v1.
- Payments/subscriptions: out of scope until open sign-ups.
- Exact Expo SDK and package versions: discovered at scaffold time (latest stable), recorded in `BACKEND_SETUP.md` §Versions by the build agent.
