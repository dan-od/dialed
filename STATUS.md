# STATUS

Keep this under 15 lines. Update at the end of every session.

**Done (evidence in `evidence/flows/`):** scaffold + shared foundation, Flow 01 Account, 03 See schedule, 04 Block changes, 05 Routines & terms, 09 Settings, 06 Plan with AI, **07 Plan from an AI app** (2026-11-07: `Flow_07/verification.md`, `flow07-sheet-1.png`; fixed an OAuth open redirect, `list_categories`, read audit, 500-on-rate-limit, connector UI flag/feedback/confirms; D-64…D-69). Design v11 applied.

**Flow 07 unverified by design:** OAuth sign-in/consent pages and the Disconnect-all dialog (D-35 stop point, need prototype review + owner approval); real Claude connector (needs public HTTPS, CQ #3); push banner + haptics (device). Visual deltas listed in its verification.md.

**Flow 02 is NOT code complete** (found 2026-11-07): server + tests green (imports 7/7, planning 56/56), but the mobile Found N classes page, No classes found / Partial read / Limit / offline states and the post-Approve toasts aren't built; timetable goes straight to Flow 06 Review. Needs a plan (`plans/flow-02.md`) and owner approval before Maestro proof.

**Local dev:** migration 0003 now applied to the dev DB; dev client rebuilt with `expo-clipboard`. Dev API run via `/tmp/f07-api.sh` (MCP_ENABLED=true, DEV_CLOCK 2037-10-20). `dev_evidence_cleanup` also removes plan/import rows and connector clients/tokens.

**CI:** epoch 2037/2038; audit ignores GHSA-mrhx-c7xc-m3w5 (zod in @expo/cli).

**Next:** owner decision on Flow 02 gaps; consent page prototype review (D-35). Then Flow 08 Glance (physical iPhone).
