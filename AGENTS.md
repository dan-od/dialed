# AGENTS.md — Dialed build constitution

You are building **Dialed** (working name; read it from `APP_NAME`): a native iOS schedule app (Expo / React Native / TypeScript) with a Node/TypeScript + Postgres backend on the owner's home lab, a provider-agnostic AI planning engine, and an MCP connector. This file is the constitution. Tool-specific files (`CLAUDE.md`, `.cursorrules`) must only point here.

## Product truth (never violate)
1. Nothing changes the Planner's schedule without their **Approve** tap. No AI path writes schedule data (D-06).
2. Work blocks get a Live Activity; quiet blocks (meals, breaks) show in the line under the date; "Line only" disables Live Activities (D-07).
3. Every glance surface always shows relevant, current content (D-08).
4. Routine edits are effective-dated; past days never change.
5. The app works offline for reading and editing; sync is automatic and conflicts are explained, never silent.
6. Every AI (in-app provider or MCP client) gets the same planning guide and the same server-side validator.
7. The approved prototype `assets/references/dialed-flow-prototype.html` (v8) is the UI source of truth. Open it in a browser and use the right-hand console to jump to any state.

## Locked decisions
See `00_Brief_Analysis.md` decision register. LOCKED: D-01…D-08, D-27, D-28, D-30. D-35/D-36 are ASSUMED but treated as binding until the owner answers. APPROVED: D-09, D-10. Everything else is ASSUMED and reversible — implement it, and list it in your final report.

## Document map
| Need | File |
|---|---|
| Why, who, scope, decisions | `00_Brief_Analysis.md`, `CLIENT_QUESTIONS.md` |
| Words | `CONTEXT.md` |
| Product map | `PROJECT_BIBLE.md` |
| Flows, order, edges | `00_Flow_Map.md`, `00_Flow_Contracts.md`, `00_Surface_Coverage.md` |
| Per-flow behaviour | `flows/Flow_XX_*.md`, `Sub_Interactions/Flow_XX_sub_interactions.md` |
| Look and feel | `Design_Identity/design-identity.md`, `assets/brand/` |
| Architecture, data, API, sync, AI, push | `BACKEND_SETUP.md`, `backend/migrations/0001_init.sql`, `backend/seed/0001_seed.sql` |
| AI contract | `mcp/tools.md`, `mcp/planning-guide.md` |
| Security | `SECURITY.md` |
| Env | `.env.example` |
| How to build | `BUILD_AGENT.md`, `BUILD_PROMPT.txt` |
| Proof | `verification/commands.json`, `BUILD_VERIFICATION.json` (you create), `evidence/` |

## Conflict hierarchy
user instruction > this constitution > `SECURITY.md` and data rules > `00_Flow_Contracts.md` > `BACKEND_SETUP.md` and `Design_Identity` > individual flow files > prototype details > builder judgment.
When the prototype and a flow file disagree, the flow file wins only where it names the change (e.g. D-13, D-14, D-32); otherwise ask.

## Build order
`00_Flow_Map.md` → Dependency order: 0-scaffold → shared-foundation → 01 → 03 (first vertical slice) → 04 → 05 → 09 → 06 → 02 → 07, with 08 as a parallel native track after 05. One main-line flow in flight unless contracts are stable and workspaces isolated.

## Proof requirements
Per flow: failing test first; every state in the flow file implemented; security pass 2; accessibility pass; real Simulator run with recording/screenshots in `evidence/flows/Flow_XX/`; physical-iPhone proof for Flow 08 push/Live Activity/haptics. Report separately: automated, static, runtime, unverified.

## Stop conditions (ask the owner)
App Store / TestFlight submission; production deploy to the home lab; DNS or Cloudflare changes; purchasing anything (Apple Developer Program, domains, email, AI credits); entering real secrets; legal text acceptance; deleting real data; any claim about physical-device behaviour without a device run; any production UI that departs from the prototype (the six surfaces in D-35) without a flow-prototype approval.

## Repository rules
- pnpm workspaces; TypeScript strict; ESLint + Prettier; Swift for the widget/LA target only.
- Lockfiles committed; exact versions recorded in `BACKEND_SETUP.md §Versions`.
- Migrations: new forward files only; never edit an applied migration.
- No secrets in git; `.env` is git-ignored; redaction tests must pass.
- No analytics SDKs (D-20). No new runtime dependency without a one-line justification in the PR/commit.
- Commit per green step with a message naming the flow (e.g. `flow-03: day hero states`). Push only if the owner asked.
- Copy: plain, short, second person; use `CONTEXT.md` terms; the AI is named via `aiName()`.
