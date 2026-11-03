import { paletteColors } from '@dialed/tokens';
import { addDays, weekStartOf } from './dates';
import { parseClock } from './format';
import { resolveDay } from './resolve';
import { formatHours, workMinutes } from './totals';
import type {
  Category,
  IsoDate,
  Minutes,
  Override,
  Routine,
  RoutineBlock,
  ScheduleData,
  Term,
} from './types';

export const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

function weekdayIndex(name: WeekdayName): number {
  const i = WEEKDAY_NAMES.indexOf(name);
  if (i < 0) throw new Error(`Not a weekday: ${name}`);
  return i;
}

export interface PlanRepeat {
  weekday: WeekdayName;
  from: IsoDate;
  until: IsoDate;
}

export interface NewCategorySpec {
  temp_id: string;
  name: string;
  group: string;
  palette: string;
}

export interface NewTermSpec {
  temp_id: string;
  name: string;
  starts_on: IsoDate;
  ends_on: IsoDate;
}

export interface ChangedFieldsSpec {
  title?: string;
  /** "HH:MM" 24h. */
  start?: string;
  end?: string;
  category_id?: string;
}

/**
 * mcp/tools.md `propose_changes.changes[]`, one entry — the wire shape an AI sends.
 * Field-identical to `@dialed/contracts`' Zod `PlanChange` (kept in sync by hand, same precedent as
 * `ScheduleData`'s plain types vs. contracts' `*Fields` validators).
 */
export type PlanChange =
  | { kind: 'create_category'; title: string; new_category: NewCategorySpec; note: string }
  | { kind: 'create_term'; title: string; new_term: NewTermSpec; note: string }
  | {
      kind: 'update_term';
      title: string;
      term_id: string;
      starts_on: IsoDate;
      ends_on: IsoDate;
      note: string;
    }
  | {
      kind: 'new';
      title: string;
      category_id: string;
      repeat?: PlanRepeat;
      on_date?: IsoDate;
      /** "HH:MM" 24h. */
      start: string;
      end: string;
      note: string;
    }
  | {
      kind: 'moved';
      title: string;
      block_ref: string;
      close_from?: IsoDate;
      repeat?: PlanRepeat;
      to_weekday?: WeekdayName;
      on_date?: IsoDate;
      to_date?: IsoDate;
      start?: string;
      end?: string;
      note: string;
    }
  | {
      kind: 'changed';
      title: string;
      block_ref: string;
      from?: IsoDate;
      on_date?: IsoDate;
      fields: ChangedFieldsSpec;
      note: string;
    }
  | { kind: 'removed'; title: string; block_ref: string; from: IsoDate; note: string }
  | { kind: 'skip'; title: string; block_ref: string; on_date: IsoDate; note: string };

export type PlanOp =
  | { op: 'insertTerm'; term: Term; routine: Routine }
  | { op: 'updateTerm'; term_id: string; starts_on: IsoDate; ends_on: IsoDate }
  | { op: 'insertCategory'; category: Category }
  | { op: 'insertRoutineBlock'; block: RoutineBlock }
  | { op: 'closeRoutineBlock'; block_id: string; effective_to: IsoDate }
  | { op: 'insertOverride'; override: Override };

/** Applies routine-edit clamps (BACKEND_SETUP §3 "Effective dates", `plan_repeat`) without pulling in effective.ts's other contexts. */
function clampRepeatFrom(today: IsoDate, from: IsoDate): IsoDate {
  const tomorrow = addDays(today, 1);
  return from < tomorrow ? tomorrow : from;
}

/** BACKEND_SETUP §6 PlanChange → data mapping application order. */
const KIND_ORDER: Record<PlanChange['kind'], number> = {
  create_term: 0,
  update_term: 1,
  create_category: 2,
  new: 3,
  moved: 4,
  changed: 5,
  removed: 6,
  skip: 7,
};

/**
 * Compiles validated plan changes into row-level ops (BACKEND_SETUP §6 mapping table), resolving
 * `create_category`/`create_term` temp ids against later changes in the same plan. Pure: `data` isn't
 * mutated; `applyOps` composes the result. Assumes `changes` already passed the validator — an unknown
 * `block_ref` throws rather than failing softly.
 */
export function planOps(changes: PlanChange[], data: ScheduleData, today: IsoDate): PlanOp[] {
  const ordered = changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) => KIND_ORDER[a.change.kind] - KIND_ORDER[b.change.kind] || a.index - b.index);

  const ops: PlanOp[] = [];
  const terms = [...data.terms];
  const routines = [...data.routines];
  let nextCategorySort = data.categories.length;
  const blocksById = new Map(data.routineBlocks.map((b) => [b.id, b]));
  const tempCategoryIds = new Map<string, string>();
  const tempTermIds = new Map<string, string>();
  let counter = 0;
  const freshId = (prefix: string) => `plan:${prefix}:${counter++}`;
  const resolveCategoryId = (id: string) => tempCategoryIds.get(id) ?? id;
  const resolveTermId = (id: string) => tempTermIds.get(id) ?? id;
  const requireBlock = (blockRef: string): RoutineBlock => {
    const block = blocksById.get(blockRef);
    if (!block) throw new Error(`planOps: unknown block_ref ${blockRef}`);
    return block;
  };

  function insertRepeatBlock(
    repeat: PlanRepeat,
    title: string,
    categoryId: string,
    startMin: Minutes,
    endMin: Minutes,
  ) {
    const from = clampRepeatFrom(today, repeat.from);
    const untilExclusive = addDays(repeat.until, 1);
    const weekday = weekdayIndex(repeat.weekday);
    const covering = terms
      .filter(
        (t) => !t.deleted_at && !t.is_draft && t.starts_on <= repeat.until && t.ends_on >= from,
      )
      .sort((a, b) => (a.starts_on < b.starts_on ? -1 : a.starts_on > b.starts_on ? 1 : 0));
    for (const term of covering) {
      const routine = routines.find((r) => r.term_id === term.id);
      if (!routine) continue;
      const segmentFrom = term.starts_on > from ? term.starts_on : from;
      const termEndExclusive = addDays(term.ends_on, 1);
      const segmentToExclusive =
        termEndExclusive < untilExclusive ? termEndExclusive : untilExclusive;
      if (segmentFrom >= segmentToExclusive) continue;
      const block: RoutineBlock = {
        id: freshId('rb'),
        routine_id: routine.id,
        weekday,
        start_min: startMin,
        end_min: endMin,
        title,
        category_id: categoryId,
        effective_from: segmentFrom,
        effective_to: segmentToExclusive,
      };
      ops.push({ op: 'insertRoutineBlock', block });
    }
  }

  for (const { change } of ordered) {
    switch (change.kind) {
      case 'create_term': {
        const termId = freshId('term');
        const routineId = freshId('routine');
        const term: Term = {
          id: termId,
          name: change.new_term.name,
          starts_on: change.new_term.starts_on,
          ends_on: change.new_term.ends_on,
          is_draft: false,
        };
        const routine: Routine = { id: routineId, term_id: termId, name: change.new_term.name };
        terms.push(term);
        routines.push(routine);
        tempTermIds.set(change.new_term.temp_id, termId);
        ops.push({ op: 'insertTerm', term, routine });
        break;
      }
      case 'update_term': {
        const termId = resolveTermId(change.term_id);
        const idx = terms.findIndex((t) => t.id === termId);
        if (idx >= 0)
          terms[idx] = { ...terms[idx]!, starts_on: change.starts_on, ends_on: change.ends_on };
        ops.push({
          op: 'updateTerm',
          term_id: termId,
          starts_on: change.starts_on,
          ends_on: change.ends_on,
        });
        break;
      }
      case 'create_category': {
        const colors = paletteColors(change.new_category.palette);
        if (!colors) throw new Error(`planOps: unknown palette ${change.new_category.palette}`);
        const category: Category = {
          id: freshId('cat'),
          name: change.new_category.name,
          group_name: change.new_category.group,
          color_dark: colors.color_dark,
          color_light: colors.color_light,
          weight: 0.75,
          quiet: false,
          protected: false,
          sort: nextCategorySort++,
        };
        tempCategoryIds.set(change.new_category.temp_id, category.id);
        ops.push({ op: 'insertCategory', category });
        break;
      }
      case 'new': {
        const categoryId = resolveCategoryId(change.category_id);
        const startMin = parseClock(change.start);
        const endMin = parseClock(change.end);
        if (change.repeat) {
          insertRepeatBlock(change.repeat, change.title, categoryId, startMin, endMin);
        } else {
          ops.push({
            op: 'insertOverride',
            override: {
              id: freshId('ov'),
              on_date: change.on_date!,
              kind: 'add',
              routine_block_id: null,
              title: change.title,
              start_min: startMin,
              end_min: endMin,
              category_id: categoryId,
              moved_to_date: null,
              note: change.note,
            },
          });
        }
        break;
      }
      case 'moved': {
        const existing = requireBlock(change.block_ref);
        if (change.repeat) {
          const closeFrom = clampRepeatFrom(today, change.close_from ?? change.repeat.from);
          ops.push({ op: 'closeRoutineBlock', block_id: existing.id, effective_to: closeFrom });
          insertRepeatBlock(
            change.repeat,
            existing.title,
            existing.category_id,
            change.start ? parseClock(change.start) : existing.start_min,
            change.end ? parseClock(change.end) : existing.end_min,
          );
        } else {
          ops.push({
            op: 'insertOverride',
            override: {
              id: freshId('ov'),
              on_date: change.on_date!,
              kind: 'move',
              routine_block_id: existing.id,
              title: null,
              start_min: change.start ? parseClock(change.start) : null,
              end_min: change.end ? parseClock(change.end) : null,
              category_id: null,
              moved_to_date: change.to_date!,
              note: change.note,
            },
          });
        }
        break;
      }
      case 'changed': {
        const existing = requireBlock(change.block_ref);
        if (change.from) {
          const from = clampRepeatFrom(today, change.from);
          ops.push({ op: 'closeRoutineBlock', block_id: existing.id, effective_to: from });
          const block: RoutineBlock = {
            id: freshId('rb'),
            routine_id: existing.routine_id,
            weekday: existing.weekday,
            start_min: change.fields.start ? parseClock(change.fields.start) : existing.start_min,
            end_min: change.fields.end ? parseClock(change.fields.end) : existing.end_min,
            title: change.fields.title ?? existing.title,
            category_id: change.fields.category_id
              ? resolveCategoryId(change.fields.category_id)
              : existing.category_id,
            effective_from: from,
            effective_to: existing.effective_to,
          };
          ops.push({ op: 'insertRoutineBlock', block });
        } else {
          ops.push({
            op: 'insertOverride',
            override: {
              id: freshId('ov'),
              on_date: change.on_date!,
              kind: 'modify',
              routine_block_id: existing.id,
              title: change.fields.title ?? null,
              start_min: change.fields.start ? parseClock(change.fields.start) : null,
              end_min: change.fields.end ? parseClock(change.fields.end) : null,
              category_id: change.fields.category_id
                ? resolveCategoryId(change.fields.category_id)
                : null,
              moved_to_date: null,
              note: change.note,
            },
          });
        }
        break;
      }
      case 'removed': {
        const existing = requireBlock(change.block_ref);
        ops.push({
          op: 'closeRoutineBlock',
          block_id: existing.id,
          effective_to: clampRepeatFrom(today, change.from),
        });
        break;
      }
      case 'skip': {
        const existing = requireBlock(change.block_ref);
        ops.push({
          op: 'insertOverride',
          override: {
            id: freshId('ov'),
            on_date: change.on_date,
            kind: 'skip',
            routine_block_id: existing.id,
            title: null,
            start_min: null,
            end_min: null,
            category_id: null,
            moved_to_date: null,
            note: change.note,
          },
        });
        break;
      }
    }
  }
  return ops;
}

/** Pure composition of `planOps`' result onto a base schedule — never mutates `data`. */
export function applyOps(data: ScheduleData, ops: PlanOp[]): ScheduleData {
  let { categories, terms, routines, routineBlocks, overrides } = data;
  for (const op of ops) {
    switch (op.op) {
      case 'insertTerm':
        terms = [...terms, op.term];
        routines = [...routines, op.routine];
        break;
      case 'updateTerm':
        terms = terms.map((t) =>
          t.id === op.term_id ? { ...t, starts_on: op.starts_on, ends_on: op.ends_on } : t,
        );
        break;
      case 'insertCategory':
        categories = [...categories, op.category];
        break;
      case 'insertRoutineBlock':
        routineBlocks = [...routineBlocks, op.block];
        break;
      case 'closeRoutineBlock':
        routineBlocks = routineBlocks.map((b) =>
          b.id === op.block_id ? { ...b, effective_to: op.effective_to } : b,
        );
        break;
      case 'insertOverride':
        overrides = [...overrides, op.override];
        break;
    }
  }
  return { categories, terms, routines, routineBlocks, overrides };
}

export interface PlanImpactRow {
  label: string;
  before: string;
  after: string;
}

const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/**
 * "What this does to your week": one row per Mon–Fri day whose work minutes changed, plus Weekend
 * (Sat+Sun combined) and Week, always shown. Diffs two already-resolved schedules — callers build
 * `after` with `applyOps(before, planOps(enabledChanges, before, today))`.
 */
export function planImpact(
  before: ScheduleData,
  after: ScheduleData,
  weekOf: IsoDate,
): PlanImpactRow[] {
  const weekStart = weekStartOf(weekOf);
  const perDay = WEEKDAY_LABELS.map((label, i) => {
    const date = addDays(weekStart, i);
    return {
      label,
      beforeMin: workMinutes(resolveDay(date, before).blocks),
      afterMin: workMinutes(resolveDay(date, after).blocks),
    };
  });
  const row = (label: string, beforeMin: number, afterMin: number): PlanImpactRow => ({
    label,
    before: formatHours(beforeMin),
    after: formatHours(afterMin),
  });
  const rows: PlanImpactRow[] = [];
  for (const d of perDay.slice(0, 5)) {
    if (d.beforeMin !== d.afterMin) rows.push(row(d.label, d.beforeMin, d.afterMin));
  }
  const weekend = perDay.slice(5, 7);
  rows.push(
    row(
      'Weekend',
      weekend.reduce((s, d) => s + d.beforeMin, 0),
      weekend.reduce((s, d) => s + d.afterMin, 0),
    ),
  );
  rows.push(
    row(
      'Week',
      perDay.reduce((s, d) => s + d.beforeMin, 0),
      perDay.reduce((s, d) => s + d.afterMin, 0),
    ),
  );
  return rows;
}
