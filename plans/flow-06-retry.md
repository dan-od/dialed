# Flow 06: background retry after 3 failed attempts (owner said yes, 2026-11-12)

Spec: `flows/Flow_06_Plan_In_App.md` lines 15 and 37: after 3 attempts, "Still can't reach <AI>", Got it, request
saved; the server retries once in the background and notifies. Prototype `scrError` (exhausted) sub: "Your request is
saved. We'll keep trying in the background and notify you when the plan is ready."

Today: `plan.retry` has a handler (`apps/api/src/jobs/handlers.ts`) but nothing queues it, and the handler's guard
(`attempts > 1 → return`) is from an older design.

## Server
1. Queue: at the end of `startPlanRun`, when the plan ends `failed` with a network code (`provider_error`,
   `server_error`, `timeout`), `provider_mode = server`, `attempts >= MAX_REDOS` (third attempt) and no retry yet,
   enqueue `plan.retry` 10 minutes out, dedupe key `plan.retry:<id>`, and set `bg_retry_at` to that time.
   Not queued for BYO plans (keys aren't stored, D-13), rule failures, key problems, daily limit or cancels.
2. Handler: runs only if the plan is still `failed` with `attempts >= MAX_REDOS` (the Planner hasn't edited,
   redone or cancelled it). One retry only: the second failure doesn't queue again because `bg_retry_at` is set.
   On `ready`/`question` it queues `push.plan_ready` (already skipped on the personal tier; APNs isn't on yet).
3. DTO: new `background_retry: 'queued' | 'tried' | null` on the plan (from the job row; no migration).
   `queued` while the job is queued/running, `tried` after it failed again.

## App
4. Exhausted copy: `queued` → the prototype sentence; `tried` → "We tried again in the background too. Try again
   later, or edit your request."; otherwise today's honest sentence (BYO etc.).
5. Notify (owner choice, see below). In both options the local notification is only for plans that the background
   retry finished, so it never repeats an old plan.
   - A, no new dependency: the app checks when it comes to the foreground and posts "Your plan is ready".
     You only hear about it the next time you open Dialed.
   - B, `expo-background-task` (the D-39 design in `BACKEND_SETUP.md §13`): iOS wakes Dialed now and then to check
     and post the notification while it's closed. iOS decides the timing (can be hours); native rebuild; needs a
     device run before I claim it works.

## Proof
API tests first: queues only on the third network failure; not for BYO / validation / earlier attempts; handler
runs once; ready → `push.plan_ready`; edited or cancelled plan → no run; failed again → `tried`. Mobile copy tests.
CI green, commit, push, Release to the iPhone. No new screenshots (the exhausted screen layout is unchanged).
