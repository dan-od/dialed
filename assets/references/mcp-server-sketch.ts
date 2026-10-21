// Sketch of how the planning guide lives inside the schedule app's MCP server.
// Any MCP client (Claude, or another LLM if the app goes public) gets the same knowledge.
// Package: @modelcontextprotocol/sdk (TypeScript). The db and auth helpers are placeholders.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { db, currentUser, renderGuide, validateProposal } from "./app"; // your code

const GUIDE_TEMPLATE = readFileSync(new URL("./planning-guide.md", import.meta.url), "utf8");

// 1. Server instructions: every client receives this on connect, before any tool call.
const server = new McpServer(
  { name: "schedule", version: "0.1.0" },
  {
    instructions:
      "This server manages one person's weekly schedule. Before planning, read the resource " +
      "schedule://planning-guide (or use the plan_schedule prompt). Tools only read the schedule " +
      "or propose changes. Nothing is saved until the user approves in the app.",
  }
);

// 2. The guide as a resource, filled in with this user's profile each time it's read.
server.registerResource(
  "planning-guide",
  "schedule://planning-guide",
  { title: "Planning guide", description: "How to turn a request into proposed schedule changes for this user.", mimeType: "text/markdown" },
  async (uri) => {
    const user = await currentUser();
    const profile = await db.profiles.get(user.id); // priorities, day bounds, limits, custom phrases
    return { contents: [{ uri: uri.href, text: renderGuide(GUIDE_TEMPLATE, user, profile) }] };
  }
);

// 3. The same guide as a prompt, for clients that start a planning task from a prompt.
server.registerPrompt(
  "plan_schedule",
  { title: "Plan my schedule", description: "Turn a plain-language request into proposed changes.", argsSchema: { request: z.string() } },
  async ({ request }) => {
    const user = await currentUser();
    const guide = renderGuide(GUIDE_TEMPLATE, user, await db.profiles.get(user.id));
    return { messages: [{ role: "user", content: { type: "text", text: `${guide}\n\n---\nRequest: ${request}` } }] };
  }
);

// 4. Read tools.
server.registerTool(
  "get_schedule",
  {
    title: "Get schedule",
    description: "Routines, blocks, exceptions and per-day totals for a date range. Times are in the user's time zone.",
    inputSchema: { from: z.string().describe("YYYY-MM-DD"), to: z.string().describe("YYYY-MM-DD") },
  },
  async ({ from, to }) => json(await db.schedule.range((await currentUser()).id, from, to))
);

server.registerTool(
  "list_categories",
  { title: "List categories", description: "Every category with its group, aliases, colour and usual block length. Match against these before creating a new one.", inputSchema: {} },
  async () => json(await db.categories.list((await currentUser()).id))
);

server.registerTool(
  "get_recent_plans",
  { title: "Recent plans", description: "The last 10 planning requests, what was proposed, and whether each was approved or declined.", inputSchema: {} },
  async () => json(await db.plans.recent((await currentUser()).id, 10))
);

// 5. The only "write": a draft for the user to review. The server re-checks every rule here.
const Slot = z.object({ day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]).optional(), date: z.string().optional(), start: z.string(), end: z.string() });
const Change = z.object({
  type: z.enum(["add_block", "move_block", "resize_block", "remove_block", "create_category", "add_exception"]),
  routine_id: z.string().optional(),
  block_id: z.string().optional(),
  title: z.string(),
  category_id: z.string().optional(),
  new_category: z.object({ name: z.string(), group: z.string(), color: z.string() }).optional(),
  from: Slot.optional(),
  to: Slot.optional(),
  repeat: z.object({ every: z.literal("week"), from: z.string(), until: z.string() }).optional(),
  note: z.string().describe("One plain sentence to the user explaining this change."),
});

server.registerTool(
  "propose_changes",
  {
    title: "Propose changes",
    description:
      "Send a proposal for the user to review in the app. Does NOT change the schedule. " +
      "Returns validation errors if a change breaks a rule, so fix and resend. Use the same proposal_id to revise.",
    inputSchema: { proposal_id: z.string().optional(), summary: z.string(), changes: z.array(Change).min(1) },
  },
  async (proposal) => {
    const user = await currentUser();
    const result = await validateProposal(user.id, proposal); // overlaps, day bounds, limits, class protection
    if (!result.ok) return json({ ok: false, errors: result.errors });
    const saved = await db.plans.saveDraft(user.id, proposal, result.impact, result.checks);
    await notifyApp(user.id, saved.id); // the review screen pops up on the phone
    return json({ ok: true, proposal_id: saved.id, status: "waiting_for_approval", impact: result.impact, checks: result.checks });
  }
);

server.registerTool(
  "ask_user",
  { title: "Ask the user", description: "Ask one short question with 2 or 3 options when the request can't be planned as written.", inputSchema: { question: z.string(), options: z.array(z.string()).min(2).max(3) } },
  async (q) => json(await db.plans.saveQuestion((await currentUser()).id, q))
);

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}
declare function notifyApp(userId: string, planId: string): Promise<void>;

export { server };
