# Flow 08 — Glance without opening: build plan

**Progress (2026-11-08):** steps 1–3 done (`apps/mobile/src/glance/`, `modules/dialed-native`, `targets/widgets`, D-77…D-92). Simulator: the app writes `snapshot.json` to the App Group through `DialedNative`; Swift decode test passes (`scripts/swift_glance_test`). Personal Team App Group on device not tested (needs `APPLE_TEAM_ID`). Next: step 4.

Sources:
- `flows/Flow_08_Glance.md`, `Sub_Interactions/Flow_08_sub_interactions.md`
- `00_Flow_Contracts.md`: C-x08, C-0803, `notifications`, `identity-session`
- BACKEND_SETUP §8 (notifications, Live Activities, widgets), §13 (free account)
- SECURITY.md lines 1–6 (App Group: no tokens)
- `packages/contracts/src/liveActivity.ts` (canonical shape already exists)
- Prototype states: `lockLive`, `lockMeal`, `lock-lineonly`, `lockQuiet`, `home`, `home-week`, `homeEdit`, `home-all`, `lockEdit`, `lock-one`, `lock-three`, `push-reminder`

Existing code:
- DB tables `devices`, `live_activities` are in `0001_init.sql`
- `PUT /v1/devices/current` stub exists in `account/routes.ts`
- `packages/contracts/src/liveActivity.ts` defines `BlockActivityAttributes` / `ContentState`
- Job handlers exist for `plan.retry`, `push.plan_ready`, `push.chat_draft`, `plans.sweep`
- Notification scheduler `src/notifications/reminders.ts` handles `BLOCK_REMINDER` and `MEAL_NOTE`
- No widget target, no Expo Module bridge, no SwiftUI code, no snapshot writer yet

## Design decisions (log as D-77+ in `00_Brief_Analysis.md`)
| # | Decision | Status |
|---|---|---|
| a | App Group name: `group.me.okoro.dialed`. Try enabling on Personal Team first; if Xcode refuses, widgets show "Open Dialed to see your day" until paid account (D-39). Record the result in BACKEND_SETUP §Versions. | To test at step 2 |
| b | Widget previews use `swift-snapshot-testing` for light/dark; no Simulator screenshots (too expensive). The Simulator shows the widget gallery at 3 clock times as the one visual check. | ASSUMED |
| c | APNs client uses `APNS_MODE=log` throughout. Real push tested only with the owner's keys (stop point). | Per D-39 |
| d | Live Activities start locally on free account; `staleDate` = block end + `dismissalPolicy: .after(blockEnd)`. Verify on device whether iOS keeps the card visible until `blockEnd`. | To test at step 10 |
| e | The Customize page is a pushed page from Settings → Notifications → "Lock screen and widgets", not a sheet. | Per flow file |
| f | `lineText` is computed in TS (for the snapshot) and mirrored in Swift (for the inline widget). A golden test ensures parity. | ASSUMED |

## Steps (each: failing test first → green → commit → push when all green)

### 1. Shared foundation — `flow-08: snapshot schema, lineText, glance module`
- New `apps/mobile/src/glance/` module:
  - `snapshot.ts`: `SnapshotV1` type matching C-x08 schema, `buildSnapshot(data, settings, categories, now)` → JSON.
  - `lineText.ts`: `lineText(state)` → string for all 6 states (work+LA, work+lineOnly, quiet, gap, dayDone, dayDoneAfter10pm). Uses `resolveDay` output.
  - `schedule.ts`: `scheduleNotifications(data, prefs, now)` — replaces the existing `reminders.ts` with the full spec: heads-up N min before work blocks, meal notes at quiet-block start, cap (default 6), quiet hours, categories `BLOCK_REMINDER` (actions `SNOOZE_10`, `OPEN_DAY`) and `MEAL_NOTE` (passive). Snooze handler reschedules +10 min.
- Tests:
  - `lineText` table test for all 6 states using the seed's Monday schedule.
  - `buildSnapshot` golden test against a fixed clock.
  - `scheduleNotifications` tests: cap 6, quiet hours 0–9, meal notes off, snooze reschedule.
- Migrate `reminders.ts` callers to `glance/schedule.ts`. Existing reminder tests updated.

### 2. Native target scaffold — `flow-08: widget extension target`
- Add `@bacons/apple-targets` config plugin to `app.json` (already named in BACKEND_SETUP §1).
- Create `apps/mobile/targets/widgets/`:
  - `DialedWidgets.swift` (widget bundle entry point)
  - `BlockActivityAttributes.swift` (mirror of `liveActivity.ts`)
  - `SnapshotReader.swift` (reads `snapshot.json` from App Group, decodes `SnapshotV1`)
  - `Info.plist` with `NSSupportsLiveActivities`, `NSSupportsLiveActivitiesFrequentUpdates = NO`
  - Bundle Anton font in the extension
- Create `apps/mobile/modules/dialed-native/`:
  - Expo Module with functions: `writeSnapshot(json)`, `reloadTimelines()`, `startActivity(attrs, state)`, `updateActivity(blockKey, state)`, `endActivity(blockKey, dismissalDate)`, `getPushToStartToken()`, `getActivityPushToken(blockKey)`
  - App Group entitlement: try `group.me.okoro.dialed` on Personal Team. Record result.
- This step requires `expo prebuild` + native build. **Quiet build**: output to `/tmp/f08-build.log`, print last 30 lines.
- Test: `SnapshotReader` decodes a fixture JSON in an XCTest.

### 3. Snapshot writer and refresh trigger — `flow-08: snapshot writer`
- `glance/writer.ts`: `writeAndRefresh(data, settings, categories, now)` calls `buildSnapshot` → `DialedNative.writeSnapshot(json)` → `DialedNative.reloadTimelines()`.
- Wire into `sync/engine.ts`: after every successful pull that changes today or tomorrow, and on `sessionEnded()` (clears snapshot).
- Wire into `AppProvider.tsx`: on foreground, after any settings/category/profile mutation.
- Test: mock `DialedNative`, verify `writeSnapshot` called with correct JSON after a sync pull that touches today.

### 4. Inline line widget (accessoryInline) — `flow-08: line under the date`
- `targets/widgets/LineWidget.swift`:
  - Reads snapshot, finds current state (work, quiet, gap, dayDone).
  - Renders `lineText` output (Swift mirror of TS function).
  - Timeline: entry at every block boundary today + tomorrow + midnight; `.after(lastEntry)`.
- `targets/widgets/LineTextSwift.swift`: pure function, same logic as TS `lineText`.
- Test: XCTest golden parity — same 6 inputs produce same outputs as the TS tests.
- **On by default** (profile `line_on = true`). Hidden in Line only mode (always on, no switch).

### 5. Lock-screen widgets — `flow-08: lock widgets`
- `targets/widgets/LockWidgets.swift`:
  - **Countdown** (circular, `accessoryCircular`): ring progress of current work block + "1:15 LEFT"; between blocks "8:30 NEXT".
  - **Day ring** (circular): arc segments for today's work blocks (past dimmed), orange dot for now, "5 LEFT" centre.
  - **Up next** (rectangular, `accessoryRectangular`): "NEXT · IN 1H 30M", title, time range + duration; empty → "Nothing else today" + tomorrow's first.
  - **Today** (rectangular): "TODAY · 7H 30M OF WORK LEFT", timeline bar with now marker, block count.
  - **This week** (rectangular): "WEEK · 8.9 / 64H", 7 mini bars (today solid), "Today: Xh planned".
- All read from snapshot. Timelines at block boundaries.
- Accessibility labels for each widget.
- Test: `swift-snapshot-testing` light/dark for each widget at 3 clock states (work block, quiet, gap).

### 6. Home-screen widgets — `flow-08: home widgets`
- `targets/widgets/HomeWidgets.swift`:
  - **Now** (small, `.systemSmall`): orange bg, "NOW", title, Anton countdown via `Text(timerInterval:)`, progress bar, "Then <next>"; between blocks renders Up next.
  - **Up next** (small): glass bg, time in orange, title, "in Xh Xm · Xh Xm".
  - **Rundown** (medium, `.systemMedium`): Today → next 4 blocks (current highlighted), header totals; This week → 7 bars + top 3 categories. Config via `RundownIntent` (AppIntent): Show (Today | This week), Meals and breaks (on/off).
  - **Today timeline** (large, `.systemLarge`): rail of remaining blocks, current highlighted, orange now line with time chip.
- Deep links: Now/Up next/Rundown Today/Timeline → `dialed://day`; Rundown week → `dialed://week`.
- Countdown uses `Text(timerInterval:)` (no per-minute reloads).
- `.contentTransition(.numericText())` for updates; Reduce Motion → no transition.
- Test: `swift-snapshot-testing` for each widget × 3 states × light/dark.

### 7. Device registration and LA server jobs — `flow-08: device routes and LA jobs`
- Flesh out `PUT /v1/devices/current`:
  - Accept: `apns_token`, `live_activity_start_token`, `prefs_json` (lock_mode, line_on, heads_up_min, meal_notes, daily_cap, plan_pushes), `app_version`, `platform`.
  - Upsert device row; return device id.
- New `PUT /v1/devices/current/activities/:blockKey`:
  - Accept: `push_token`, `state` (started | dismissed).
  - Upsert `live_activities` row.
- New job handlers in `handlers.ts`:
  - `la.schedule`: enqueue `la.start` at each work block start and `la.end` at end for devices with LA enabled (lock_mode ≠ 'line'). Dedupe key `la:<device>:<blockKey>`.
  - `la.start`: build APNs payload (`push-type: liveactivity`, `event: start`, attributes + content-state per `liveActivity.ts`). With `APNS_MODE=log`: log the payload. With `apns`: send via APNs HTTP/2.
  - `la.end`: send `event: end` to the activity's push token from `live_activities`. `dismissal-date` = end. No token yet → retry. Still none at end+5 min → rely on `staleDate`.
- Wire `la.schedule` into revision changes: after any `change_log` row affecting today or tomorrow, enqueue it.
- Nightly `la.schedule` at 03:00 local (new cron-like entry in worker).
- Tests:
  - Device registration round-trip.
  - `la.schedule` produces correct start/end jobs for the seed's Monday.
  - `la.start` payload golden test (APNS_MODE=log).
  - `la.end` with and without a push token.
  - Dedupe: same block doesn't create duplicate jobs.
  - Mode change to Line only → ends active LAs (cancels pending la.start jobs, enqueues la.end for started ones).

### 8. Live Activity client (Expo Module) — `flow-08: LA client`
- `glance/activity.ts`:
  - `startLocalActivity(block, state)` → `DialedNative.startActivity(attrs, state)`.
  - `endLocalActivity(blockKey, endDate)` → `DialedNative.endActivity(blockKey, dismissalDate)`.
  - `reportActivityToken(blockKey, token)` → `PUT /v1/devices/current/activities/:blockKey`.
- On app foreground during a work block with no active LA: start one locally (free account fallback + paid account foreground start).
- On `sessionEnded()`: end all active LAs.
- On mode change to Line only: end all active LAs.
- `Activity<BlockActivityAttributes>.pushToStartTokenUpdates` → `PUT /v1/devices/current` with the token.
- Per-activity `pushTokenUpdates` → `reportActivityToken`.
- The Expo Module Swift side:
  - `startActivity`: `Activity.request(attributes:contentState:pushType:)` with `staleDate` = block end.
  - On free account (no push): immediately call `activity.end(dismissalPolicy: .after(endDate))` so the card stays visible counting down and leaves on time without a push.
  - `endActivity`: find by block key, end with `.immediate`.
  - `getActivityPushToken`: return token from `activity.pushTokenUpdates`.
- Test: mock `DialedNative`, verify correct calls on foreground during a work block.

### 9. Customize page (in-app) — `flow-08: customize page`
- `app/(app)/settings/customize.tsx`:
  - Mode segmented: "Live Activity + line" | "Line only" with explanation text.
  - "Line under the date" switch (hidden in Line only, forced on).
  - Widget guide: live previews of each Dialed widget rendered with current data + "How to add" steps.
  - Reached from Settings → Notifications → "Lock screen and widgets" row.
- Mode change saves as profile sync mutation (`lock_mode`), triggers `writeAndRefresh` + LA end if switching to Line only.
- Deep link handling for `dialed://day`, `dialed://week`, `dialed://plan/<id>` — verify existing handlers cover these (they should from Flow 06).
- States: LA disabled in iOS Settings → row "Live Activities are off in iPhone Settings" + Open Settings.
- Test: component test for mode switch, line toggle visibility.

### 10. Proof — `flow-08: evidence, verification, decisions`
- **Automated**: all new TS tests + XCTests + existing suites green. `swift-snapshot-testing` for all widgets.
- **Static**: lint, typecheck, format, gitleaks.
- **Simulator**:
  - Widget gallery at 3 clock times (13:15 work block, 17:30 quiet, 20:20 gap) on a Monday using `simctl` status-bar override + DEV_CLOCK.
  - Locally-started Live Activity via the app's foreground fallback.
  - Deep links via `simctl openurl`: `dialed://day`, `dialed://week`.
  - Sign-out clears widgets (snapshot wiped → "Sign in to Dialed").
  - One contact sheet, looked at once.
- **Physical iPhone (stop point for push-dependent items)**:
  - Push-to-start LA at a real block boundary → recording.
  - LA end via push → recording.
  - Back-to-back blocks (end + start same minute) → no gap flash.
  - Line only mode → no LA.
  - Notification actions: Snooze 10 min, Open day.
  - Haptics: system defaults only (no custom haptics from widgets/LA).
  - **Requires**: Apple Developer enrolment for APNs, or test on free account with local-only LAs.
  - If free account: push-to-start, push-end, and back-to-back boundary are **unverified by design**. Record in verification.md.
- `evidence/flows/Flow_08/verification.md` with automated / static / runtime / unverified rows.
- Log D-77+. Update STATUS.md.

## Split points (if sessions run long)
- **After step 3**: snapshot and line are working, no widgets yet. `/clear`, resume at step 4.
- **After step 6**: all widgets built, no server LA jobs or client wiring. `/clear`, resume at step 7.
- **After step 8**: everything except the Customize page and proof. `/clear`, resume at step 9.

## Risks
- **App Group on Personal Team**: if Xcode refuses, widgets become previews only. The rest of the flow (LA, line, notifications, snapshot) still works.
- **Native build time**: first `expo prebuild` + Xcode build of the widget target will be slow. Quiet build rules apply.
- **Swift snapshot tests**: `swift-snapshot-testing` needs to be added as a Swift Package dependency in the widget target's test plan. If setup is painful, fall back to Simulator widget gallery screenshots.
- **LA on free account**: the `end(dismissalPolicy: .after(endDate))` pattern may not keep the card visible until endDate on all iOS versions. Must test on device.

## Open items for the owner
- D-39 App Group: does it work on Personal Team? (tested at step 2)
- Apple Developer enrolment for real push testing (stop point at step 10)
- DNS / Cloudflare tunnel for the real MCP connector test (Flow 07 stop point, not this flow)
