import {
  daysBetween,
  isIsoDate,
  resolveRange,
  type IsoDate,
  type ScheduleData,
  type Term,
} from '@dialed/schedule';
import type { ToolCall, ToolResult } from './providers/types';
import type { PlanningContext } from './context';

/** Read tools shared by the in-app engine and the MCP server (mcp/tools.md), so both return the same JSON. */

export const MAX_SCHEDULE_DAYS = 120;

const clock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function termStatus(
  t: Pick<Term, 'starts_on' | 'ends_on' | 'is_draft'>,
  today: IsoDate,
): string {
  if (t.is_draft) return 'draft';
  if (t.ends_on < today) return 'past';
  if (t.starts_on <= today) return 'active';
  return 'upcoming';
}

export function getSchedule(
  data: ScheduleData,
  from: IsoDate,
  to: IsoDate,
  meta: { timeZone: string; revision: number },
) {
  const days = resolveRange(from, daysBetween(from, to) + 1, data);
  return {
    time_zone: meta.timeZone,
    revision: meta.revision,
    days: days.map((d) => ({
      date: d.date,
      weekday: d.weekday,
      term_id: d.term_id,
      blocks: d.blocks.map((b) => ({
        key: b.key,
        routine_block_id: b.routine_block_id ?? null,
        title: b.title,
        category_id: b.category_id,
        start: clock(b.start_min),
        end: clock(b.end_min),
        quiet: b.quiet,
        protected: b.protected,
        source: b.source,
      })),
    })),
  };
}

export function listTerms(data: ScheduleData, today: IsoDate) {
  return {
    terms: data.terms
      .filter((t) => !t.deleted_at)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
      .map((t) => ({
        id: t.id,
        name: t.name,
        starts_on: t.starts_on,
        ends_on: t.ends_on,
        status: termStatus(t, today),
      })),
  };
}

export function listCategories(data: ScheduleData) {
  const lengths = new Map<string, number[]>();
  for (const b of data.routineBlocks) {
    if (b.deleted_at) continue;
    const list = lengths.get(b.category_id) ?? [];
    list.push((b.end_min - b.start_min + 1440) % 1440);
    lengths.set(b.category_id, list);
  }
  return {
    categories: data.categories
      .filter((c) => !c.deleted_at)
      .sort((a, b) => a.sort - b.sort)
      .map((c) => {
        const l = lengths.get(c.id);
        return {
          id: c.id,
          name: c.name,
          group: c.group_name,
          color: c.color_dark,
          quiet: c.quiet,
          protected: c.protected,
          usual_minutes: l?.length ? Math.round(l.reduce((s, x) => s + x, 0) / l.length) : 60,
        };
      }),
  };
}

/** Problem with a get_schedule range, or null when it's fine. */
export function scheduleRangeError(
  from: string,
  to: string,
): { error: string; message: string } | null {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
    return { error: 'bad_request', message: 'Use from and to as YYYY-MM-DD, from first.' };
  }
  if (daysBetween(from, to) + 1 > MAX_SCHEDULE_DAYS) {
    return { error: 'range_too_long', message: `Maximum ${MAX_SCHEDULE_DAYS} days.` };
  }
  return null;
}

export const READ_TOOL_SCHEMAS = [
  {
    name: 'get_schedule',
    description:
      'Resolved days for dates OUTSIDE the context window in your first message (inclusive range, ' +
      'YYYY-MM-DD). Dates inside the window are already in the context.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    name: 'list_terms',
    description:
      'All terms with dates and status. The context already lists them; use this only if it does not.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_categories',
    description: 'Every category with its group, colour and usual block length (minutes).',
    input_schema: { type: 'object', properties: {} },
  },
];

/** Answers a read-tool call inside the in-app loop; null when the call isn't a read tool. */
export function runReadTool(
  call: ToolCall,
  ctx: { data: ScheduleData; today: IsoDate; timeZone: string; revision: number },
  context?: PlanningContext,
): ToolResult | null {
  const result = (output: unknown, is_error = false): ToolResult => ({
    id: call.id,
    name: call.name,
    output,
    is_error,
  });
  switch (call.name) {
    case 'get_schedule': {
      const from = String(call.input.from ?? '');
      const to = String(call.input.to ?? '');
      const bad = scheduleRangeError(from, to);
      if (bad) return result(bad, true);
      if (context && from >= context.from && to <= context.to) {
        return result(
          {
            error: 'in_context',
            message: `${from}..${to} is already in your context. Plan from it.`,
          },
          true,
        );
      }
      return result(getSchedule(ctx.data, from, to, ctx));
    }
    case 'list_terms':
      return result(listTerms(ctx.data, ctx.today));
    case 'list_categories':
      return result(listCategories(ctx.data));
    default:
      return null;
  }
}
