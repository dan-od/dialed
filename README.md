# Dialed — foundation pack (PRD)

This folder is the complete spec for building Dialed v1 with Claude Code.

## How to use it
1. Create an empty folder on your Mac (e.g. `~/code/dialed`), put the contents of this pack at its root, and `git init`.
2. Open Claude Code in that folder.
3. Paste the contents of `BUILD_PROMPT.txt` as the task. Claude Code reads `AGENTS.md` and the rest from there.
4. Answer the questions in `CLIENT_QUESTIONS.md` whenever you like; the build uses the recommended defaults until you do.

## What's inside
| File | What it is |
|---|---|
| `AGENTS.md` | The rules every build agent follows |
| `00_Brief_Analysis.md` | Goals, scope, decisions (D-01…D-35) |
| `00_Flow_Map.md` | The 9 flows and the build order |
| `flows/` | One spec per flow: states, actions, data, security, tests |
| `Sub_Interactions/` | Edge cases and interaction details per flow |
| `00_Flow_Contracts.md` | How flows hand off to each other |
| `BACKEND_SETUP.md` | Stack, data model, sync, API, AI engine, MCP, push, deployment |
| `SECURITY.md` | Threat model and rules |
| `Design_Identity/` | Colours, type, components, motion, haptics |
| `mcp/` | The AI connector contract and the planning guide every AI reads |
| `backend/` | Real SQL migration + seed (your Fall 2026 week), tested on Postgres 16 |
| `assets/references/dialed-flow-prototype.html` | The clickable prototype (v9) — open it in a browser; "New screens to approve" holds the six added screens |
| `assets/brand/` | Logo, icons, Icon Composer layers |
| `BUILD_AGENT.md`, `BUILD_PROMPT.txt` | Instructions for Claude Code |
