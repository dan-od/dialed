# Cold-reader review record

## Round 1 — independent agent, foundation only (2026-10-20)
4 BLOCKER, ~20 MAJOR, ~10 MINOR findings. Resolution:
- Blockers that need the owner became explicit decisions: CLIENT_QUESTIONS 0a (Apple Developer enrolment), 0b (six unprototyped screens, D-35), #3 (domain; local fallback). Calendar auto-approve removed: imports use Review (D-36).
- Sync pull returned nothing for seeded/server-written data → `since=0` full snapshot + `recordChange` for every server write (BACKEND §4).
- Schema: runner-owned schema_migrations; composite (id, user_id) FKs; users.version/week_start; plans.version/proposal_id/idempotency_key/range; create_term/update_term; live_activities; category_merges.
- Approve: plan_version + stored base_revision + re-validation in the transaction; stale defined via change_log.
- One effective-date table; compound mutations (routine_save, routine_block_edit, category_*); PlanChange → data mapping; soft day-bounds/quiet-hours checks; owner seed day start 7:30.
- One canonical Live Activity shape; per-activity push tokens; Flow 09 before 08; 08 as parallel native track; "unverified by design" rows.
- auth_smoke staged (passed:null), bob plan seeded; golden fixtures committed (timetable PNG/PDF/scanned PDF/DOCX + expected classes from REF-002; plan fixtures); gate schemas in BUILD_AGENT.
- Security: CF-Connecting-IP trust, reset token in fragment, email tombstone, SSRF IP pinning, attempts cap, per-user connector revoke, client name + redirect host.
- Reviewer's 64.3→65.8 h objection was withdrawn in round 2 (Friday Speedwatch is 1h15).

## Round 2 — same agent re-check
Confirmed the round-1 fixes and replayed the DB independently (fingerprint d96f06751cffd5dea494920ebb5fe11d). Remaining items fixed by the orchestrator:
- Approval-pending D-35 screens → feature-flagged, "unverified by design", non-blocking; all six tracked as NAT-07, -06, -11, -12, -13, -14.
- Fixture overlap on Wed Oct 21 → `close_from` on moved changes; WellServices closes Wednesdays from Oct 21.
- update_term change for existing-term date edits (no self-staleness); PATCH accepts payload for term changes.
- quiet_hours / outside_term moved to soft checks; uncovered dates dropped with a check; 11 palette pairs listed; routine_block_edit `reopen`; fixed test clock 2026-10-20; quiet hours owned by users only; apple_identities row deleted on account deletion; DoD accepts unverified-by-design rows; Flow 03 owns the setup chooser; D-35/D-36 marked ASSUMED pending owner confirmation.

Round-2 fixes were self-checked (DB replay, coverage uniqueness, Gate 1) but not re-reviewed by a third pass: **self-reviewed, lower assurance** for those items.
