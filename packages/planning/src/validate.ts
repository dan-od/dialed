import {
  addDays,
  applyOps,
  daysBetween,
  overlapOf,
  parseClock,
  planOps,
  resolveRange,
  weekdayOf,
  type IsoDate,
  type PlanChange,
  type PlanOp,
  type RoutineBlock,
  type ScheduleData,
} from '@dialed/schedule';
import { PROPOSE_CHANGES_LIMITS, type PlanCheck, type PlanSource } from '@dialed/contracts';
import type { RefMap } from './context';

export interface ValidateProfile {
  day_start_min: number;
  day_end_min: number;
  quiet_start_min: number;
  quiet_end_min: number;
}

const DEFAULT_PROFILE: ValidateProfile = {
  day_start_min: 540,
  day_end_min: 1440,
  quiet_start_min: 0,
  quiet_end_min: 540,
};

export interface ValidateContext {
  /** The resolved schedule this plan is drafted against. */
  data: ScheduleData;
  today: IsoDate;
  source: PlanSource;
  profile?: ValidateProfile;
  /** Short refs from the planning context (b1, c2, t1); real ids still pass through. */
  refs?: RefMap;
}

export interface ValidateError {
  /** -1 = the whole plan (too_many_changes, range_too_long, overlap), not one change. */
  change_index: number;
  code: string;
  message: string;
}

export interface ValidateResult {
  errors: ValidateError[];
  checks: PlanCheck[];
  /** Compiled ops for `changes`, ready for `applyOps`/the approve transaction — empty when `errors` isn't empty. */
  ops: PlanOp[];
  /** The changes with short refs replaced by real ids — what gets stored. */
  changes: PlanChange[];
}

const SHORT_REF = /^[bct]\d+$/;

/**
 * Replaces context refs with real ids. A value that looks like a ref but isn't in the map is
 * `unknown_ref`; a temp id from a `create_category` in the same draft wins over a category ref.
 */
function resolveRefs(changes: PlanChange[], refs: RefMap, errors: ValidateError[]): PlanChange[] {
  const temps = new Set(
    changes.filter((c) => c.kind === 'create_category').map((c) => c.new_category.temp_id),
  );
  return changes.map((change, index) => {
    const map = (value: string, table: Record<string, string>, allowTemp = false) => {
      if (allowTemp && temps.has(value)) return value;
      const hit = table[value];
      if (hit) return hit;
      if (SHORT_REF.test(value)) {
        errors.push({
          change_index: index,
          code: 'unknown_ref',
          message: `${value} isn’t in the schedule context. Use a ref from it.`,
        });
      }
      return value;
    };
    switch (change.kind) {
      case 'update_term':
        return { ...change, term_id: map(change.term_id, refs.terms) };
      case 'new':
        return { ...change, category_id: map(change.category_id, refs.categories, true) };
      case 'changed':
        return {
          ...change,
          block_ref: map(change.block_ref, refs.blocks),
          fields: change.fields.category_id
            ? {
                ...change.fields,
                category_id: map(change.fields.category_id, refs.categories, true),
              }
            : change.fields,
        };
      case 'moved':
      case 'removed':
      case 'skip':
        return { ...change, block_ref: map(change.block_ref, refs.blocks) };
      default:
        return change;
    }
  });
}

const MAX_RANGE_DAYS = 120;
const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const dateMin = (a: IsoDate, b: IsoDate) => (a < b ? a : b);
const dateMax = (a: IsoDate, b: IsoDate) => (a > b ? a : b);

/** Clamps a routine-edit effective date to tomorrow at the earliest — past days never change (D-06). */
function clampToTomorrow(today: IsoDate, date: IsoDate): IsoDate {
  const tomorrow = addDays(today, 1);
  return date < tomorrow ? tomorrow : date;
}

/** Every date a change touches — used only for the whole-plan range_too_long check. */
function changeDates(change: PlanChange): IsoDate[] {
  switch (change.kind) {
    case 'create_category':
      return [];
    case 'create_term':
      return [change.new_term.starts_on, change.new_term.ends_on];
    case 'update_term':
      return [change.starts_on, change.ends_on];
    case 'new':
      return change.repeat ? [change.repeat.from, change.repeat.until] : [change.on_date!];
    case 'moved':
      return [
        ...(change.close_from ? [change.close_from] : []),
        ...(change.repeat ? [change.repeat.from, change.repeat.until] : []),
        ...(change.on_date ? [change.on_date] : []),
        ...(change.to_date ? [change.to_date] : []),
      ];
    case 'changed':
      return [...(change.from ? [change.from] : []), ...(change.on_date ? [change.on_date] : [])];
    case 'removed':
      return [change.from];
    case 'skip':
      return [change.on_date];
  }
}

/** A key that's equal for two changes proposing the same edit — flags the second as duplicate_change. */
function dedupeKey(change: PlanChange): string {
  switch (change.kind) {
    case 'create_category':
      return `create_category:${change.new_category.name.toLowerCase()}`;
    case 'create_term':
      return `create_term:${change.new_term.name.toLowerCase()}:${change.new_term.starts_on}`;
    case 'update_term':
      return `update_term:${change.term_id}`;
    case 'new':
      return `new:${change.category_id}:${
        change.repeat ? `${change.repeat.weekday}:${change.repeat.from}` : change.on_date
      }:${change.start}`;
    case 'moved':
      return `moved:${change.block_ref}`;
    case 'changed':
      return `changed:${change.block_ref}:${change.from ?? change.on_date}`;
    case 'removed':
      return `removed:${change.block_ref}`;
    case 'skip':
      return `skip:${change.block_ref}:${change.on_date}`;
  }
}

/**
 * ASSUMED heuristic for "unless the request names the block" (BACKEND_SETUP §6): the Planner's own
 * words must mention the block's title, its category's name or group, or say "class"/"classes".
 */
function requestNamesBlock(
  requestText: string,
  block: RoutineBlock,
  categoryName: string,
  groupName: string,
): boolean {
  const text = requestText.toLowerCase();
  return (
    text.includes(block.title.toLowerCase()) ||
    text.includes(categoryName.toLowerCase()) ||
    text.includes(groupName.toLowerCase()) ||
    /\bclass(es)?\b/.test(text)
  );
}

function overlapsQuietHours(
  start: number,
  end: number,
  quietStart: number,
  quietEnd: number,
): boolean {
  if (quietStart === quietEnd) return false;
  return start < quietEnd && quietStart < end;
}

/** Repeat-weekday occurrences inside the (clamped) requested range with no covering term (BACKEND_SETUP §6 `outside_term`). */
function countOutsideTerm(changes: PlanChange[], data: ScheduleData, today: IsoDate): number {
  let count = 0;
  for (const change of changes) {
    const repeat = change.kind === 'new' || change.kind === 'moved' ? change.repeat : undefined;
    if (!repeat) continue;
    const weekday = WEEKDAY_NAMES.indexOf(repeat.weekday);
    const from = clampToTomorrow(today, repeat.from);
    for (let date = from; date <= repeat.until; date = addDays(date, 1)) {
      if (weekdayOf(date) !== weekday) continue;
      const covered = data.terms.some(
        (t) => !t.deleted_at && !t.is_draft && t.starts_on <= date && date <= t.ends_on,
      );
      if (!covered) count++;
    }
  }
  return count;
}

/**
 * Validates one `propose_changes` draft (BACKEND_SETUP §6). Shared by the in-app engine and MCP —
 * neither ever writes the schedule directly; this only reports errors (block Approve) and soft
 * checks (shown in Review, never block it). `input.changes` is whatever the caller wants checked:
 * the model's full proposal while drafting, or just the enabled subset when Approve re-validates.
 */
export function validate(
  input: { request_text: string; changes: PlanChange[] },
  ctx: ValidateContext,
): ValidateResult {
  const { request_text } = input;
  const profile = { ...DEFAULT_PROFILE, ...ctx.profile };
  const errors: ValidateError[] = [];
  const checks: PlanCheck[] = [];
  const changes = ctx.refs ? resolveRefs(input.changes, ctx.refs, errors) : input.changes;
  if (errors.length > 0) return { errors, checks, ops: [], changes };

  const maxChanges = PROPOSE_CHANGES_LIMITS[ctx.source];
  if (changes.length > maxChanges) {
    errors.push({
      change_index: -1,
      code: 'too_many_changes',
      message: `A plan can have at most ${maxChanges} changes.`,
    });
  }

  const allDates = changes.flatMap(changeDates);
  if (allDates.length > 0) {
    const min = allDates.reduce(dateMin);
    const max = allDates.reduce(dateMax);
    if (daysBetween(min, max) > MAX_RANGE_DAYS) {
      errors.push({
        change_index: -1,
        code: 'range_too_long',
        message: `That spans more than ${MAX_RANGE_DAYS} days.`,
      });
    }
  }

  const existingCategoryIds = new Set(
    ctx.data.categories.filter((c) => !c.deleted_at).map((c) => c.id),
  );
  const tempCategoryIds = new Set(
    changes.filter((c) => c.kind === 'create_category').map((c) => c.new_category.temp_id),
  );
  const resolvesCategory = (id: string) => existingCategoryIds.has(id) || tempCategoryIds.has(id);
  const existingTermIds = new Set(ctx.data.terms.filter((t) => !t.deleted_at).map((t) => t.id));
  const blocksById = new Map(
    ctx.data.routineBlocks.filter((b) => !b.deleted_at).map((b) => [b.id, b]),
  );
  const categoriesById = new Map(ctx.data.categories.map((c) => [c.id, c]));

  const checkBlock = (index: number, blockRef: string): RoutineBlock | null => {
    const block = blocksById.get(blockRef);
    if (!block) {
      errors.push({
        change_index: index,
        code: 'unknown_block',
        message: 'That block doesn’t exist.',
      });
      return null;
    }
    const category = categoriesById.get(block.category_id);
    if (
      category?.protected &&
      !requestNamesBlock(request_text, block, category.name, category.group_name)
    ) {
      errors.push({
        change_index: index,
        code: 'protected_block',
        message: `${block.title} is a class. Name it in your request to move it.`,
      });
    }
    return block;
  };
  const checkTime = (index: number, start: string, end: string) => {
    if (parseClock(start) >= parseClock(end)) {
      errors.push({
        change_index: index,
        code: 'bad_time',
        message: 'End time is before the start time.',
      });
    }
  };
  const checkNotPast = (index: number, date: IsoDate) => {
    if (date < ctx.today) {
      errors.push({
        change_index: index,
        code: 'bad_time',
        message: 'That date has already passed.',
      });
    }
  };

  const seen = new Set<string>();
  changes.forEach((change, index) => {
    const key = dedupeKey(change);
    if (seen.has(key)) {
      errors.push({
        change_index: index,
        code: 'duplicate_change',
        message: 'That change is listed twice.',
      });
    }
    seen.add(key);

    switch (change.kind) {
      case 'create_category':
        break;
      case 'create_term':
        if (change.new_term.ends_on < change.new_term.starts_on) {
          errors.push({
            change_index: index,
            code: 'bad_time',
            message: 'The term ends before it starts.',
          });
        }
        break;
      case 'update_term':
        if (!existingTermIds.has(change.term_id)) {
          errors.push({
            change_index: index,
            code: 'unknown_category',
            message: 'That term doesn’t exist.',
          });
        } else if (change.ends_on < change.starts_on) {
          errors.push({
            change_index: index,
            code: 'bad_time',
            message: 'The term ends before it starts.',
          });
        }
        break;
      case 'new':
        if (!resolvesCategory(change.category_id)) {
          errors.push({
            change_index: index,
            code: 'unknown_category',
            message: 'That category doesn’t exist.',
          });
        }
        checkTime(index, change.start, change.end);
        if (change.on_date) checkNotPast(index, change.on_date);
        break;
      case 'moved':
        checkBlock(index, change.block_ref);
        if (change.start && change.end) checkTime(index, change.start, change.end);
        if (change.on_date) checkNotPast(index, change.on_date);
        if (change.to_date) checkNotPast(index, change.to_date);
        break;
      case 'changed':
        checkBlock(index, change.block_ref);
        if (change.fields.category_id && !resolvesCategory(change.fields.category_id)) {
          errors.push({
            change_index: index,
            code: 'unknown_category',
            message: 'That category doesn’t exist.',
          });
        }
        if (change.fields.start && change.fields.end)
          checkTime(index, change.fields.start, change.fields.end);
        if (change.on_date) checkNotPast(index, change.on_date);
        break;
      case 'removed':
        checkBlock(index, change.block_ref);
        break;
      case 'skip':
        checkBlock(index, change.block_ref);
        if (change.on_date) checkNotPast(index, change.on_date);
        break;
    }
  });

  if (errors.length > 0) return { errors, checks, ops: [], changes };

  // From here, structural references all resolve, so planOps/applyOps won't throw.
  const ops = planOps(changes, ctx.data, ctx.today);
  const after = applyOps(ctx.data, ops);

  const from = allDates.length ? allDates.reduce(dateMin) : ctx.today;
  const to = allDates.length ? allDates.reduce(dateMax) : ctx.today;
  const span = Math.min(daysBetween(from, to) + 1, MAX_RANGE_DAYS + 1);
  const days = resolveRange(from, Math.max(span, 1), after);

  const hasOverlap = days.some((day) =>
    day.blocks.some(
      (block) =>
        !block.quiet && overlapOf(day.blocks, block.start_min, block.end_min, block.key) !== null,
    ),
  );
  if (hasOverlap) {
    errors.push({
      change_index: -1,
      code: 'overlap',
      message: 'That clashes with another block. Try a different time.',
    });
  }

  const outsideCount = countOutsideTerm(changes, ctx.data, ctx.today);
  if (outsideCount > 0) {
    checks.push({
      id: 'outside_term',
      passed: false,
      detail: `${outsideCount} occurrence${outsideCount === 1 ? '' : 's'} had no covering term and were left out.`,
    });
  }

  const allBlocks = days.flatMap((d) => d.blocks).filter((b) => !b.quiet);
  const boundsViolations = allBlocks.filter(
    (b) => b.start_min < profile.day_start_min || b.end_min > profile.day_end_min,
  );
  if (boundsViolations.length > 0) {
    checks.push({
      id: 'day_bounds',
      passed: false,
      detail: `${boundsViolations.length} block${boundsViolations.length === 1 ? '' : 's'} outside your day.`,
    });
  }

  const quietViolations = allBlocks.filter((b) =>
    overlapsQuietHours(b.start_min, b.end_min, profile.quiet_start_min, profile.quiet_end_min),
  );
  if (quietViolations.length > 0) {
    checks.push({
      id: 'quiet_hours',
      passed: false,
      detail: `${quietViolations.length} block${quietViolations.length === 1 ? '' : 's'} inside your quiet hours.`,
    });
  }

  return { errors, checks, ops, changes };
}
