# Flow 08 — verification (Glance: line, lock and home widgets, Live Activity, notifications, Customize)

Data: the owner's seed in local Postgres (2037/2038 calendar). Runtime: local API on :8080 (`APNS_MODE=log`,
`APPLE_TEAM_TIER=personal`), Metro on :8081, iPhone 17e Simulator (iOS 27.0) with a **signed** dev build of
`me.okoro.dialed` and its `DialedWidgets` extension. No Apple Developer account, no `APPLE_TEAM_ID`, no physical
iPhone: everything push- or device-dependent is unverified by design (D-79, D-80, stop points).

Widgets run on the device's real clock, while the seed lives in 2037. For the clock points, the dev-only link
`dialed://dev-glance?minute=…` (`__DEV__` builds only, D-113) writes the seed Monday into the snapshot under an
`Etc/GMT±N` zone whose hour matches the target, nudging every block by the leftover minutes (under an hour). So
the widgets read the real snapshot through the real code, but **shown times are offset** from the prototype's
(for example "3:19" instead of "2:45" in the work-block capture). The text rules themselves are proven at exact
prototype times by the model tests.

Re-run:
- `pnpm --filter mobile test` (242), `pnpm --filter @dialed/api test` (179, incl. `test/liveActivities.test.ts`),
  `packages/schedule` vitest (43), `scripts/swift_glance_test` (decode, LineText parity over 1,184 cases,
  LockModel, HomeModel, ActivityModel).
- `scripts/flow08_evidence` (`ADD=1` once per Simulator to put Now and Up next on the home screen; `FROM=` to
  resume), then `scripts/flow08_contact_sheet`.

## Results

| Requirement | Implementation | Automated | Runtime evidence | Status |
|---|---|---|---|---|
| Snapshot v1 written to the App Group, atomic, reload timelines (C-x08) | `glance/snapshot.ts`, `writer.ts`, `SnapshotStore.swift` | `glanceSnapshot`, `glanceWriter`, decode fixture parity | App wrote `snapshot.json` to the App Group (step 2); widgets render it (`f08-home-*`) | passed (Simulator) |
| Line under the date: work (LA / Line only), quiet, gap, day done, tomorrow after 10 pm, fallbacks | `lineText.ts` + `LineText.swift` | `glanceLine`; Swift parity over 1,184 instants | Customize line preview (`f08-customize-*`); the inline widget itself not placed (lock editor, below) | passed (automated); runtime unverified |
| Lock widgets: Countdown, Day ring, Up next, Today, This week; fallbacks; VoiceOver labels | `LockModel.swift`, `LockWidgets.swift` | LockModel at 1:15 / 5:30 / 8:20 / 10:30 pm (46 checks) | previews in `f08-customize-lock-*` (RN, same rules); real accessory widgets not placed | passed (automated); **runtime unverified**: Maestro can't open the Simulator's lock-screen editor |
| Home: Now (orange, live countdown, progress, "Then …"; Up next between blocks) | `HomeModel.now`, `NowCard` | HomeModel; timeline only at boundaries | `f08-home-work` (Sermon Sync, `1:13:50` counting down), `f08-home-quiet`/`-gap` (falls back to Up next) | passed |
| Home: Up next ("2:45", title, "in 1h 30m · 1h 30m"; nothing left; tomorrow after 10 pm) | `HomeModel.next` | HomeModel 1:15 / 8:20 / 10:30 pm | `f08-home-*` (WellServices "in 9 min · 1h 30m" in the gap) | passed |
| Home: Rundown Today (next 4, current "1:14 left") / This week; options via AppIntent (iOS 17+) | `HomeModel.rundownToday/Week`, `RundownIntent` | HomeModel incl. meals off, week header "Week 43" | iOS widget gallery: `f08-rundown-work` (current row highlighted), `-quiet` (Dinner "0:44 left"), `-gap`, `-signedout`. Medium widget did not stay on the crowded home page, so it is shown from the gallery, which draws the real widget | passed; This week and the Edit Widget options not exercised at runtime |
| Home: Today timeline (rail, current, past dimmed, now line + chip) | `HomeModel.timeline`, `TimelineCard` | HomeModel | gallery `f08-timeline-*`. **Fixed after the sheet:** a 15-minute block's label overlapped the next block's; short slots now keep only the colour bar (build green, not re-looked) | passed (fix verified by build only) |
| Signed out → "Sign in to Dialed"; snapshot cleared, notes cancelled, activities ended | `sessionEnded` → `snapshotWriter.clear`, `cancelNotifications`, `activityClient.endAll` | writer/activity tests | `f08-home-signedout`, `f08-rundown-signedout`, `f08-timeline-signedout` | passed |
| No routine / stale (> 26 h) / no App Group fallbacks | `LockModel.fallback`, `SnapshotReader` | Swift + TS tests | — | passed (automated) |
| Deep links `dialed://day`, `dialed://week` (widget taps) | expo-router routes | — | `f08-link-day`, `f08-link-week` (simctl openurl) | passed (taps on widgets themselves not exercised) |
| Notification categories: Snooze 10 min (reschedules +10), Open day; meal notes passive; cap 6; quiet hours | `glance/schedule.ts` | `glanceSchedule`, `reminders` | — | passed (automated); banners and actions need a device |
| Device registration: APNs + push-to-start tokens, platform, prefs; activity reports | `account/service.ts`, `account/routes.ts` | `liveActivities.test.ts` (registration round trip, null clears, bad token 400, bad key 400, unknown block 404) | — | passed (automated) |
| Server LA jobs: schedule (dedupe), start payload (golden), end with/without token, dismissed never restarted, Line only cancels, triggers per revision + nightly | `glance/activities.ts`, `jobs/handlers.ts`, `sync/record.ts`, `worker.ts` | `liveActivities.test.ts` (15) | — | passed (automated, `APNS_MODE=log`) |
| App LA client: start in a work block, no duplicate, local-only on Personal Team, update when end moves, back-to-back hand-over, dismissed, Line only, off in Settings, tokens to server | `glance/activity.ts`, `DialedNativeModule.swift` | `glanceActivity` (13) | dev link started the Sermon Sync activity locally ("activity: Sermon Sync") | passed (automated) |
| LA card + Dynamic Island look (title, "Now · until …", countdown, segment bar, labels hidden < 30 min) | `BlockActivityWidget.swift`, `ActivityModel.swift` | ActivityModel checks | the lock-screen capture came out **black** (display asleep after the lock key; not kept); the lock hierarchy listed no activity text | **unverified** (Simulator capture failed; device run needed) |
| Customize page: mode (Live Activity + line / Line only), explanation, line switch hidden in Line only, LA-off state + Open Settings, guide previews + how-to | `customize.tsx`, `GlancePreviews.tsx`, `preview.ts` | `customize.test.tsx` (preview text = widget text at 1:15 / 10:30 pm, mode, switch, LA off) | `f08-customize-*` dark and light, Line only | passed. Previews on the real date show a free day (the seed has no 2026 term) |
| Light theme | tokens | — | `f08-customize-*-light` | passed |
| Reduce Motion → no numeric transitions | `Numeric` modifier | — | — | unverified (setting not toggled) |
| iPhone SE / AX1 | — | — | not captured for Flow 08 | not run |
| Personal Team App Group on a device (D-77) | `app.config.ts` | — | needs `APPLE_TEAM_ID` + Xcode sign-in | **unverified (owner)** |
| Push-to-start at a real boundary, push end, back-to-back with no gap flash, push update | server jobs | payload golden tests | needs APNs (paid account) + iPhone | **unverified by design (stop point)** |
| Local-only LA stays until block end with `dismissalPolicy .after` (D-80) | module `startActivity(localOnly)` | — | needs an iPhone | **unverified (device)** |
| Haptics: system defaults only from widgets/LA/notifications | none added | — | — | unverified (device) |

Totals: mobile jest 242/242 (40 suites), API 179/179, schedule 43/43, Swift glance PASS, `tsc` (mobile, API),
ESLint (API, packages), `expo lint` 0 errors (10 warnings, all from earlier flows), Prettier, gitleaks over the
Flow 08 commits: no leaks. Contact sheet: `evidence/flows/flow08-sheet-1.png` (23 screens, one look).

## Security pass 2
- New routes require the app session (`requireApp`); the activity route validates the block key shape, uses the
  session's device and the caller's schedule only; another user's block key resolves to 404.
- Tokens are hex-validated, never logged (log mode prints payload and topic only), stored per device; a null
  clears them. `APNS_MODE=apns` stays refused at startup until push is activated (stop point).
- No path from a widget, Live Activity or the server LA jobs writes schedule data (D-06): they read the snapshot
  or `loadScheduleData` only.
- The App Group holds only `snapshot.json` (titles, times, category names and colours), written with
  `completeUntilFirstUserAuthentication`, removed on sign-out.
- The dev-only `dev-glance` route and pin are `__DEV__`-gated; a release build redirects to Day and never pins.

## Accessibility pass
- Every widget has one VoiceOver label (e.g. "Now: Sermon Sync, until 2:30 pm. Then Cryptography prep at 2:45 pm";
  rundown rows read in order). Labels avoid minute counts that would go stale between timeline entries (D-100).
- Customize: mode is a radio group with checked state; the line switch is labelled; guide previews are hidden
  from VoiceOver and each guide item reads its name, size and description (D-111).
- Spoken output and Dynamic Type on the real widgets: not checked (needs a device / AX sizes not captured).

## Visual deltas for the owner (from the one look)
- Times on the Simulator captures are offset by the dev link's nudge (see above), not a product difference.
- Live Activity: "Then <next block>" names breaks too; the "32%" label is a live fill; the Dialed tile is a
  drawn stand-in (D-108).
- The Now widget's countdown shows seconds ("1:13:50") because it is a system timer (D-100); the prototype
  shows "1:15".
- Customize previews: long titles in the wide lock previews truncate ("Nothing else to…"), as the prototype's do.

## Decisions
D-77…D-113 in `00_Brief_Analysis.md` (D-113: the dev-glance proof tool).
