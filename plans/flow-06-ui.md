# Flow 06 plan screens: match prototype v11 (owner review 2026-11-12)

Source: `assets/references/dialed-flow-prototype.html` `scrPlan`, `scrPlanLoading`, `scrReview`, `scrQuestion`,
`scrError`, `scrDone` and their CSS. "Routine name" (`S.rName`) = the active term's name, as elsewhere in the app.

## Shared
- Titles: `H1` (`.h1`: Anton, `hero`, line .9, left). Sizes: Plan it 56, Drafting 52, Review 42, Question 48,
  Error 52, Done 56. The prototype's `.h1` sets no uppercase; titles render like sign-up's `H1`.
- `aiName()` wherever the prototype says Claude.
- New small pieces in `plan/ui.tsx`: `Pill` (`.pill`), `SendButton` (`.sendb`, 44 orange circle, up arrow),
  `CheckLine` (`.checkline` ✓ ok / ⚠ err), `PlanSteps` (`.steps`: 26 pt surf2 circle with acc2 check, 0.4 s
  stagger, 16/600), `FieldLabel` (`.flabel`).

## Screens
- **scrPlan** (`plan/index.tsx`): back "Back"; H1 56 + sub; offline inline line; composer card (surf, 1.5 acc
  border, radius 22, padding 14) with "What should change?" label, 5-row text, footer "Plans against your
  <term>" + send button inside; four chips (`.chip`: outline, 36 tall); "Recent plans" 16/700 heading; rows
  `.list-row`: date in Anton 16 muted (52 wide), text 14/500, status 12/700 (Approved = ok, else muted). No
  pinned Send.
- **scrPlanLoading** (`drafting.tsx`): header with Cancel pill right; H1 52 "Drafting your plan"; sub; DialLoader;
  steps "Reading your <term>", "Matching your categories", "Fitting it into your week", "Checking your limits".
- **scrReview** (`review.tsx`): back "Plan it" + Discard pill (transparent, muted); H1 42 "N changes to <term>";
  sub 13 with the quoted request; stale inline "Out of date." + sentence; change cards (`.chg`: tag colored by
  kind: New ok, Moved/Changed warn, Removed/Skip err; title 16/700; old time struck through → new time in Anton
  15; note 13 muted; switch); "What this does to your week" box: real rows from `planImpact` (changed weekdays
  of the affected week + Weekend + Week), "Xh to Yh", check lines; "Ask for changes" input + send → `reply`
  route → drafting; footer Approve (shadow) or, when stale, "Redo plan with the new week" → `redo` → drafting.
  Impact and old times are computed on the phone from the local schedule (`plan/impact.ts`, pure, tested),
  because the server sends `impact: []`.
- **scrQuestion** (`question.tsx`): back "Plan it"; H1 48 "One quick question"; card with AI mark + aiName in
  acc2, question 17/600; options as `.btn2`, text left, padding 16; "Something else, I'll explain" last (same
  style) returns to the composer with the text kept.
- **scrError** (`error.tsx`): back "Plan it"; H1 52 = `failureCopy` title; sub = body (+ reason); quote "Your
  request, saved"; "Try again" (or "Got it" when no retries left); "Edit my request" btn2; muted "Attempt N of
  3." below. Provider/timeout copy keeps the cause-specific titles.
- **scrDone** (`done.tsx`): 84 orange circle with ink check (pop); H1 56 "<term> updated"; sub "Changes start
  <day>. Past days stay as they were."; rows `.list-row` with ok checks; buttons inline below.

## Proof
Unit tests for `plan/impact.ts` and copy; tsc/lint/jest; Maestro capture of all six screens to
`evidence/flows/Flow_06/ui-v11/`, one contact sheet compared once with the prototype; Release to the iPhone.
