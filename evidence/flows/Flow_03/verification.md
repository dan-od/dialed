# Flow 03 — verification (first vertical slice: Day)

Data: the owner's seeded Fall 2026 routine in Postgres, pulled through `GET /v1/sync/pull?since=0` into on-device SQLite.
Clock states use a dev-only clock (long-press the date; `__DEV__` only, compiled out of release builds).

| Requirement | Implementation | Automated | Runtime | Status |
|---|---|---|---|---|
| resolveDay parity + 64.3 h week | `packages/schedule` (same code on device and server) | 21 golden/rule tests; runtime_proof resolves from synced rows | runtime-proof.json | passed |
| Hero three states | `day/model.ts`, `DayHero` | jest `dayModel.test.ts` at 795/1220/1410 (prototype numbers) | day-1315/free-2020/done-2330 × dark/light | passed |
| Minute boundary update | `clock/useClock` (minute-aligned, pauses in background) | — | not recorded | unverified (no fake-timer test or recording yet) |
| Offline read + queued edit | `SQLiteStore`, `SyncEngine` outbox | jest `syncEngine.test.ts` (7) | day-offline.png (API down, cold launch), day-offline-queued.png ("1 to sync"), day-after-sync.png | passed (API unreachable; true airplane-mode network loss not reproducible in the Simulator) |
| Sync pill + toast | `SyncPill`, engine events | jest | pill screenshot; "Synced 1 change." toast fired before capture | partial (toast not captured) |
| Conflict toast + Reapply | engine `conflict` → toast | jest (two writers) | — | passed (automated only) |
| Week lanes / cards / month | placeholders | — | — | not started (outside this session's scope) |
| Nav collapse on scroll | `FloatingNav`, `RestOfToday` | — | not recorded | unverified |
| Empty-Day setup chooser | `SetupChooser` | — | setup.png (new account after verify) | passed (options show "next build step" toast until Flows 02/05/06) |
| VoiceOver labels | hero single element, rows "Edit …, 2:30 pm", nav tabs | — | not run with VoiceOver | unverified |

## Fidelity deltas vs prototype v9
- Day bounds come from the profile (D-31/D-37). The owner's day starts 7:30 am, so the axis reads "7:30 am" and percents are 35/78/97 % (prototype, at 9 am: 28/76/97 %). The jest test checks the prototype numbers with 9 am bounds.
- "1 blocks" / "0 blocks" in the prototype → "1 block" / "0 blocks" (pluralised).
- "Tomorrow starts at 8:10 am with your Cryptography lecture." is computed from tomorrow's first work block (the prototype hard-codes it). With the seed it reads the same.
- Rest-of-today rows list blocks that haven't started (prototype behaviour; the flow file says "from now on").
- Toast in light mode: toast and Rest-of-today sheet share the ink colour, so the toast bubble is hard to see over the sheet (tokens as specified). Design follow-up.
- Light-mode stamp (ink on #8F5A00) is about 3.4:1, below AA for 15 pt text — reproduced exactly as the prototype; flagged.
- Anton headlines: line height .9 reproduced by measuring lines and drawing each at natural height (iOS clips caps when lineHeight < the font's natural line).
- Not compared at 375×667 (no iPhone SE runtime installed) — unverified.
