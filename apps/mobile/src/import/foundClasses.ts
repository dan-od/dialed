import type { PlanChangeRow, PlanDTO } from '@dialed/contracts';

/** Pure view model for Flow 02 "Found N classes" (timetable plans). */

export const LOW_CONFIDENCE_PREFIX = 'low_confidence:';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WEEKDAY_SHORT: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export interface ClassCard {
  id: string;
  ord: number;
  title: string;
  kind: string;
  room: string | null;
  weekday: string;
  start: string;
  end: string;
  enabled: boolean;
  checkThis: boolean;
  /** "Overlaps <title> on <day>", or null. */
  overlap: string | null;
}

export interface TermField {
  changeId: string;
  kind: 'create_term' | 'update_term';
  name: string;
  startsOn: string;
  endsOn: string;
  /** create_term only: the temp id later changes reference. */
  tempId?: string;
}

export interface FoundModel {
  classes: ClassCard[];
  term: TermField | null;
  enabledCount: number;
  lowConfidenceCount: number;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** "Advanced Networking I (tutorial) — SCI1140" + note "tutorial in SCI1140" → parts. */
function parseClass(ch: PlanChangeRow) {
  const kindFromNote = ch.note.split(' ')[0]?.trim() || 'lecture';
  const roomMatch = / in (.+)$/.exec(ch.note);
  const room = roomMatch?.[1]?.trim() ?? null;
  let title = ch.title;
  if (room && title.endsWith(` — ${room}`)) title = title.slice(0, -` — ${room}`.length);
  if (title.endsWith(` (${kindFromNote})`)) title = title.slice(0, -` (${kindFromNote})`.length);
  return { title, kind: kindFromNote, room };
}

export function lowConfidenceOrds(plan: Pick<PlanDTO, 'checks'>): Set<number> {
  const out = new Set<number>();
  for (const c of plan.checks) {
    if (!c.id.startsWith(LOW_CONFIDENCE_PREFIX)) continue;
    const n = Number(c.id.slice(LOW_CONFIDENCE_PREFIX.length));
    if (Number.isInteger(n)) out.add(n);
  }
  return out;
}

export function buildFoundModel(plan: Pick<PlanDTO, 'changes' | 'checks'>): FoundModel {
  const low = lowConfidenceOrds(plan);
  const raw = plan.changes
    .filter((ch) => ch.kind === 'new' && ch.payload.repeat)
    .map((ch) => {
      const p = ch.payload as { repeat: { weekday: string }; start: string; end: string };
      return { ch, ...parseClass(ch), weekday: p.repeat.weekday, start: p.start, end: p.end };
    })
    .sort(
      (a, b) =>
        WEEKDAYS.indexOf(a.weekday as (typeof WEEKDAYS)[number]) -
          WEEKDAYS.indexOf(b.weekday as (typeof WEEKDAYS)[number]) ||
        toMin(a.start) - toMin(b.start),
    );

  const classes: ClassCard[] = raw.map((r) => {
    const clash = r.ch.enabled
      ? raw.find(
          (o) =>
            o !== r &&
            o.ch.enabled &&
            o.weekday === r.weekday &&
            toMin(o.start) < toMin(r.end) &&
            toMin(r.start) < toMin(o.end),
        )
      : undefined;
    return {
      id: r.ch.id,
      ord: r.ch.ord,
      title: r.title,
      kind: r.kind,
      room: r.room,
      weekday: r.weekday,
      start: r.start,
      end: r.end,
      enabled: r.ch.enabled,
      checkThis: low.has(r.ch.ord),
      overlap: clash ? `Overlaps ${clash.title} on ${weekdayLong(r.weekday)}` : null,
    };
  });

  const termCh = plan.changes.find((ch) => ch.kind === 'create_term' || ch.kind === 'update_term');
  let term: TermField | null = null;
  if (termCh?.kind === 'create_term') {
    const nt = (termCh.payload.new_term ?? {}) as {
      name?: string;
      starts_on?: string;
      ends_on?: string;
      temp_id?: string;
    };
    term = {
      changeId: termCh.id,
      kind: 'create_term',
      name: nt.name ?? termCh.title,
      startsOn: nt.starts_on ?? '',
      endsOn: nt.ends_on ?? '',
      tempId: nt.temp_id,
    };
  } else if (termCh?.kind === 'update_term') {
    const p = termCh.payload as { starts_on?: string; ends_on?: string };
    term = {
      changeId: termCh.id,
      kind: 'update_term',
      name: termCh.title,
      startsOn: p.starts_on ?? '',
      endsOn: p.ends_on ?? '',
    };
  }

  return {
    classes,
    term,
    enabledCount: classes.filter((c) => c.enabled).length,
    lowConfidenceCount: classes.filter((c) => c.checkThis).length,
  };
}

function weekdayLong(w: string): string {
  return (
    {
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday',
      sun: 'Sunday',
    }[w] ?? w
  );
}

export const weekdayShort = (w: string) => WEEKDAY_SHORT[w] ?? w;

/** The PATCH payload for a term change after a date edit. */
export function termDatesPayload(
  term: TermField,
  startsOn: string,
  endsOn: string,
): Record<string, unknown> {
  return term.kind === 'create_term'
    ? {
        new_term: {
          temp_id: term.tempId ?? 'term-new',
          name: term.name,
          starts_on: startsOn,
          ends_on: endsOn,
        },
      }
    : { starts_on: startsOn, ends_on: endsOn };
}

export const datesValid = (startsOn: string, endsOn: string) =>
  !!startsOn && !!endsOn && endsOn >= startsOn;

export function addClassesLabel(n: number, termName: string): string {
  return n > 0 ? `Add ${n} class${n === 1 ? '' : 'es'} to ${termName}` : 'Turn on a class to add';
}

export function foundTitle(n: number): string {
  return `Found ${n} class${n === 1 ? '' : 'es'}`;
}

export function partialStamp(n: number): string {
  return `Check these: ${n} time${n === 1 ? ' was' : 's were'} hard to read.`;
}

export function addedToast(n: number, termName: string, ai: string): string {
  return `Added ${n} class${n === 1 ? '' : 'es'} to ${termName}. Now tell ${ai} about your projects.`;
}

export function calendarImportedToast(termName: string): string {
  return `Imported your calendars into ${termName}. Check them in Routines.`;
}

/** Reading step 1 names what is being read. */
export function readingWhat(mime: string, name: string, fromCamera: boolean): string {
  if (fromCamera) return 'photo';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'PDF';
  if (/wordprocessingml/.test(mime) || /\.docx$/i.test(name)) return 'Word doc';
  return 'screenshot';
}

export function readingSteps(what: string, termName: string): string[] {
  return [`Reading the ${what}`, 'Finding days, times and rooms', `Matching to ${termName}`];
}

export const CANT_READ = 'Use a photo, screenshot, PDF or Word file under 15 MB.';
export const NOTHING_FOUND = 'Try a clearer photo or a PDF from your student portal.';
export const DEFAULT_LIMIT =
  "You've used today's 6 timetable reads. Try again tomorrow or bring your own AI key in Settings.";

export type ReadFailure =
  | { kind: 'cant_read' }
  | { kind: 'limit'; message: string }
  | { kind: 'vision' }
  | { kind: 'other'; message: string };

export function readFailure(err: { code?: string; message?: string }): ReadFailure {
  switch (err.code) {
    case 'file_unsupported':
    case 'file_too_large':
    case 'payload_too_large':
      return { kind: 'cant_read' };
    case 'daily_limit':
      return {
        kind: 'limit',
        message: err.message?.includes('timetable') ? err.message : DEFAULT_LIMIT,
      };
    case 'vision_unavailable':
      return { kind: 'vision' };
    default:
      return { kind: 'other', message: err.message ?? 'Something went wrong. Try again.' };
  }
}
