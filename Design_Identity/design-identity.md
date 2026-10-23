# Design identity — "Bold"

## Evidence header
- Approved direction: "Bold" (Bold Night / Bold Day), approved over 8 directions on the design canvas; implemented in `assets/references/dialed-flow-prototype.html` v8 (D-09, D-10).
- Reference alignment score: n/a (the prototype *is* the reference; production must match it screen-for-screen).
- Transmission score: 0 — not yet measured. First build task for any UI flow: build the Day screen from this file alone, screenshot at 390×844 in the iOS Simulator, compare with the prototype at the same size, and patch this file for any rule that failed to transmit. Record score and deltas in `evidence/design/`.
- Target viewports and devices: iPhone 15 (390×844 pt), iPhone SE 3 (375×667), iPhone 15 Pro Max (430×932). Dynamic Type up to AX1 without clipping.
- Compared artifacts: prototype states listed in `00_Surface_Coverage.md`.

## Product character
Loud, sporty, confident. One loud colour (Signal orange) against near-black ink or warm cream. Huge condensed numerals for times and dates; calm system text for everything else. Messages live where they belong (under the field, under the title, in the row) as one plain sentence, never boxed alerts (v11, D-45). No purple/blue gradients, no generic AI sparkles, no stock card shadows.

## Color tokens

Every token appears once. Dark is default; light applies when theme resolves to light.

| Token | Dark | Light | Role |
|---|---|---|---|
| `bg` | #120906 | #FBF0E8 | Screen background |
| `surf` | #1C100A | #FFFFFF | Cards, inputs, setting groups |
| `surf2` | #2C1910 | #F6E9DF | Secondary surfaces, chips, pills, today lane |
| `sheetSurf` | #1C100A | #FFFFFF | Bottom-sheet background |
| `line` | #3A2014 | #E6CDBE | Hairlines, input borders, handles |
| `text` | #FFF1E8 | #140A05 | Primary text |
| `muted` | #C9AE9F | #6E4F40 | Secondary text, labels |
| `soft` | #E8D3C6 | #5A3E31 | Tertiary text, idle chips |
| `acc` | #FF5A1F | #FF5A1F | Signal orange: primary buttons, now marker, switches on |
| `acc2` | #FF8A57 | #C93A0A | Orange used as text/icon on bg (AA-safe) |
| `hero` | #FF5A1F | #E8480F | Display headings |
| `ink` | #140A05 | #140A05 | Text on orange |
| `track` | #241510 | #F0DCCF | Bar tracks |
| `barPast` | #6B3A24 | #D9B4A0 | Past day bars |
| `barFut` | #3A2014 | #EED8CA | Future day bars |
| `sheetBg` | #FF5A1F | #140A05 | "Rest of today" day sheet |
| `sheetFg` | #140A05 | #FFF1E8 | Text on day sheet |
| `sheetLine` | rgba(20,10,5,.18) | #2E1C12 | Row dividers on day sheet |
| `sheetTime` | #140A05 | #FF7A45 | Times on day sheet |
| `navBg` | #140A05 | #FFFFFF | Floating nav |
| `navIdle` | #E8D3C6 | #5A3E31 | Idle nav labels |
| `navOnBg` | #FF5A1F | #140A05 | Active nav pill |
| `navOnFg` | #140A05 | #FFF1E8 | Active nav label |
| `plusBg` | #FFF1E8 | #FF5A1F | Nav + button |
| `scrim` | rgba(8,4,2,.62) | rgba(20,10,5,.42) | Behind sheets/dialogs |
| `ok` | #B5E36A | #3F7A12 | Success, "New" tags |
| `warn` | #FFC15E | #8F5A00 | Stamps, "Moved" tags |
| `err` | #FF8F8F | #B42318 | Errors, destructive text |
| `toastBg` | #FFF1E8 | #140A05 | Toast |
| `toastFg` | #140A05 | #FFF1E8 | Toast text |

Category colours (dark / light): Sermon Sync #FF5A1F/#E8480F, WellServices #FFC15E/#C98A00, Prayers #F2D3A0/#B9842F, Speedwatch Ontario #FF8F8F/#D94141, Class #8FB0FF/#3D6FD9, Study #5FD8BE/#12917A, Gym #B5E36A/#5E9A1E, Meal #8A6A5C/#B89A8A, Break #5A3A2A/#D9C2B4. New-category palette (name → dark / light; the server maps AI `palette` names with this table, defined once in `packages/tokens`):

| Palette | Dark | Light |
|---|---|---|
| Orange | #FF5A1F | #E8480F |
| Amber | #FFC15E | #C98A00 |
| Wheat | #F2D3A0 | #B9842F |
| Coral | #FF8F8F | #D94141 |
| Blue | #8FB0FF | #3D6FD9 |
| Teal | #5FD8BE | #12917A |
| Lime | #B5E36A | #5E9A1E |
| Mint | #9FE0D0 | #2BA58A |
| Sky | #9EC1E0 | #4C86B8 |
| Rose | #F5A3C7 | #C2417E |
| Sand | #E8C99A | #A87A3A |

Contrast pairings (AA): `text` on `bg`/`surf`; `ink` on `acc` (6.2:1); `acc2` on `bg`; `sheetFg` on `sheetBg`. Never white text on `acc` (3.1:1).

## Typography roles

| Role | Font | Size / line | Use |
|---|---|---|---|
| Display XL | Anton 400 | 100 → auto-fit down to 26 (hero title), lh .9 | Day "Right now" title, auto-shrinks per longest word to fit width |
| Display L | Anton 400 | 52–76, lh .9 | Page titles ("Routines", "Set up your week") — auto-fit |
| Countdown | Anton 400 | 72, lh .9; colon blinks 1s (off with Reduce Motion) | Time left |
| Numeral S | Anton 400 | 15–28 | Times in lists, hours totals, dates in lanes |
| Wordmark | Outlined Anton caps (SVG, never live text) | — | Brand only |
| Title | SF Pro (system) 700 | 17–20 | Section heads |
| Body | SF Pro 500–600 | 15–17 / 1.35 | Content |
| Label | SF Pro 700 | 13, uppercase optional | Field labels, captions |
| Micro | SF Pro 700–800 | 10.5–12 | Widget labels |

Font stack: `Anton` bundled via expo-font (OFL) for display; system font everywhere else (`System` in RN = SF Pro). All text scales with Dynamic Type; Anton display sizes scale proportionally and auto-fit (`adjustsFontSizeToFit` with min scale ≈ .3).

## Spacing, shape, and elevation
- Screen side padding 20; section gap 14–22; list row min height 48–54; touch targets ≥ 44.
- Radii: buttons 18 (height 54), secondary buttons 16 (50), chips 18 (36), inputs 16 (52), cards 22–28, sheets 28 top, dialogs 22, nav 20, widgets 22–24, app icon squircle (system).
- Elevation: nav `0 14 34 rgba(20,10,5,.45)`; sheets slide over scrim; notification card `0 18 40 rgba(0,0,0,.35)` with 24pt blur; widgets inner top highlight 1px white 14–28%.

## Components and states
- **Floating nav**: 4 equal cells (Day, Week, Month, +), 54 tall, inset 28 from edges, 24 from bottom. On Day, scrolling the day sheet down >24pt collapses it to a centred pill (current view + ↑, + button), insets 120; scrolling up expands.
- **Day hero**: "• Right now / Up next / All done" label in `acc2`, title (Display XL), countdown + "left, ends 2:30 pm", day bars (each block a bar, height = category weight, current = `acc`, past = `barPast`, future = `barFut`), axis "9 am · 28% of the day gone · 12 am".
- **Day sheet** ("Rest of today"): orange (dark) / ink (light) sheet, rows `time · title · duration`; quiet blocks lighter weight; tap row → Edit block sheet.
- **Buttons**: primary (`acc`, Anton 20, ink), secondary (`surf2`, SF 15/600), dashed (`acc2` border), destructive text (`err`). Disabled 45% opacity. Busy shows spinner, keeps width.
- **Switch**: 46×28, on = `acc` with ink knob.
- **Inline message** (v11 `.inl`, D-45): one sentence, SF 14/500 `soft`, line 20; key words bold in `text` or bold `err` ("hot"); the fix as a bold `acc2` text link. Fades up 4pt over 200ms (Reduce Motion: 120ms fade). Field problems are the field's error line with the link after it ("This email already has an account. **Sign in instead**"); page states sit under the title or above the list; settings problems sit under the setting ("Off in iPhone Settings, so it won't fire. **Turn them on**"). When there's a fix, the main button becomes the fix. Replaces the retired stamp notice and every boxed alert.
- **Offline pill** (v11 `.offpill`, D-46): 28pt, radius 14, `surf2`, an 8pt hollow ring (2pt `acc2` border) and SF 12/700 `soft` "Offline" or "Offline · N to sync", plus one muted 13/500 line saying what still works. On Day it sits under the date in place of the sync pill.
- **Fit strip** (v11 `.fit`, D-48): under the time fields in Add, Edit and Move, always shown while the times are valid. `track` box 66pt, radius 14; top row (y 7, 24pt, radius 7) the day's other blocks in category colours (quiet blocks 45%), bottom row (y 35) your block in `acc`; ticks every hour (every 2h past a 6h window) under it; header "Free X to Y" in `muted`. On a clash: the overlap hatched across both rows (135° `err` stripes at 38%, 3 on / 5 off, 1.5pt `err` edges, fades in 200ms), your block gets a 2pt `err` border, the header reads "Overlaps <block> by **N min**" (Anton) in `err` with "Keep both" on the right, and the next free slot of the same length (later that day) shows as a dashed `acc2` outline with an 8% `acc` fill; tapping it moves the block there. Keep both clears the hatch ("Sharing time with <block>", Undo) and the primary button reads "Add anyway" / "Move to <day> anyway".
- **Plain time/date fields** (D-49): the `.inp` box (52pt, radius 16, 1.5pt `line`, `surf`) with plain 15/600 text, no grey iOS capsule; the open field gets an `acc` border and the native wheel (time: 5-minute steps; date) opens once under the pair at full width; tapping the field again closes it.
- **Toast**: bottom, above nav, `toastBg`, one sentence, optional Anton action (Undo, Describe, Reapply). 4s; 6s with action.
- **Sheet**: handle, header (title + close), content; stacked sheets allowed (category picker over add). Dismiss by drag, scrim tap (unless destructive dialog), close. Add, Edit and Category open at the full-height (large) detent (D-47); short sheets (nudge, save, copy) fit their content and grow with it; content scrolls clear of the home indicator. No sheet squashes or clips its own sections.
- **Dialog**: centred, for destructive/irreversible only (discard, sign out, delete category, delete account).
- **Chips**, **segmented 2-way** (`seg2`), **day chips** (Mon–Sun), **stepper** (− n +), **setting rows** with value + chevron, **radio cards**.
- **Change card** (Review): tag (New/Moved/Changed/Removed), title, from → to (Anton), note, switch. Off = 50% opacity.
- **AI mark**: solid knob with slot + clockwise arrow (`assets/brand/ai-mark-paths.txt`, 24 grid, stroke 2). Replaces any sparkle.
- **Dial loader**: orange disc, 12 ticks, ink knob, orange indicator rotating 360° in 2.4s linear; each tick lights to 100% as the indicator passes and decays to 22% over 35% of the cycle. Reduce Motion: static.
- **App icon**: `assets/brand/app-icon/ios-{light,dark,tinted}.svg`; Liquid Glass via Icon Composer layers (`dialed-icon-composer.zip`).

## Motion and feedback
| Moment | Motion | Haptic (iOS) |
|---|---|---|
| Push page | slide in 18pt + fade, 320ms cubic-bezier(.2,.8,.2,1) | none |
| Day hero | title rises 36pt + fade 600ms ease-out; bars grow from bottom 800ms (.16,1,.3,1) stagger 30ms; nav rises after 150ms | none |
| Week lanes | wipe left→right, 50ms stagger | selection on Lanes/Cards switch |
| Cards | slide from right, snap per card | selection on snap |
| Month | bars rise, 20ms stagger | none |
| Sheet | up 400ms decelerate; scrim 250ms | none on open |
| Dialog | pop 92%→100% 280ms | warning on destructive confirm |
| Toggle/switch | 200ms | selection |
| Save/approve | — | success |
| Validation error | errors fade in, focus first | warning |
| Remove (undoable) | row collapse | light |
| Launch | mark scales in; indicator turns −170°→0 with overshoot 1s; wordmark rises at 750ms; total ≈1.6s | none |
| Notification card | drops from top 450ms | system |
Reduce Motion: replace movement with 120ms fades; loader static; countdown colon steady. Never vibrate every tap; navigation is silent.

## Screen anatomy
Header (50pt top inset; back link in `acc2` or date label; right: avatar, AI mark button, theme) → hero/title → content (scroll) → floating nav (Day/Week/Month only) → toasts above nav. Bottom CTA screens (Review, Found classes, Pick calendars) pin the primary button 24pt from bottom with an orange glow shadow.

## Platform deltas
- iOS native: use real `UISheetPresentationController`-style sheets (react-native bottom sheet with detents), native date/time pickers, `expo-haptics` mapping above, system share sheet for export, native Sign in with Apple button (`expo-apple-authentication`), iOS Files picker (`expo-document-picker`), camera (`expo-image-picker`/`expo-camera`), Photos.
- Widgets and Live Activity are SwiftUI (WidgetKit/ActivityKit) in the extension target; they use the same tokens (exported to `ios/DialedWidgets/Theme.swift` from a single tokens JSON) and bundle Anton.
- Android (later): Material motion durations, no Live Activities; widgets via Glance.
