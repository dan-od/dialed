# Flow_06 interaction sweep
## Interaction map
Composer: back, text box, starter chips ×4, send, recent plan rows. Drafting: Cancel. Question: option buttons ×2–3, Something else. Review: back (Plan it), Discard, switches per change, reply input + send, Approve, Redo (stale). Error: Try again / Got it, Edit my request. Done: See this week, Back to Routines. AI settings: radio ×2, provider chips ×4, key/URL field, Test.
## Surface decisions
Pages throughout (reading, comparing, deep links from notifications). Discard dialog only. No sheets: Review needs full height.
## Spawned surfaces
Notification permission is not requested here (plan pushes use the permission granted elsewhere; if not determined, ask once after the first successful plan with a short sheet "Get told when plans are ready?" — ASSUMED).
## Hidden states
App killed while drafting (plan continues; push opens Review); two devices reviewing the same plan (toggles last-write-wins; approve once — second gets the Done state); plan ready but schedule changed (stale); provider key revoked mid-plan (error `provider_key_invalid`); server key daily limit hit mid-day; user switches provider while a plan drafts (current plan continues on old provider).
## Edge cases
Very long request (4000 cap with counter at 3500+); non-English request (engine responds in the request language — ASSUMED); request with no schedule effect ("thanks!") → question or error "Nothing to change."; plan touching past dates (validator rejects past routine edits; one-offs in the past not allowed); approving with all switches off (disabled); reply that contradicts the whole plan (full re-draft).
## Micro-interactions
Impact numbers animate (numeric transition) when toggling; switch slide 200 ms; starter chips insert text and place cursor at end.
## Motion and interruption
Leaving Drafting doesn't cancel; Cancel does. Back from Review keeps plan `ready`. Approve is not interruptible after tap (server txn); UI shows spinner until result.
## Feedback and semantic haptics
Selection on switches/answers; success on Approve and on key test OK; warning on stale, errors, discard.
## Gaps found
Plan-notification permission ask is a D-35 surface (prototype + owner approval); response language behaviour ASSUMED.
