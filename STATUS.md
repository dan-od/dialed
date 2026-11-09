# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings, 06 Plan with AI, **07 Plan from an AI app** (2026-11-07: `Flow_07/verification.md`, `flow07-sheet-1.png`; fixed an OAuth open redirect, `list_categories`, read audit, 500-on-rate-limit, connector UI flag/feedback/confirms; D-64…D-69). Design v11 applied.

**Flow 07 unverified by design:** OAuth sign-in/consent pages and the Disconnect-all dialog (D-35 stop point, need prototype review + owner approval); real Claude connector (needs public HTTPS, CQ #3); push banner + haptics (device). Visual deltas listed in its verification.md.

**Flow 02 First-week setup: gaps closed** (2026-11-07, `Flow_02/verification.md`, `flow02-sheet-1.png`, D-70…D-76): Found N classes, No classes found / Partial / Limit / Can't read, offline + camera-denied stamps, after-Approve toasts, calendar split preview. Fixed: legacy upload API that threw on device, timetable limit counting AI plan runs, stale term hint, AX1 button clipping. Unverified at runtime: offline chooser, calendar page/toast (no seeded calendar), SE size, live REF-002 read.

**Flow 08 Glance: done** (2026-11-08, `Flow_08/verification.md`, `flow08-sheet-1.png`, D-77…D-113): snapshot + line, 5 lock and 4 home widgets, LA server jobs + client + card, Customize. Simulator proof via dev-only `dialed://dev-glance` (D-113); fixed timeline label overlap. **Unverified:** lock widgets/line on the Simulator (lock editor not drivable), LA look (capture black), App Group on device (`APPLE_TEAM_ID`), push-to-start/end + back-to-back + haptics (paid account + iPhone).

**Local dev:** migration 0003 now applied to the dev DB; dev client rebuilt with `expo-clipboard`. Dev API run via `/tmp/f07-api.sh` (MCP_ENABLED=true, DEV_CLOCK 2037-10-20). `dev_evidence_cleanup` also removes plan/import rows and connector clients/tokens. **CI:** epoch 2037/2038; audit ignores GHSA-mrhx-c7xc-m3w5 (zod in @expo/cli).

**Next:** all flows built; owner reviews: Flow 08 sheet (D-108 LA deltas, D-100 seconds), Flow 02 sheet, consent page (D-35). Owner: `APPLE_TEAM_ID` (D-77); Apple Developer + iPhone for push/LA proof. Evidence: `./scripts/flow08_evidence` (signed build only).
