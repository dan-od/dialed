# Flow_08: Glance without opening

## Goal
The Planner sees what's now and next on the lock screen, Dynamic Island, home-screen widgets and the occasional notification — without opening the app, and without noise. Trigger: block boundaries, widgets added by the Planner, notification times. Success: during work blocks a Live Activity shows the countdown and what's next; quiet blocks and gaps show in the line under the date; widgets always show relevant, current content; notifications stay within the cap and quiet hours. Boundary: all surfaces outside the app plus the in-app Customize sheet and notification permission state; notification settings UI is Flow 09. Neighbours: 03 (data and exits), 04/05/06/09 (changes that refresh these surfaces), 06 (plan notifications open Review).

## References and coverage
REF-001 states: `lockLive`, `lockMeal`, `lock-lineonly`, `lockQuiet`, `home`, `home-week`, `homeEdit`, `home-all`, `lockEdit`, `lock-one`, `lock-three`, `push-reminder`. Secondary: `notifAsk`, `permHelp` (Flow 04), `push-plan` (Flow 06), `push-chat` (Flow 07). Native: NAT-04 (Dynamic Island), NAT-05 (iOS widget editors). Changed from prototype (D-14): iOS places widgets; the in-app sheets become (a) lock-screen mode + line toggle and (b) a guide with live previews; the Rundown "Today/This week" and "meals and breaks" options are WidgetKit configuration (AppIntent) options; lock-widget slot rules are enforced by iOS, not the app.

## Entries, sequence, and exits
**Live Activity (work blocks only, lock mode "Live Activity + line")**
1. At a work block's start the server sends an APNs push-to-start (or the app starts it locally if foregrounded): Lock screen card — Dialed tile (small-cut mark), "• Now · until 2:30 pm" with category dot, title, big Anton countdown "1:15 left" (`Text(timerInterval:)`), segment bar: current block (fills with progress) + next two blocks with labels (labels hidden for blocks < 30 min), "32%" under the current segment.
2. Dynamic Island: compact leading = mark, trailing = countdown; minimal = mark; expanded = title, countdown, "Then Cryptography prep 2:45".
3. At block end: push ends it (`dismissal-date` = end). Consecutive work blocks: end + start at the same minute (no gap flash allowed > 2 s).
4. Tap → `dialed://day`.
**Line under the date (inline accessory widget)** — on by default:
- Work block with Live Activity on: "Then <next> at 2:45" (no duplication).
- Work block with Line only: "<title> · 1h 15m left".
- Quiet block: "Dinner · 45m left, then Sermon Sync".
- Gap: "Next: WellServices at 8:30". Day done: "Day done" / tomorrow's first block after 10 pm.
**Lock widgets** (Planner adds via iOS editor; any 1–3 that fit iOS's spaces):
- Countdown (circular): ring progress of current work block + "1:15 LEFT"; between blocks "8:30 NEXT".
- Day ring (circular): today's work blocks as arc segments (past dimmed), orange now dot, centre "5 LEFT".
- Up next (rectangular): "NEXT · IN 1H 30M", title, "2:45–4:15 · 1h 30m"; none → "Nothing else today" + tomorrow's first.
- Today (rectangular): "TODAY · 7H 30M OF WORK LEFT", timeline bar with now marker, "9a · 5 blocks left · 12a".
- This week (rectangular): "WEEK · 8.9 / 64H", 7 mini bars (today solid), "Today: 10.4h planned".
**Home widgets** (any mix):
- Now (small, orange): "NOW", title (2 lines), Anton countdown, progress bar, "Then <next>"; between blocks it renders Up next.
- Up next (small, glass): time big in orange, title, "in 1h 30m · 1h 30m".
- Rundown (medium, glass): Today → next 4 blocks (current row highlighted with "1:15 left"), header "TODAY · 7H 30M OF WORK LEFT"; This week → 7 bars + top 3 categories with hours. Config: Show (Today | This week), Meals and breaks (on/off).
- Today timeline (large, glass): rail of remaining blocks positioned by time, current highlighted, orange now line with time chip.
Taps: Now/Up next/Rundown Today/Timeline → `dialed://day`; Rundown week/This week → `dialed://week`.
**Notifications (local, on device)**: heads-up N min before work blocks (default off) — expanded card with actions inside the card: "Snooze 10 min" | "Open day" (primary); meal/break note (default off, quiet delivery, interruption level passive); daily cap 6; quiet hours 12 am–9 am. Remote: `PLAN_READY`, `CHAT_DRAFT` (Later | Review), silent `SYNC`.
**In-app Customize** (from the prototype "Customize"/"Edit widgets" entry; in production reached from Settings → Notifications → "Lock screen and widgets"): mode segmented "Live Activity + line | Line only" with explanation; "Line under the date" switch (hidden in Line only, forced on); widget guide: previews of every Dialed widget rendered with live data + "How to add: touch and hold your Lock Screen, tap Customize…" steps.
Exits: Day, Week, Review.

## States and feedback
| State | Feedback |
|---|---|
| Work block, LA on | LA + line "Then…" |
| Work block, Line only | line "<title> · Xm left"; no LA |
| Quiet block | line only; optional note if enabled |
| Gap | line "Next: …"; widgets show Up next |
| Day done | line "Day done"; widgets show tomorrow's first block after 10 pm |
| No routine | widgets: "Set up your week in Dialed" (tap opens setup) |
| Signed out | widgets: "Sign in to Dialed"; no LA; notifications cancelled |
| Stale snapshot (> 26 h old) | widgets show last data greyed + "Open Dialed to refresh" |
| Notifications denied | in-app stamps in Flow 04/09; LA still works (separate permission: Live Activities toggle in iOS Settings) |
| LA disabled in iOS Settings | Settings → Notifications row shows "Live Activities are off in iPhone Settings" + Open Settings |
| Cap reached | extra notes dropped; Settings count shows it |
| Snooze | reschedules +10 min, toast in app next open not needed |

## Interaction surface and transitions
System surfaces only (Live Activity, Dynamic Island, widgets, notifications) plus one in-app **page** (Customize/guide) — page, not sheet, because it holds previews and steps. Widget transitions: WidgetKit default content transitions (`.contentTransition(.numericText())` for countdown). Haptics: none from widgets/LA (iOS default for notifications). Reduce Motion: no numeric transitions.

## Actions and functions
| Action | Component | Details |
|---|---|---|
| Write snapshot | `glance.writeSnapshot()` (TS) → native `DialedNative.writeSnapshot(json)` | App Group `snapshot.json` (schema v1, C-x08), atomic write, then `WidgetCenter.reloadAllTimelines()` |
| Widget timelines | Swift `Provider.getTimeline` | entries at every block start/end today+tomorrow, plus midnight; policy `.after(lastEntry)`; countdowns via `Text(timerInterval:)` |
| Widget config | `RundownIntent` (AppIntent: `show: today|week`, `meals: Bool`) | defaults from snapshot settings |
| Inline line | accessoryInline widget | text rules above |
| Register device | `PUT /v1/devices/current` | APNs token, LA push-to-start token (`Activity<…>.pushToStartTokenUpdates`), prefs (lock mode, line on, heads-up, meal notes, daily cap, plan pushes — quiet hours come from the user profile, not the device) |
| Schedule LA | worker `la.schedule` | on revision change touching today/tomorrow and nightly 03:00 local; enqueue `la.start`/`la.end` per work block per device (dedupe) |
| Start LA | worker `la.start` | APNs `push-type: liveactivity`, `event: start`, `attributes-type: BlockActivityAttributes`, `attributes` + `content-state` per BACKEND_SETUP §8, `relevance-score`; device then reports the activity's push token |
| End LA | worker `la.end` | `event: end` sent to the activity's own push token from `live_activities`, `dismissal-date` = end; no token yet → retry; still none at end+5 min → rely on `staleDate` = end |
| Local start fallback | app foreground at block start | `Activity.request` if none active for that block |
| Local notifications | `glance.scheduleNotifications()` | next 48 h, cap + quiet hours, categories `BLOCK_REMINDER`, `MEAL_NOTE` |
| Snooze | notification action handler | reschedule +10 min |
| Mode change | profile/device prefs mutation | ends active LAs when switching to Line only; reschedules jobs |

## Data and integrations
- Persistent data: yes (device prefs on server; snapshot on device)
- App Group container: `snapshot.json` only (no tokens). Fonts: Anton bundled in extension.
- Server: `devices`, `jobs`; APNs (`APNS_*`).
- Live Activity shape: the canonical `BlockActivityAttributes` / `ContentState` in BACKEND_SETUP §8 (single definition). Per-activity push tokens are stored in `live_activities` via `PUT /v1/devices/current/activities/:blockKey`.

## Security and abuse cases
Lock-screen exposure of titles is by design (privacy setting post-v1); no tokens or PII beyond titles/times in snapshot or pushes; push tokens bound to user+device, removed on sign-out/410; dedupe prevents duplicate LAs; APNs auth key stored as Docker secret.

## Accessibility
Widgets: `accessibilityLabel` summaries ("Now: Sermon Sync, 1 hour 15 minutes left, then Break"); Dynamic Type in widgets via system fonts for labels (Anton for numerals scales with `.minimumScaleFactor`); colour not the only cue; LA readable by VoiceOver on lock screen.

## Platform behavior
Free Apple account (D-39): Live Activities start locally and end via dismissal date, plan alerts are local notifications after background refresh, widgets depend on App Groups being allowed — see BACKEND_SETUP §13.
Requires dev build + widget extension target (`@bacons/apple-targets`), App Group entitlement, Push Notifications + Live Activities (`NSSupportsLiveActivities`, `NSSupportsLiveActivitiesFrequentUpdates` = NO). Push-to-start needs iOS 17.2+ (D-12). LA max 8 h; blocks longer than 8 h are split (rare). Physical device required for push-to-start, APNs and haptics — the Simulator can preview widgets and locally-started LAs only.

## Contracts
C-x08 (snapshot + refresh), C-0803 (deep links), `notifications`, `schedule-model`, `identity-session` (sign-out ends everything).

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| Line text rules | `lineText(state)` (TS, mirrored Swift) | unit table tests for 6 states | widget previews | evidence/flows/Flow_08/line.png | not started |
| Snapshot schema + writer | `glance.writeSnapshot` | unit + Swift decoding test | — | — | not started |
| Timelines at boundaries | Swift `Provider` | XCTest with fixed snapshot | Simulator widget gallery at 13:15 (in a work block), 17:30 (quiet block), 20:20 (gap) on Mon 2026-10-19 | …/widgets-*.png | not started |
| Each widget content | SwiftUI views | snapshot tests (swift-snapshot-testing) light/dark | — | …/widget-snapshots/ | not started |
| LA start/end via push | worker `la.*` + ActivityKit | job tests (APNS_MODE=log payload golden) | **physical iPhone** recording across a boundary — unverified by design until Apple Developer enrolment; the Simulator proves locally-started activities only | …/la-boundary.mp4 | not started |
| Line only ends LAs | mode handler | integration | device | …/line-only.mp4 | not started |
| Notifications cap/quiet hours | `scheduleNotifications` | unit (cap 6, quiet 0–9) | device | …/notifications.md | not started |
| Snooze action | handler | unit | device | — | not started |
| Deep links from widgets | URL handling | e2e via `simctl openurl` | — | — | not started |
| Sign-out clears | `sessionEnded` | integration | device | — | not started |

## Open decisions
D-07, D-08 LOCKED; D-12, D-14, D-22, D-24 ASSUMED. Hide-titles-on-lock-screen privacy option: post-v1.

## Build seed
Build early (after Flow 05) on a physical iPhone to de-risk the native target. First failing test: "lineText for a quiet block at 17:30 with next work block Sermon Sync at 18:15 returns “Dinner · 45m left, then Sermon Sync”".
