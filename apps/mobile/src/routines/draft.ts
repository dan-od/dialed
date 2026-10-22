import type { Mutation, RoutineSaveOp } from '@dialed/contracts';
import type { Category, IsoDate, ScheduleData } from '@dialed/schedule';

// Flow 05 routine editor: a local draft of one routine's repeating week. Nothing reaches the outbox until
// Save, which sends one routine_save (BACKEND_SETUP §4) effective from the chosen date.

export interface DraftBlock {
  id: string;
  weekday: number;
  start_min: number;
  end_min: number;
  title: string;
  category_id: string;
}
export interface RoutineDraft {
  routineId: string;
  /** The week as saved (open-ended blocks), by id. */
  base: Record<string, DraftBlock>;
  /** The week as edited, Mon = 0 … Sun = 6, each sorted by start. */
  days: DraftBlock[][];
  /** Removed rows kept for Undo. */
  trash: Record<string, DraftBlock>;
}
type Fields = Omit<DraftBlock, 'id' | 'weekday'>;
const KEYS = ['weekday', 'start_min', 'end_min', 'title', 'category_id'] as const;

const sortDay = (d: DraftBlock[]) =>
  [...d].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
const empty = (): DraftBlock[][] => Array.from({ length: 7 }, () => []);

/** The routine as it stands from now on: its open-ended blocks (ended versions are history). */
export function baseWeek(data: ScheduleData, routineId: string): RoutineDraft {
  const days = empty();
  const base: Record<string, DraftBlock> = {};
  for (const b of data.routineBlocks) {
    if (b.routine_id !== routineId || b.deleted_at || b.effective_to !== null) continue;
    const d: DraftBlock = {
      id: b.id,
      weekday: b.weekday,
      start_min: b.start_min,
      end_min: b.end_min,
      title: b.title,
      category_id: b.category_id,
    };
    base[b.id] = d;
    days[b.weekday]!.push(d);
  }
  return { routineId, base, days: days.map(sortDay), trash: {} };
}

const withDay = (d: RoutineDraft, wd: number, day: DraftBlock[]): RoutineDraft => ({
  ...d,
  days: d.days.map((x, i) => (i === wd ? sortDay(day) : x)),
});
const find = (d: RoutineDraft, id: string) => {
  for (let wd = 0; wd < 7; wd++) {
    const b = d.days[wd]!.find((x) => x.id === id);
    if (b) return b;
  }
  return null;
};

export function removeBlock(d: RoutineDraft, id: string): RoutineDraft {
  const b = find(d, id);
  if (!b) return d;
  return {
    ...withDay(
      d,
      b.weekday,
      d.days[b.weekday]!.filter((x) => x.id !== id),
    ),
    trash: { ...d.trash, [id]: b },
  };
}

/** Undo of a remove. */
export function restoreBlock(d: RoutineDraft, id: string): RoutineDraft {
  const b = d.trash[id];
  if (!b) return d;
  const { [id]: _gone, ...trash } = d.trash;
  void _gone;
  return { ...withDay(d, b.weekday, [...d.days[b.weekday]!, b]), trash };
}

export function addBlock(
  d: RoutineDraft,
  weekday: number,
  f: Fields,
  ids: () => string,
): RoutineDraft {
  return withDay(d, weekday, [...d.days[weekday]!, { id: ids(), weekday, ...f }]);
}

export function editBlock(
  d: RoutineDraft,
  id: string,
  f: Partial<Fields> & { weekday?: number },
): RoutineDraft {
  const b = find(d, id);
  if (!b) return d;
  const next = { ...b, ...f };
  const out = withDay(
    d,
    b.weekday,
    d.days[b.weekday]!.filter((x) => x.id !== id),
  );
  return withDay(out, next.weekday, [...out.days[next.weekday]!, next]);
}

/**
 * Copy one day onto others: their blocks are replaced by copies. `replaces` lists target days that had
 * blocks (the sheet says "Replaces what's on …").
 */
export function copyDay(
  d: RoutineDraft,
  from: number,
  to: number[],
  ids: () => string,
): { draft: RoutineDraft; replaces: number[]; error?: string } {
  if (!to.length) return { draft: d, replaces: [], error: 'Pick at least one day.' };
  const replaces = to.filter((t) => d.days[t]!.length > 0);
  let out = d;
  for (const t of to) {
    if (t === from) continue;
    out = withDay(
      out,
      t,
      d.days[from]!.map((b) => ({ ...b, id: ids(), weekday: t })),
    );
  }
  return { draft: out, replaces };
}

/** Hours of work on a day (quiet blocks — meals, breaks — don't count), to 0.1. */
export function dayHours(d: RoutineDraft, wd: number, categories: Category[]): number {
  const quiet = new Set(categories.filter((c) => c.quiet).map((c) => c.id));
  const min = d.days[wd]!.filter((b) => !quiet.has(b.category_id)).reduce(
    (s, b) => s + (b.end_min - b.start_min),
    0,
  );
  return Math.round((min / 60) * 10) / 10;
}

/** The changes against the saved week, as routine_save ops. Empty = nothing to save. */
export function draftOps(d: RoutineDraft, ids: () => string): RoutineSaveOp[] {
  const now = new Map(d.days.flat().map((b) => [b.id, b]));
  const ops: RoutineSaveOp[] = [];
  for (const b of Object.values(d.base)) {
    const cur = now.get(b.id);
    if (!cur) {
      ops.push({ op: 'close', block_id: b.id });
      continue;
    }
    const fields: Partial<DraftBlock> = {};
    for (const k of KEYS) if (cur[k] !== b[k]) Object.assign(fields, { [k]: cur[k] });
    if (Object.keys(fields).length)
      ops.push({ op: 'update', block_id: b.id, new_block_id: ids(), fields });
  }
  for (const b of now.values()) {
    if (d.base[b.id]) continue;
    const { id, ...fields } = b;
    ops.push({ op: 'add', block_id: id, fields });
  }
  return ops;
}

export function saveMutation(
  d: RoutineDraft,
  baseVersion: number,
  effectiveFrom: IsoDate,
  ids: () => string,
): Extract<Mutation, { entity: 'routine_save' }> {
  return {
    client_mutation_id: ids(),
    entity: 'routine_save',
    routine_id: d.routineId,
    base_version: baseVersion,
    effective_from: effectiveFrom,
    ops: draftOps(d, ids),
  };
}
