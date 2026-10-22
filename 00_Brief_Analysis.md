# Brief analysis

- North star: A busy student-builder glances at their phone and knows exactly what they should be doing now and next, and changes their week by describing it in plain words, approving a draft in one tap.
- Paradigm: mobile (iOS app) with an api backend (REST sync API + MCP server). Android later from the same Expo codebase.
- Target platforms: iOS 17.2+ iPhone (primary). iOS 26 for the Liquid Glass icon; older iOS shows the flattened icon. iPad and Android out of scope for v1.
- Persistent data: yes
- Sensitive categories: personal schedule and routine data; account credentials (email, password hash, Apple identity); third-party AI API keys (user-supplied, never stored server-side); uploaded timetable files (transient).
- Proof environment: local (Docker Compose backend + iOS Simulator), then the user's home-lab preview behind Cloudflare Tunnel, then a physical iPhone for Live Activity, widgets, haptics and push. Simulator and browser evidence never proves native haptics, Live Activity push-to-start, or APNs delivery.
- Working name: **Dialed**. The name may change before launch (crowded on the App Store). Every user-facing occurrence reads from one `APP_NAME` constant; bundle ID is a placeholder until decided.

## Actors and measurable goals

| Actor | Measurable goal |
|---|---|
| Planner (the person using Dialed; first user is the product owner, a CS student juggling classes, gym and 4 side projects) | Knows what's now and next without opening the app; keeps a weekly routine that matches reality; changes it in under a minute by describing it |
| New user | Gets from install to a first working week (classes in) in under 5 minutes |
| External AI assistant (Claude, ChatGPT, Gemini, Cursor, or any MCP client) acting for the Planner | Reads the Planner's real schedule and submits a valid draft plan that the Planner can approve |
| In-app AI planner (server-side engine on the chosen provider) | Turns a request, photo or file into a valid draft plan |
| Scheduler (server worker + on-device scheduler) | Starts/updates/ends Live Activities, delivers plan notifications, keeps widgets current |
| Operator (the product owner running the home lab) | Keeps the backend healthy, backed up and within AI cost limits |

## Scope and non-goals

In scope (v1):
- Account: email + password with 6-digit email verification, Sign in with Apple, forgot password, sign out, delete account, export data.
- First-week setup: timetable from camera photo, Photos screenshot, PDF or Word (.docx); describe your week; Apple Calendar import (read-only); build it yourself.
- Day view (now/next hero, day bars, rest of today), Week (Lanes default, Cards detail), Month (poster + weeks list).
- Add a block, edit one block (this occurrence vs every week), move to another day, skip, delete, undo.
- Routines per term, routine editor, copy a day, save with effective date, one-off changes; terms and dates.
- Plan it: describe (type/dictate), drafting, clarifying question, review with per-change switches, reply to revise, stale detection, approve/discard, recent plans, error and retry.
- Plan from any MCP-capable AI app through the Dialed connector; drafts arrive as a notification and use the same review.
- AI assistant settings: Dialed server (Claude) or bring your own key (Claude, OpenAI, Gemini, OpenAI-compatible URL).
- Lock screen: Live Activity for work blocks; inline line under the date; lock widgets (Countdown, Day ring, Up next, Today, This week); Line-only mode.
- Home widgets: Now (S), Up next (S), Rundown (M, Today or This week), Today timeline (L). Dynamic Island compact/minimal.
- Notifications: optional heads-up before work blocks (default off), optional meal/break note (default off), plan ready, draft from chat; daily cap; quiet hours.
- Categories: unlimited, grouped; create, rename, recolour, regroup, merge, delete with reassignment.
- Theme: follow system / light / dark. Reduce motion respected.
- Offline-first: everything readable offline; edits queue and sync.

Non-goals (v1): shared calendars or multiple users per schedule; writing to Apple/Google calendars; Android build; iPad layout; Apple Watch; payments or subscriptions; public sign-ups (invite-only beta, see D-16); third-party analytics; AI acting without approval.

## Signature moments

1. **The glance.** Lock screen during a work block shows a Live Activity with the countdown and what's next; during a meal the line under the date reads "Dinner · 45m left, then Sermon Sync". No unlock needed.
2. **Describe → approve.** "Bible study with Chichi every Wednesday at 7 for the rest of the year" becomes three switchable changes; one Approve tap updates the routine through Dec 31.

## Supplied materials

| Path | Role |
|---|---|
| `assets/references/dialed-flow-prototype.html` | Approved interactive prototype (v8): every screen, state, transition, motion and haptic note, plus a review console. Open in a browser. UI source of truth. |
| `assets/references/class-schedule-fall-2026.png` | The owner's real Fall 2026 class schedule (seed data and import test fixture). |
| `assets/references/planning-guide-draft.md` | Draft planning guide served to every AI (to be productised in `mcp/planning-guide.md`). |
| `assets/references/mcp-server-sketch.ts` | Unrun sketch of the MCP server shape. Behavioral evidence only. |
| `assets/references/first-schedule.html` | First static schedule (superseded; content only). |
| `assets/brand/*` | Logo masters (SVG), lockups, iOS icon set, Icon Composer layers, Liquid Glass mockup, AI mark paths, full logo kit zip. |
| Design canvas artifact "Schedule App — Day View Options" (claude.ai artifact WSWoK2XkP8UDFJDpxErVTE) | Earlier design boards (directional; prototype supersedes). |
| Logo Lab canvas (claude.ai artifact 3fi4y6P5ph4hzBihyev9GA) | Logo explorations + Liquid Glass board (directional). |

## Constraints

- Builder: Claude Code on the owner's Mac (Xcode installed). iOS builds need Xcode; Live Activities and widgets need an Expo **development build** (not Expo Go) and a native WidgetKit extension target.
- Free Apple account (Personal Team) for now (D-39): installs from Xcode, re-sign every 7 days, up to 3 test devices and 10 App IDs, no TestFlight. Paid program ($99 USD/yr) later unlocks push, Sign in with Apple, universal links and TestFlight.
- Backend runs on the owner's home lab (Docker) behind Cloudflare Tunnel on the owner's domain. No cloud spend beyond AI usage and email.
- AI cost: Dialed-server key is the owner's; per-user daily caps required.
- Accessibility: Dynamic Type, VoiceOver, Reduce Motion, 44pt targets, WCAG AA contrast.
- Build prompt budget: `BUILD_PROMPT.txt` ≤ 60 lines, ≤ 4000 characters. Actual: 35 lines, 2345 characters (see §Build prompt budget).

## Decision register

| ID | Decision | Status | Owner | Affected flows |
|---|---|---|---|---|
| D-01 | Native iOS first with Expo SDK (current stable at build time) + React Native + TypeScript, dev build, Expo Router. Android later from same codebase. | LOCKED | Owner | all |
| D-02 | Backend: Node.js 22 LTS + TypeScript + Fastify + Zod, PostgreSQL 16, Drizzle ORM with committed SQL migrations, Docker Compose on the home lab, public via Cloudflare Tunnel. | LOCKED | Owner | all |
| D-03 | Offline-first: on-device SQLite (expo-sqlite) is the read model; mutations go to a local outbox and sync to the server (see BACKEND_SETUP §Sync). | LOCKED | Owner | 03, 04, 05, 08, 09 |
| D-04 | Sign-in: Sign in with Apple + email/password with 6-digit email verification code; forgot password by email link. | LOCKED | Owner | 01 |
| D-05 | AI is provider-agnostic: Dialed server key (Claude) by default; bring-your-own Claude, OpenAI, Gemini or OpenAI-compatible server. Any MCP-capable assistant can plan through the connector. App swaps in the chosen AI's name in copy. | LOCKED | Owner | 02, 06, 07 |
| D-06 | Nothing changes the schedule without the Planner's Approve tap. No AI path (in-app or MCP) writes schedule data. | LOCKED | Owner | 02, 06, 07 |
| D-07 | Lock screen: Live Activity only for work blocks (any block whose category is not marked `quiet`; Meal and Break are quiet by default, see CONTEXT "Quiet block"). Quiet blocks and gaps show in the inline line under the date. Meal/break notification is opt-in, default off. "Line only" mode disables Live Activities. | LOCKED | Owner | 08, 09 |
| D-08 | Widgets: lock (Countdown, Day ring, Up next, Today, This week) + inline line; home (Now S, Up next S, Rundown M with Today/This week option, Today timeline L). Every widget always shows relevant content (Now falls back to Up next). | LOCKED | Owner | 08 |
| D-09 | Prototype v8 (`dialed-flow-prototype.html`) is the approved UI/UX source. Evidence: owner, 2026-10-20 12:31 "we good for first iteration", then directed the PRD. Any production UI that departs from it needs a new prototype approval. | APPROVED | Owner | all human-facing |
| D-10 | Brand: Dialed d-knob mark, Anton (display) + SF Pro via system font (UI), palette in Design_Identity, AI dial mark, knob loader. | APPROVED | Owner | all human-facing |
| D-11 | `APP_NAME` single constant; bundle ID `me.okoro.dialed`; App Group `group.me.okoro.dialed`. | LOCKED (owner, 2026-10-21: bundle ID) | Owner | all |
| D-12 | Minimum iOS 17.2 (Live Activity push-to-start). | ASSUMED | Owner | 08 |
| D-13 | Bring-your-own key is stored in the iOS Keychain and sent over TLS with each plan request; the server uses it in memory for that request only, never stores or logs it. Prototype copy "sent only to <vendor>" is corrected to "Sent with each plan request. Never saved on the Dialed server." | ASSUMED | Owner | 06 |
| D-14 | iOS owns widget placement. The prototype's in-app "Customize" lock sheet ships as: lock-screen mode (Live Activity + line / Line only), the line toggle, and a visual guide to adding Dialed widgets in the iOS lock-screen and home-screen editors. Widget slot rules are iOS's. Rundown's Today/This week choice and "meals and breaks" are real WidgetKit configuration intents. | ASSUMED | Owner | 08 |
| D-15 | Sync conflicts: per-row `version`; a stale offline edit is rejected, the client refetches and shows "Changed on another device. Your edit wasn't applied." with Reapply. Plan approval checks `base_revision` (stale plan). | ASSUMED | Owner | 03, 04, 05, 06 |
| D-16 | Invite-only accounts at launch (`SIGNUP_MODE=invite`), open later (`open`). | ASSUMED | Owner | 01 |
| D-17 | Server-key limits: 30 plan runs and 6 timetable imports per user per day; per-plan token ceiling. BYO keys are not capped by Dialed beyond abuse rate limits. | ASSUMED | Owner | 02, 06, 07 |
| D-18 | Transactional email via SMTP-compatible provider configured by env (Resend recommended). | ASSUMED | Owner | 01 |
| D-19 | Uploaded timetable files are deleted right after parsing (hard limit 1 hour), never used for training, never logged. | ASSUMED | Owner | 02 |
| D-20 | No third-party analytics in v1. Server logs + metrics only, redacted. | ASSUMED | Owner | all |
| D-21 | Time model: routine times are local wall-clock minutes; dates are calendar dates in the user's time zone (stored on profile, updated from device). | ASSUMED | Owner | all |
| D-22 | Heads-up and meal notes are local notifications scheduled on device (daily cap + quiet hours enforced on device). Plan-ready, chat drafts, Live Activity push-to-start/update/end and silent sync nudges are APNs from the server. | ASSUMED | Owner | 06, 07, 08 |
| D-23 | Delete account: immediate sign-out on all devices, soft delete, hard purge within 30 days, Apple token revoked. | ASSUMED | Owner | 01 |
| D-24 | Defaults: quiet hours 12 am–9 am, heads-up off, meal notes off, plan notifications on, daily cap 6, Live Activity on. | ASSUMED | Owner | 08, 09 |
| D-25 | One server-side planning engine serves both in-app planning and MCP drafts; one shared validator (`packages/planning`) enforces every rule. | ASSUMED | Owner | 02, 06, 07 |
| D-26 | Model IDs per provider come from env (`PLAN_MODEL_*`), never hard-coded. | ASSUMED | Owner | 02, 06 |
| D-27 | Timetable import accepts camera photo, Photos image, PDF and DOCX. | LOCKED | Owner | 02 |
| D-28 | Apple Calendar import is read-only and never writes to calendars. | LOCKED | Owner | 02 |
| D-29 | MCP: Streamable HTTP at `/mcp`, OAuth 2.1 authorization code + PKCE with dynamic client registration per the MCP authorization spec; scopes `schedule:read plans:draft`. | ASSUMED | Owner | 07 |
| D-30 | "Rest of the year" = Dec 31 of the current year; week starts Monday. | LOCKED | Owner | 05, 06, 07 |
| D-31 | Week starts Monday; Day hero spans 9 am–12 am by default (from profile day bounds). | ASSUMED | Owner | 03, 08 |
| D-32 | Add-sheet "Push alert" defaults to "Default (off)" (prototype showed 10 min); explicit per-block alerts count toward the daily cap. | ASSUMED | Owner | 04, 08 |
| D-33 | New accounts get default categories only (School: Class [protected], Study; Life: Gym, Personal, Meal [quiet], Break [quiet]); no term until setup creates one. | ASSUMED | Owner | 01, 02, 05 |
| D-34 | Categories carry `quiet` (UI switch on Edit category) and `protected` (internal; Class) flags. | ASSUMED | Owner | 06, 07, 08, 09 |
| D-35 | Surfaces not in the approved prototype need a flow-prototype review + owner approval before production UI: OAuth sign-in/consent pages (07), New-password page + web fallback (01), Name your term sheet (05), Quiet switch on Edit category (09), plan-notification permission ask (06), Disconnect-all dialog (07). Everything else proceeds. Screens awaiting approval are built behind a feature flag and their rows reported as unverified by design; they don't block the main line. | ASSUMED (reviewer-raised; confirm in CLIENT_QUESTIONS 0b) | Owner | 01, 05, 06, 07, 09 |
| D-36 | Calendar import goes through the normal Review screen; nothing is added without the Approve tap (follows from D-06; reviewer-raised). | ASSUMED (confirm) | Owner | 02 |
| D-38 | Domain: okoro.me → `api.okoro.me` (API + `/mcp`), email from `no-reply@okoro.me`. | LOCKED (owner, 2026-10-20) | Owner | all networked, 01, 07 |
| D-39 | Build for a **free Apple account (Personal Team)** first, behind `APPLE_TEAM_TIER=personal`; paid-only features degrade as in BACKEND_SETUP §13 and switch on with `paid`. | LOCKED (owner, 2026-10-20) | Owner | 01, 06, 07, 08 |
| D-37 | Day bounds and quiet hours are soft checks in the validator; the owner's seed uses day start 7:30 am and quiet hours 12 am–7:30 am. | ASSUMED | Owner | 02, 06, 07 |
| D-40 | Tab changes (Day/Week/Month) fade 120 ms (Flow 03; prototype slides 320 ms). The floating nav collapses/expands over 450 ms (prototype; Flow 03 said 250 ms). | LOCKED (owner, 2026-10-21) | Owner | 03 |
| D-41 | A week with no blocks shows its lanes with "0h". The "Plan this week" entry point (→ Flow 06) is prototyped with Flow 06. | "0h": LOCKED (owner, 2026-10-21); "Plan this week": PENDING owner approval | Owner | 03, 06 |
| D-42 | Accepted Flow 03 deltas from the prototype: legend/tile/stack order comes from the data (hours, Life last); every Month week row opens its week; holiday notes sit on their own row under the Month axis. | APPROVED (owner, 2026-10-21) | Owner | 03 |
