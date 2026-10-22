# Flow 03 — verification (complete: Day, Week, Cards, Month)

Data: the owner's seeded Fall 2026 routine in Postgres, pulled through `GET /v1/sync/pull?since=0` into on-device SQLite,
resolved by `packages/schedule.resolveDay` (the same code the server uses). Device: iPhone 17e Simulator (390×844 pt @3x),
iOS 27.0, dev build from `~/Codes/dialed` (normal Xcode path), bundle ID `me.okoro.dialed`.
Clock states use a dev-only clock: long-press the Day date to cycle Mon Oct 19 1:15 pm → 8:20 pm → 11:30 pm →
2:29:45 pm (ticking) → real clock. `__DEV__` only; compiled out of release builds.

Re-run everything: `./scripts/flow03_evidence` (screens + recordings), `pnpm --filter mobile test`.

| Requirement | Implementation | Automated | Runtime evidence | Status |
|---|---|---|---|---|
| resolveDay parity + 64.3 h week | `packages/schedule` | 21 golden/rule tests; runtime_proof resolves from synced rows | `runtime-proof.json` | passed |
| Hero three states | `day/model.ts`, `DayHero` | `dayModel.test.ts` (795/1220/1410, prototype numbers) | `screens/day-{1315,free-2020,done-2330}-{dark,light}.png` | passed |
| Minute boundary update | `clock/useClock` (aligned to the real or dev clock's minute) | `clock.test.tsx` (fake timers: 14:29:50 → 14:30; dev clock 14:29:45 → 14:30) | `recordings/boundary.mp4`, `screens/boundary-before-1429.png`, `boundary-after-1430.png` | passed |
| Offline read + queued edit | `SQLiteStore`, `SyncEngine` | `syncEngine.test.ts` (7) | `screens/day-offline*.png`, `day-after-sync.png` (API stopped; airplane mode can't be simulated) | passed |
| Sync pill + toast | `SyncPill`, engine events | engine tests | `day-offline-queued.png` (pill); toast fired before capture | partial |
| Conflict toast + Reapply | engine `conflict` → toast | engine test (two writers) | — | passed (automated only) |
| Week lanes | `week/model.ts weekModel`, `week/Lanes.tsx`, `(tabs)/week/index.tsx` | `weekModel.test.ts` (64h, lane totals and summaries, 8 am axis, now marker, legend) | `screens/week-{dark,light}.png`, `week-thanksgiving-*.png` (from Month) | passed |
| Day cards | `cardsModel`, `week/Cards.tsx`, `(tabs)/week/cards.tsx` | model tests (rows, current "left", tiles) | `screens/cards-wed-*.png`, `cards-thu-*.png` (after a swipe) | passed |
| Month poster + weeks | `monthModel`, `week/MonthChart.tsx`, `(tabs)/month.tsx` | model tests (276h / 153h / 12 days at Mon 1:15 pm; weeks incl. Thanksgiving 55.8h; axis collisions) | `screens/month-{dark,light}.png` | passed |
| Nav collapse on scroll | `day/navCollapse.ts`, `RestOfToday`, `FloatingNav` | `navCollapse.test.ts` (slow 5 pt steps, bounce, jitter) | `recordings/nav.mp4`, `screens/nav-{full,mini,expanded,tap-expand}.png` | passed |
| Empty-Day setup chooser | `SetupChooser` | — | Flow 01 `screens/setup.png` | passed |
| VoiceOver labels | hero sentence, rows "Edit …", lanes "Monday 19, today, 10.4 hours. Open in detail.", cards summary, tiles, nav tabs with selected state, charts hidden | `a11y.test.tsx` (7) | `a11y.md` (device accessibility tree) | passed (automated); spoken VoiceOver unverified — the Simulator has no VoiceOver |
| Dynamic Type AX1 | `DisplayTitle`/countdown scale line boxes; fixed columns scale; rows stack duration under title ≥ 1.3× | — | `screens/ax1-{day,week,cards,month}.png` | passed (visual) |
| 44 pt targets | lanes ≥ 48, week rows ≥ 44, Seg and toast action via hitSlop | — | — | passed (static review) |
| Contrast | tokens | `packages/tokens/test/contrast.test.ts` | — | passed |
| 375×667 (iPhone SE 3rd gen) | layouts are width-relative | — | `screens-se/` (Day 3 states, Week, Cards, Month, Thanksgiving week); Flow 01 in `../Flow_01/screens-se/`; e2e chain green on the SE | passed |
| Week with no blocks | lanes render "0h" with empty tracks (D-41) | — | — | passed ("0h"); "Plan this week" pending owner approval, prototyped with Flow 06 |

## Fidelity deltas vs prototype v9
Owner accepted (2026-10-21, D-42): category order from data, every week row opens, holiday note row.
- Owner review 2026-10-21 (user instruction outranks the prototype):
  - Toasts: dark = cream with a 1.5 pt ink edge; light = cocoa `#8A5A44` with cream text (prototype: ink, invisible over the ink Rest-of-today panel). Toasts sit above the floating nav or pinned bottom buttons (`useToastAnchor`), never over them.
  - Light-mode stamp `#D4911F` (ink text 7.3:1); prototype `#8F5A00` was 3.4:1.
- Day bounds from the profile (owner day starts 7:30 am): axis "7:30 am", 35/78/97 % (prototype at 9 am: 28/76/97 %).
- Week/Month numbers are computed (week number, dates, done hours, days to go, holiday label) instead of the prototype's literals. At the prototype clock they match: 64h, 276h, 153h, 12 days to go.
- Legend, month stack and mini-bar order follow the data (hours, Life last). With the seed Study (14.7 h) edges Sermon Sync (14.6 h), so the legend starts "Study, Sermon Sync, Class" and the tiles start "School 27.2h, Sermon Sync 14.6h" (prototype hand-orders "Sermon Sync, Class, Study" / "Sermon Sync, School"). Tile values are identical.
- Tile label "Speedwatch Ontario" (full name; prototype shortens to "Speedwatch").
- Week summaries leave out Life categories (generalises the prototype's "leave out Gym").
- Month axis: day numbers chosen by priority without overlap (today, holidays, 1st/last, Mondays); the holiday note ("Thanksgiving", from the override note) sits on its own row (prototype: "12 Holiday" inline).
- Every week row opens its week (prototype: only the current one; others toast). Previous month works.
- Lane axis labels aligned to the track's 0/25/50/75/100 % (prototype axis is ~10 pt off the track).
- Tab changes fade 120 ms; nav collapse animates 450 ms (owner decision D-40, 2026-10-21).
- Lane label adds "today"; Day cards announce as one summary each; the card rail has VoiceOver increment/decrement.
- Card snap fires a selection haptic (annotated, not coded, in the prototype); Lanes/Cards switch fires selection both ways.
- "1 blocks" → "1 block"; "Cryptography lecture" no longer doubled (computed tomorrow line).

## Known dev-only finding (open)
`WARN Sending onAnimatedValueUpdate with no listeners registered` shows intermittently in dev builds (LogBox banner
"Open debugger to view warnings"). Narrowed down:
- It is emitted by React Native's core Animated native driver. App code uses only Reanimated (no core `Animated`).
  react-native-screens wires every native-stack screen's `onTransitionProgress` through
  `Animated.event(…, { useNativeDriver: true })`.
- It follows sign-in (signed-out stack swapped for the signed-in one): 4 of 10 measured sign-ins, 0 of 6 sign-outs,
  0 on Day/Week/Month/Cards navigation, account sheet open/close or theme changes.
- Not the tab fade (A/B both ways) and not the open keyboard at submit (dismissing it first: still 2 of 4).
- No user-visible effect. Not suppressed with LogBox.ignoreLogs. Next step if wanted: reproduce in a bare Expo Router
  app with `Stack.Protected` and report upstream, or patch react-native-screens.
