# Flow 06 plan screens vs prototype v11 (owner review 2026-11-12)

Plan: `plans/flow-06-ui.md`. Sheet: `evidence/flows/flow06-sheet-v11.png` (prototype left, app right, per state).

- `proto/`: prototype states rendered by headless Chrome from `assets/references/dialed-flow-prototype.html`
  (console pathways `plan`, `planLoading`, `review`, `review` scrolled, `planQuestion`, `planError`,
  `planError-exhausted`, `planDone`, `review-stale`).
- `app/`: iPhone 17e Simulator, dev client, dark, Maestro `e2e/plan_v11.yaml`. Dev API `AI_MODE=fixture`,
  `DEV_CLOCK=2037-10-20T12:00:00-04:00`; app dev clock preset 1 (Mon 19 Oct 2037). The drafting screen uses the
  evidence-only `slow` fixture (9 s delay on the first call).
- `e2e/plan_v11_reply.yaml`: review bottom (week box, Ask for changes) and the reply route → 200 → review again;
  discard → 204.

## Result (one pass)
Matches: titles (`.h1` Anton, hero, left; 56/52/42/48/52/56), composer card with label, footer line and send button
inside; four chips; Recent plans rows (Anton date, text, status colour); Cancel pill; 132 pt dial with ticks;
steps with orange checks, 0.4 s apart; change cards with coloured kind tags, struck-through old time → new time;
week box with the plan's real days; ✓/⚠ check lines; Ask for changes; Approve with shadow; question card with
the AI mark + `aiName()`, left-aligned answers; error back link, cause-specific title, Try again / Got it, Edit
my request, "Attempt N of 3." below; done 84 pt check, "<term> updated", ok-check rows.

Differences kept on purpose (owner to confirm):
- Error titles follow the cause (`provider_error`: "Claude had a problem"; `timeout`: "didn't answer within 60
  seconds"), as the owner asked, instead of the prototype's single "Claude didn't answer … 30 seconds".
- Exhausted sentence omits the prototype's "We'll keep trying in the background and notify you": nothing queues
  a background retry yet (`plan.retry` has a handler only).
- Stale review: "Out of date." + "Your schedule changed after Claude drafted this…" (the app doesn't know which
  edit it was). Not captured at runtime (needs a server edit mid-draft); the state renders from `status=stale`.
- Done sub: "Changes start <this Wednesday | today | date>" from the plan's first affected day.

Found and fixed while capturing: approve's response (`{revision, applied, effective_from}`) was stored as the
plan, which crashed the new review render; the plan screens read the device date instead of the app clock.
