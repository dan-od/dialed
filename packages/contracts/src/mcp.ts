import { z } from 'zod';
import { PLAN_SOURCES, ProposeChangesInput, ProposeChangesOutput } from './plans';

const isoDate = z.iso.date();
const empty = z.strictObject({});

// mcp/tools.md — same schemas back the in-app engine's in-process tools (packages/planning/tools.ts).

export const ListTermsOutput = z.object({
  terms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      starts_on: isoDate,
      ends_on: isoDate,
      status: z.enum(['active', 'upcoming', 'draft', 'past']),
    }),
  ),
});
export type ListTermsOutput = z.infer<typeof ListTermsOutput>;

export const GetScheduleInput = z.strictObject({ from: isoDate, to: isoDate });
export type GetScheduleInput = z.infer<typeof GetScheduleInput>;

export const GetScheduleOutput = z.object({
  time_zone: z.string(),
  revision: z.number().int(),
  days: z.array(
    z.object({
      date: isoDate,
      weekday: z.number().int().min(0).max(6),
      term_id: z.string().nullable(),
      blocks: z.array(
        z.object({
          id: z.string(),
          routine_block_id: z.string().nullable(),
          title: z.string(),
          category_id: z.string(),
          start: z.string(),
          end: z.string(),
          quiet: z.boolean(),
          protected: z.boolean(),
          source: z.enum(['routine', 'one_off']),
        }),
      ),
      work_hours: z.number(),
    }),
  ),
});
export type GetScheduleOutput = z.infer<typeof GetScheduleOutput>;

export const ListCategoriesOutput = z.object({
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      group: z.string(),
      color: z.string(),
      quiet: z.boolean(),
      protected: z.boolean(),
      usual_minutes: z.number().int(),
    }),
  ),
});
export type ListCategoriesOutput = z.infer<typeof ListCategoriesOutput>;

export const GetRecentPlansOutput = z.object({
  plans: z.array(
    z.object({
      id: z.string(),
      created_at: z.iso.datetime(),
      source: z.enum(PLAN_SOURCES),
      client_name: z.string().nullable(),
      request_text: z.string(),
      status: z.string(),
      changes: z.array(z.object({ kind: z.string(), title: z.string(), summary: z.string() })),
    }),
  ),
});
export type GetRecentPlansOutput = z.infer<typeof GetRecentPlansOutput>;

/** In-app engine only (not exposed over MCP); the app shows "One quick question". */
export const AskUserInput = z.strictObject({
  question: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(3),
});
export type AskUserInput = z.infer<typeof AskUserInput>;
export const AskUserOutput = z.strictObject({ status: z.literal('question') });

export const PROPOSE_CHANGES_LIMITS = { in_app: 25, mcp: 25, timetable: 60, calendar: 60 } as const;

export const MCP_TOOLS = {
  list_terms: { input: empty, output: ListTermsOutput },
  get_schedule: { input: GetScheduleInput, output: GetScheduleOutput },
  list_categories: { input: empty, output: ListCategoriesOutput },
  get_recent_plans: { input: empty, output: GetRecentPlansOutput },
  propose_changes: { input: ProposeChangesInput, output: ProposeChangesOutput },
  ask_user: { input: AskUserInput, output: AskUserOutput },
} as const;
export type McpToolName = keyof typeof MCP_TOOLS;
export const MCP_TOOL_NAMES = Object.keys(MCP_TOOLS) as McpToolName[];

/** JSON Schema for one tool's input/output, for the MCP server's tool listing. */
export function mcpToolJsonSchema(name: McpToolName) {
  return {
    input: z.toJSONSchema(MCP_TOOLS[name].input),
    output: z.toJSONSchema(MCP_TOOLS[name].output),
  };
}
