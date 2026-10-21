import { addDays, weekdayOf } from './dates';
import type {
  Category,
  IsoDate,
  Override,
  ResolvedBlock,
  ResolvedDay,
  RoutineBlock,
  ScheduleData,
  Term,
} from './types';

export interface ResolveOptions {
  /** Include draft terms (previewing a term that isn't live yet). */
  includeDrafts?: boolean;
}

const live = <T extends { deleted_at?: string | null }>(row: T) => !row.deleted_at;

export function termFor(date: IsoDate, terms: Term[], opts: ResolveOptions = {}): Term | null {
  return (
    terms.find(
      (t) =>
        live(t) && (opts.includeDrafts || !t.is_draft) && t.starts_on <= date && date <= t.ends_on,
    ) ?? null
  );
}

function activeOn(block: RoutineBlock, date: IsoDate): boolean {
  return block.effective_from <= date && (block.effective_to === null || date < block.effective_to);
}

/**
 * The single source of truth for what a date contains (BACKEND_SETUP §3).
 * Identical on device and server: routine blocks of the covering term, overrides applied, sorted by start.
 */
export function resolveDay(
  date: IsoDate,
  data: ScheduleData,
  opts: ResolveOptions = {},
): ResolvedDay {
  const weekday = weekdayOf(date);
  const categories = new Map<string, Category>(data.categories.map((c) => [c.id, c]));
  const term = termFor(date, data.terms, opts);
  const routineIds = new Set(
    term ? data.routines.filter((r) => r.term_id === term.id).map((r) => r.id) : [],
  );

  const make = (
    key: string,
    fields: { title: string; start_min: number; end_min: number; category_id: string },
    ids: { routine_block_id: string | null; override_id: string | null },
    source: ResolvedBlock['source'],
  ): ResolvedBlock => {
    const category = categories.get(fields.category_id) ?? null;
    return {
      key: `${key}:${date}`,
      date,
      ...ids,
      ...fields,
      category,
      quiet: category?.quiet ?? false,
      protected: category?.protected ?? false,
      source,
    };
  };

  const overridesToday = data.overrides.filter((o) => live(o) && o.on_date === date);
  const byBlock = new Map<string, Override[]>();
  for (const o of overridesToday) {
    if (o.routine_block_id)
      byBlock.set(o.routine_block_id, [...(byBlock.get(o.routine_block_id) ?? []), o]);
  }

  const blocks: ResolvedBlock[] = [];
  for (const rb of data.routineBlocks) {
    if (
      !live(rb) ||
      !routineIds.has(rb.routine_id) ||
      rb.weekday !== weekday ||
      !activeOn(rb, date)
    )
      continue;
    const ovs = byBlock.get(rb.id) ?? [];
    if (ovs.some((o) => o.kind === 'skip' || o.kind === 'move')) continue;
    let fields = {
      title: rb.title,
      start_min: rb.start_min,
      end_min: rb.end_min,
      category_id: rb.category_id,
    };
    let overrideId: string | null = null;
    for (const o of ovs.filter((x) => x.kind === 'modify')) {
      fields = applyFields(fields, o);
      overrideId = o.id;
    }
    blocks.push(
      make(rb.id, fields, { routine_block_id: rb.id, override_id: overrideId }, 'routine'),
    );
  }

  for (const o of overridesToday) {
    if (
      o.kind !== 'add' ||
      o.title === null ||
      o.start_min === null ||
      o.end_min === null ||
      o.category_id === null
    )
      continue;
    blocks.push(
      make(
        o.id,
        { title: o.title, start_min: o.start_min, end_min: o.end_min, category_id: o.category_id },
        { routine_block_id: null, override_id: o.id },
        'one_off',
      ),
    );
  }

  // Blocks moved here from another date keep their routine fields unless the move changed times.
  const routineById = new Map(data.routineBlocks.map((b) => [b.id, b]));
  for (const o of data.overrides) {
    if (!live(o) || o.kind !== 'move' || o.moved_to_date !== date || !o.routine_block_id) continue;
    const rb = routineById.get(o.routine_block_id);
    if (!rb) continue;
    const fields = applyFields(
      {
        title: rb.title,
        start_min: rb.start_min,
        end_min: rb.end_min,
        category_id: rb.category_id,
      },
      o,
    );
    blocks.push(make(o.id, fields, { routine_block_id: rb.id, override_id: o.id }, 'one_off'));
  }

  blocks.sort(
    (a, b) => a.start_min - b.start_min || a.end_min - b.end_min || a.title.localeCompare(b.title),
  );
  return { date, weekday, term_id: term?.id ?? null, blocks };
}

function applyFields(
  fields: { title: string; start_min: number; end_min: number; category_id: string },
  o: Override,
) {
  return {
    title: o.title ?? fields.title,
    start_min: o.start_min ?? fields.start_min,
    end_min: o.end_min ?? fields.end_min,
    category_id: o.category_id ?? fields.category_id,
  };
}

export function resolveRange(
  from: IsoDate,
  days: number,
  data: ScheduleData,
  opts?: ResolveOptions,
): ResolvedDay[] {
  return Array.from({ length: days }, (_, i) => resolveDay(addDays(from, i), data, opts));
}
