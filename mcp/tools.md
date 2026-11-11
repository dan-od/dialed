# Dialed MCP surface (contract)

Server name `dialed`, version from package. Transport: Streamable HTTP at `${PUBLIC_BASE_URL}/mcp`. Auth: OAuth 2.1 bearer (see SECURITY.md). Same schemas back the in-app engine's in-process tools (`packages/planning/tools.ts`), defined once in `packages/contracts/mcp.ts` (Zod) and exported as JSON Schema.

## Instructions (sent on initialize)
"Dialed manages one person's weekly schedule. Read the resource dialed://planning-guide before planning. Tools only read the schedule or create drafts. Nothing changes until the person taps Approve in the Dialed app — tell them their plan is ready to review there."

## Resources
| URI | Content |
|---|---|
| `dialed://planning-guide` | `mcp/planning-guide.md` rendered for the user (text/markdown) |

## Prompts
| Name | Args | Returns |
|---|---|---|
| `plan_schedule` | `request: string` | user message = rendered guide + "Request: …" |

## Tools
All times are local wall-clock `HH:MM` 24h on a 5-minute grid; dates `YYYY-MM-DD` in the user's time zone. Read tools are annotated `readOnlyHint: true`.

### `get_context` → plain text (D-123)
The same schedule context the in-app engine puts in its first message: today and the next 14 days resolved, one line per block (`ref start-end title category flags`, `P` protected, `Q` quiet, `-` = one-off with no ref), then terms (`t1…`), categories (`c1…`) and the day limits. Ends with `context_id <revision>.<first date>`. Refs are stable for one revision and day. In `propose_changes`, `block_ref`, `category_id`, `term_id` and `fields.category_id` accept these refs or real ids; pass `context_id` so stale refs are refused (`context_stale`) instead of guessed. A typical week is well under 2k tokens.

### `list_terms` → `{ terms: [{ id, name, starts_on, ends_on, status }] }`

### `get_schedule`
Input `{ from: date, to: date }` (max 120 days).
Output `{ time_zone, revision, days: [{ date, weekday, term_id|null, blocks: [{ id, routine_block_id|null, title, category_id, start, end, quiet, protected, source: 'routine'|'one_off' }], work_hours }] }`

### `list_categories` → `{ categories: [{ id, name, group, color, quiet, protected, usual_minutes }] }`

### `get_recent_plans` → `{ plans: [{ id, created_at, source, client_name, request_text, status, changes: [{ kind, title, summary }] }] }` (last 10)

### `propose_changes`
Input:
```json
{
  "proposal_id": "optional uuid — same id revises an earlier draft",
  "request_text": "the person's words, verbatim",
  "context_id": "optional — from get_context; required for refs to be checked against the right revision",
  "changes": [
    {
      "kind": "new | moved | changed | removed | skip | create_category | create_term | update_term",
      "close_from": "2026-10-21 (moved, repeating: when the old weekday stops; defaults to repeat.from)",
      "title": "Bible study with Chichi",
      "block_ref": "routine_block_id or one-off block id (moved/changed/removed/skip)",
      "category_id": "existing id, or temp id of a create_category change in this draft",
      "new_category": { "temp_id": "c1", "name": "Bible study", "group": "Life", "palette": "Mint" },
      "new_term": { "temp_id": "t1", "name": "Winter term", "starts_on": "2027-01-05", "ends_on": "2027-04-16" },
      "repeat": { "weekday": "wed", "from": "2026-10-21", "until": "2026-12-31" },
      "on_date": "2026-10-24 (one-offs only)",
      "start": "19:00",
      "end": "20:30",
      "to_weekday": "sun (moved, repeating)",
      "to_date": "2026-10-25 (moved, one-off)",
      "note": "One plain sentence."
    }
  ],
  "checks": [{ "id": "weekly_limit_sermon", "passed": true, "detail": "14.6h of 15h" }]
}
```
Output: `{ proposal_id, status: "ready" | "invalid", errors: [{ change_index, code, message }], review_hint: "Ready to review in Dialed." }`

`palette` is one of the Design_Identity palette names (Orange, Amber, Wheat, Coral, Blue, Teal, Lime, Mint, Sky, Rose, Sand); the server maps it to the dark/light colour pair. `proposal_id` and the plan `version` are stored on `plans`.

Validator error codes: `bad_time`, `overlap`, `protected_block`, `unknown_block`, `unknown_category`, `unknown_ref` (a ref that isn't in the context), `context_stale` (refs from an older `get_context`), `too_many_changes`, `range_too_long`, `duplicate_change`. Soft checks (reported in `checks`, never errors): `outside_term` (uncovered dates dropped), `day_bounds`, `quiet_hours`, profile limits.

### `ask_user` (in-app engine only; not exposed over MCP)
Input `{ question, options: [string, string, string?] }` → plan status `question`; the app shows "One quick question".

## Limits
60 tool calls/min per token; 20 `ready` drafts/day per client per user; 25 changes per draft; `get_schedule` ≤ 120 days. In-app, `get_schedule` only answers dates outside the context window.

## On `ready` from MCP
Server stores the plan (`source: mcp`, `client_name` from OAuth client), enqueues `push.chat_draft` → notification "<Client> sent a plan from chat · 3 changes to Fall term. Review and approve here." → opens Review (Flow 06).
