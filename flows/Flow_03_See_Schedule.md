# Flow_03: See my schedule

## Goal
The Planner knows what they're doing right now, what's next, and how the week and month look — online or offline. Trigger: open the app, switch tabs, or tap a widget/notification. Success: Day/Week/Month show the correct resolved schedule for the current clock within 1 s from cache. Boundary: viewing and navigation; editing is Flow 04/05, planning Flow 06. Neighbours: 01, 02, 06, 08 (entries); 04, 05, 06 (exits).

## References and coverage
REF-001 states: `day` (in a block), `day-free` (between blocks), `day-done` (all done), `day-offline`, `day-sync`, `week` (Lanes), `cards` (day cards), `month` (poster + weeks). Secondary: `push-reminder` lands here. REF-005 (superseded content).

## Entries, sequence, and exits
**Day** (root tab):
1. Header: "Mon 19 Oct" + sync pill when outbox > 0 ("2 to sync") or syncing ("Syncing"); right: avatar (Account sheet, Flow 01), AI mark (Plan it, Flow 06), theme toggle (System → Light/Dark cycle, toast "Light theme").
2. Hero: label "• Right now" (current block), "• Up next" (gap; countdown to start: "until it starts at 2:45 pm"), "• All done" (title "Day done", "Tomorrow starts at 8:10 am with your Cryptography lecture."). Title auto-fits (Display XL). Countdown `H:MM` with blinking colon; "left, ends 2:30 pm".
3. Day bars (9 am–12 am by day bounds) + axis "9 am · 28% of the day gone · 12 am".
4. Day sheet "Rest of today · 6 blocks": rows from now on (quiet rows lighter); tap → Flow 04 edit. Empty: "Nothing else today. Enjoy the evening."
5. Floating nav Day/Week/Month/+ (collapses to pill when the sheet scrolls down).
**Week** (tab): title "Oct 19–25", "Week 43 · 64h planned", Lanes/Cards switch; seven lanes (weekday, date numeral, coloured segment bar over the day, summary "Today, Sermon Sync 3.8h, Study 2.5h", total hours); today outlined; legend. Tap lane → Cards.
**Cards**: back "Week 43", title, "Swipe through your days", horizontal snap cards per day (today orange) with block rows (time, swatch, title, duration), then category totals tiles. Back → Lanes.
**Month** (tab): previous month chevron, Routines pill (Flow 05), poster ("Oct" huge, "2026", "276h planned · 153h done · 12 days to go"), day bar chart (stacked by category per day, holidays marked), Weeks list (range, mini bar, hours; current highlighted; tap → Week for that week; past/future weeks open the same way).
Exits: Flow 04 (+, row tap), Flow 05 (Routines), Flow 06 (AI mark), Flow 01 (avatar), Flow 09 via Account.

## States and feedback
| State | Feedback |
|---|---|
| Loading (cold, no cache) | skeleton bars + "Getting your week" (only first sync after sign-in) |
| In a block / between / done | hero variants above; colon blink (static with Reduce Motion) |
| Clock boundary | hero, bars and sheet update at the exact minute (timer aligned to minute) without re-entrance animation |
| Empty day (no blocks) | hero "Free day" + "Nothing planned. Add something or ask <AI>." |
| No routine at all | empty-Day **setup chooser** (owned here: layout + four option cards; each option's flow is owned by 02/05/06 and shows "Coming soon" toast until that flow lands) |
| Offline | stamp "Offline": "You're offline. Showing what's saved on this phone." Edits still work and rows show "· waiting to sync" |
| Syncing / synced | pill spinner → toast "Synced 2 changes." light haptic |
| Sync conflict | toast "<Title> was changed on another device. Your edit wasn't applied." Reapply |
| Sync error (server) | pill "Sync paused" tap → retry; no data loss |
| Day crossing midnight / DST | resolves new date; wall-clock minutes unchanged |
| Week with no blocks | lanes empty with "0h" (D-41). The dashed "Plan this week" button (→ Flow 06) is prototyped with Flow 06 and waits for owner approval |

## Interaction surface and transitions
Day, Week, Month: **tab pages** (root, no transition between tabs other than a 120 ms fade (D-40); each page plays its entrance once per visit). Cards: **pushed page** with horizontal snap. Account: sheet (Flow 01). Motion per Design_Identity (hero rise 600 ms, bars 800 ms stagger 30 ms, lanes wipe 50 ms stagger, month bars 20 ms stagger, nav rise after 150 ms; nav collapse/expand 450 ms (D-40)). Haptics: selection on Lanes/Cards switch and card snap; light on sync done; none on tab change. Reduce Motion: fades only.

## Actions and functions
| Action | Function | Notes |
|---|---|---|
| Read day/week/month | `useResolvedDay(date)`, `useWeek(weekStart)`, `useMonth(month)` over SQLite via `packages/schedule` | memoised per revision |
| Live clock | `useClock()` minute-aligned timer | pauses in background |
| Pull | `sync.pull()` on foreground, network regain, silent push, pull-to-refresh on Week/Month | cursor in SQLite `meta` |
| Push outbox | `sync.flush()` | backoff |
| Theme toggle | `prefs.setTheme` (local + profile mutation) | toast |
| Navigate | Expo Router: `/(tabs)/day|week|month`, `/week/[start]/cards?day=` | deep links `dialed://day`, `dialed://week` |

Server: `GET /v1/sync/pull` only.

## Data and integrations
- Persistent data: yes (reads)
- Device SQLite mirror tables: `categories`, `terms`, `routines`, `routine_blocks`, `overrides`, `plans` (summaries), `meta` (cursor, revision), `outbox`.
- Derived: totals (exclude quiet), percent of day (day bounds), done hours (blocks ended before now this month).
- Offline: everything readable; max staleness shown nowhere except pill; data persists across restarts.

## Security and abuse cases
Pull returns only the caller's rows (`user_id` scoped); revision cursor can't read others; deep links accept only allowlisted routes and ISO dates; no PII in deep links. Local DB protected by iOS data protection (`NSFileProtectionCompleteUntilFirstUserAuthentication` so widgets can read the snapshot, not the DB).

## Accessibility
Hero announces "Right now: Sermon Sync, 1 hour 15 minutes left, ends 2:30 pm" as one element, updated politely each 5 minutes (not every minute); bars are decorative (`accessibilityElementsHidden`), summary text provides the info; lanes are buttons with "Monday 19, 10.4 hours. Open in detail."; cards scroll by swipe and by VoiceOver adjustable action; Month chart has a text summary and the weeks list is the accessible path; Dynamic Type: rows wrap, Anton auto-fits; colour never the only signal (titles + hours).

## Platform behavior
iOS large-title-free custom header; safe-area aware floating nav above home indicator; pull-to-refresh on Week/Month; state restoration returns to last tab; background → foreground triggers pull + clock resync.

## Contracts
`sync`, `schedule-model`, `design-system`, C-0103, C-0304, C-0305, C-0306, C-0803.

## Verification
| Requirement | Implementation symbol | Automated test | Runtime proof | Evidence path | Status |
|---|---|---|---|---|---|
| resolveDay parity + 64.3 h week | `packages/schedule` | golden tests (seed) | — | — | not started |
| Hero three states | `DayHero` | component tests at 795/1220/1410 min | Simulator screenshots | evidence/flows/Flow_03/day-*.png | not started |
| Minute boundary update | `useClock` | fake-timer test | recording across 2:29→2:30 | …/boundary.mp4 | not started |
| Offline read + queued edit marker | `sync`, `DaySheet` | integration (network off) | recording | …/offline.mp4 | not started |
| Sync pill + toast | `SyncPill` | integration | screenshot | …/sync.png | not started |
| Conflict toast + Reapply | `sync.handleConflict` | integration with two clients | — | — | not started |
| Week lanes/cards/month | screens | component + snapshot vs prototype | Simulator at 390 and 375 | …/week.png, …/month.png | not started |
| Nav collapse on scroll | `FloatingNav` | interaction test | recording | …/nav.mp4 | not started |
| Empty-Day setup chooser | `DayScreen` empty branch, `SetupChooser` | component test (no routine → chooser) | screenshot vs prototype `setup` | evidence/flows/Flow_03/setup.png | not started |
| VoiceOver labels | screens | a11y snapshot (testing-library queries by label) | VoiceOver pass | …/a11y.md | not started |

## Open decisions
D-31 day bounds default (ASSUMED). Month "previous month" navigation shows any month with data; future months show routine projection.

## Build seed
This flow completes the first vertical slice: seed owner → sign in → `sync.pull(0)` → SQLite → `DayScreen` renders "Sermon Sync 1:15 left" at a fixed clock (dev menu "Set clock" for proof, never shipped). First failing test: "resolveDay(2026-10-19) for the seeded owner returns 11 blocks with Sermon Sync 12:40–14:30".
