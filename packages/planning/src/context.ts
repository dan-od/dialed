import { addDays, resolveRange, weekdayOf, type IsoDate, type Minutes } from '@dialed/schedule';
import type { ToolContext } from './loop';
import { termStatus } from './read-tools';

/** Short refs the model uses in a draft, mapped back to real ids before validation. */
export interface RefMap {
  blocks: Record<string, string>;
  categories: Record<string, string>;
  terms: Record<string, string>;
}

export interface PlanningContext {
  text: string;
  refs: RefMap;
  revision: number;
  from: IsoDate;
  to: IsoDate;
  tokens: number;
}

export const CONTEXT_DAYS = 15;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_LIMITS = {
  day_start_min: 540,
  day_end_min: 1440,
  quiet_start_min: 0,
  quiet_end_min: 540,
};

/** Rough count (chars / 4): good enough to watch the budget without a tokenizer dependency. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const clock = (min: Minutes) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * The schedule as the model sees it, one line per block (D-123): today plus the next days resolved
 * (routine + one-off changes). Refs are deterministic for a given revision, so the same data always
 * yields the same text and the same mapping.
 */
export function buildContext(ctx: ToolContext, days = CONTEXT_DAYS): PlanningContext {
  const { data, today } = ctx;
  const from = today;
  const to = addDays(today, days - 1);
  const limits = { ...DEFAULT_LIMITS, ...ctx.profile };
  const refs: RefMap = { blocks: {}, categories: {}, terms: {} };

  const categories = data.categories.filter((c) => !c.deleted_at).sort((a, b) => a.sort - b.sort);
  const catRef = new Map<string, string>();
  categories.forEach((c, i) => {
    const ref = `c${i + 1}`;
    catRef.set(c.id, ref);
    refs.categories[ref] = c.id;
  });

  const terms = data.terms
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const termLines = terms.map((t, i) => {
    const ref = `t${i + 1}`;
    refs.terms[ref] = t.id;
    return `TERM ${ref} ${t.name} ${t.starts_on}..${t.ends_on} ${termStatus(t, today)}`;
  });

  const blockRef = new Map<string, string>();
  const dayLines: string[] = [];
  for (const day of resolveRange(from, days, data)) {
    dayLines.push(`${WEEKDAYS[weekdayOf(day.date)]} ${day.date.slice(5)}`);
    if (day.blocks.length === 0) dayLines.push('  (free)');
    for (const b of day.blocks) {
      let ref = '-';
      if (b.routine_block_id) {
        ref = blockRef.get(b.routine_block_id) ?? `b${blockRef.size + 1}`;
        if (!blockRef.has(b.routine_block_id)) {
          blockRef.set(b.routine_block_id, ref);
          refs.blocks[ref] = b.routine_block_id;
        }
      }
      const flags = [
        b.protected ? 'P' : '',
        b.quiet ? 'Q' : '',
        b.source === 'one_off' ? 'one-off' : b.override_id ? 'edited' : '',
      ].filter(Boolean);
      dayLines.push(
        `  ${ref} ${clock(b.start_min)}-${clock(b.end_min)} ${b.title} ${catRef.get(b.category_id) ?? 'c?'}` +
          (flags.length ? ` ${flags.join(' ')}` : ''),
      );
    }
  }

  const text = [
    `DIALED CONTEXT rev ${ctx.revision} · today ${WEEKDAYS[weekdayOf(today)]} ${today} · ${ctx.timeZone} · window ${from}..${to}`,
    `LIMITS day ${clock(limits.day_start_min)}-${clock(limits.day_end_min)} · quiet ${clock(limits.quiet_start_min)}-${clock(limits.quiet_end_min)}`,
    ...termLines,
    'CATEGORIES (ref name (group) flags)',
    ...categories.map(
      (c) =>
        `${catRef.get(c.id)} ${c.name} (${c.group_name})` +
        (c.protected ? ' protected' : '') +
        (c.quiet ? ' quiet' : ''),
    ),
    'DAYS (ref start-end title category flags; P protected, Q quiet; "-" = one-off, no ref)',
    ...dayLines,
  ].join('\n');

  return { text, refs, revision: ctx.revision, from, to, tokens: estimateTokens(text) };
}
