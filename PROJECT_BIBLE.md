# Project Bible — Dialed

Compact source map. Details live in the linked documents; update this file only when a durable product rule changes.

## Product intent
Audience: busy students and builders with fixed classes and several side projects (first user: the owner). Promise: "Your week, dialed in." — always know now/next at a glance; change the week by describing it and approving a draft. Constraints: iOS first (Expo), home-lab backend, provider-agnostic AI, nothing changes without Approve. See `00_Brief_Analysis.md`.

## Navigation and surfaces
- Root: floating nav tabs **Day · Week · Month · +** (collapses to a pill when the Day sheet scrolls).
- Day header: date + sync pill · avatar (Account sheet) · AI mark (Plan it) · theme.
- Pushed pages: Cards, Routines, Routine editor, Terms, Plan it/Drafting/Question/Review/Error/Done, Setup pages, Settings stack.
- Sheets: Add block, Edit block, Category picker (stacks), Get a nudge, Reminders help, Account, Copy day, Save routine, Edit category, Merge, Timetable source.
- Dialogs: only for destructive/irreversible (discard, sign out, delete category, delete account, disconnect all).
- System: Sign in with Apple, camera/Photos/Files, permission prompts, share sheet, Live Activity, Dynamic Island, widgets, notifications.
- Deep links: `dialed://day`, `dialed://week`, `dialed://plan/<id>`; universal links for password reset.
Ownership per surface: `00_Surface_Coverage.md`.

## Components and tokens
`Design_Identity/design-identity.md` (tokens dark/light, Anton + SF, radii, components, AI mark, dial loader, app icon). Tokens are generated from `packages/tokens` into TS and Swift — never hand-copied.

## Interaction grammar
- Tap opens; sheets for one-thing tasks; pages for reading/comparing; dialogs only to prevent loss.
- Validation inline under fields; focus first error; plain one-sentence copy that says how to fix it.
- Messages are inline sentences where they belong (field error line, under the title, under the setting), key words bold or red, the fix as an orange link; the main button becomes the fix when there is one (v11, D-45). Offline is a small pill plus one muted line (D-46). Toasts for results, with Undo when reversible; anything shown while a native sheet stays open is inline (toasts sit under sheets).
- Times and dates are plain fields that open the native wheel; Add, Edit and Move show where the block lands in the day (fit strip) and handle overlaps there (D-48, D-49).
- Optimistic local writes; "· waiting to sync" marker offline; conflicts explained with Reapply.
- AI copy always names the chosen AI ("<AI> drafts the changes"); never claims something is done before Approve.

## Motion and haptics
Durations/easing per Design_Identity §Motion. Haptics: selection (pickers, switches, segmented controls like Lanes/Cards and Rundown, day tabs in the routine editor, card snaps — never the main Day/Week/Month tabs), light (remove, create, sync done, shutter), success (save, approve, verify), warning (validation, stale, destructive confirm). Never on navigation. Reduce Motion → 120 ms fades, static loader, steady colon.

## Architecture and state
`BACKEND_SETUP.md`. Server authoritative (Postgres), device offline-first (SQLite mirror + outbox), shared `packages/schedule.resolveDay`. Widgets read an App Group snapshot. Live Activities started/ended by server pushes. One planning engine + one validator for every AI path.

## APIs and events
REST v1 (`BACKEND_SETUP.md §5`), sync protocol (§4), MCP (`mcp/tools.md`), planning guide (`mcp/planning-guide.md`), push categories and deep links (`00_Flow_Contracts.md` → notifications). Error envelope and codes: `00_Flow_Contracts.md` → error-taxonomy.

## Roles and permissions
Planner (app token): own data only. External AI (MCP token): read + draft only. In-app engine: same as external AI. Worker: system jobs. Operator: `/admin` on the internal network. Matrix: `SECURITY.md`.

## Decision log
Canonical register: `00_Brief_Analysis.md` (D-01…D-35). Reusable product rules established so far:
- Work blocks → Live Activity; quiet blocks → line under the date; Line-only mode (D-07).
- Every widget always shows something relevant (Now → Up next fallback) (D-08).
- Effective-dated routine edits; past days never change (Flow 05).
- One approval surface (Review) for in-app, timetable, calendar and chat drafts (Flows 02/06/07).
- AI is provider-agnostic; the app shows the chosen AI's name (D-05).
