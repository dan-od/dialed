import type { PlanChangeRow } from '@dialed/contracts';
import {
  addClassesLabel,
  addedToast,
  buildFoundModel,
  calendarImportedToast,
  datesValid,
  foundTitle,
  partialStamp,
  readFailure,
  readingSteps,
  readingWhat,
  termDatesPayload,
} from '../import/foundClasses';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function cls(
  ord: number,
  title: string,
  kind: string,
  room: string | null,
  weekday: string,
  start: string,
  end: string,
  enabled = true,
): PlanChangeRow {
  return {
    id: id(),
    ord,
    kind: 'new',
    title: title + (kind !== 'lecture' ? ` (${kind})` : '') + (room ? ` — ${room}` : ''),
    payload: {
      category_id: 'cat',
      repeat: { weekday, from: '2037-09-14', until: '2037-12-14' },
      start,
      end,
    },
    note: `${kind}${room ? ` in ${room}` : ''}`,
    enabled,
    validation: {},
  };
}

const term: PlanChangeRow = {
  id: id(),
  ord: 0,
  kind: 'create_term',
  title: 'Fall term',
  payload: {
    new_term: {
      temp_id: 'term-new',
      name: 'Fall term',
      starts_on: '2037-09-14',
      ends_on: '2037-12-14',
    },
  },
  note: '',
  enabled: true,
  validation: {},
};

describe('buildFoundModel', () => {
  const changes = [
    term,
    cls(1, 'Capstone Study Project', 'lecture', 'SCI1140', 'wed', '11:10', '14:00'),
    cls(2, 'Advanced Networking I', 'tutorial', 'SCI1140', 'wed', '13:30', '15:00'),
    cls(3, 'Advanced Networking I', 'lecture', 'SCI1140', 'mon', '09:40', '11:00'),
    cls(4, 'Cryptography', 'lab', null, 'tue', '08:10', '11:00', false),
  ];
  const checks = [{ id: 'low_confidence:2', passed: false, detail: 'hard to read' }];
  const m = buildFoundModel({ changes, checks });

  it('parses title, kind and room and sorts by weekday then time', () => {
    expect(m.classes.map((c) => `${c.weekday} ${c.start}`)).toEqual([
      'mon 09:40',
      'tue 08:10',
      'wed 11:10',
      'wed 13:30',
    ]);
    expect(m.classes[3]).toMatchObject({
      title: 'Advanced Networking I',
      kind: 'tutorial',
      room: 'SCI1140',
    });
    expect(m.classes[1]).toMatchObject({ title: 'Cryptography', kind: 'lab', room: null });
  });

  it('marks low-confidence cards by change position', () => {
    expect(m.classes.filter((c) => c.checkThis).map((c) => c.ord)).toEqual([2]);
    expect(m.lowConfidenceCount).toBe(1);
  });

  it('notes overlaps on both cards, only among enabled classes', () => {
    expect(m.classes[2]!.overlap).toBe('Overlaps Advanced Networking I on Wednesday');
    expect(m.classes[3]!.overlap).toBe('Overlaps Capstone Study Project on Wednesday');
    expect(m.classes[0]!.overlap).toBeNull();
    const off = buildFoundModel({
      changes: changes.map((c) => (c.ord === 2 ? { ...c, enabled: false } : c)),
      checks: [],
    });
    expect(off.classes.every((c) => c.overlap === null)).toBe(true);
  });

  it('counts enabled classes and reads the term', () => {
    expect(m.enabledCount).toBe(3);
    expect(m.term).toMatchObject({
      kind: 'create_term',
      name: 'Fall term',
      startsOn: '2037-09-14',
      endsOn: '2037-12-14',
      tempId: 'term-new',
    });
  });

  it('reads an update_term change', () => {
    const upd: PlanChangeRow = {
      ...term,
      kind: 'update_term',
      payload: { term_id: 't1', starts_on: '2037-09-07', ends_on: '2037-12-18' },
    };
    const mm = buildFoundModel({ changes: [upd], checks: [] });
    expect(mm.term).toMatchObject({ kind: 'update_term', startsOn: '2037-09-07' });
    expect(termDatesPayload(mm.term!, '2037-09-01', '2037-12-01')).toEqual({
      starts_on: '2037-09-01',
      ends_on: '2037-12-01',
    });
  });

  it('create_term payload keeps the temp id', () => {
    expect(termDatesPayload(m.term!, '2037-09-01', '2037-12-01')).toEqual({
      new_term: {
        temp_id: 'term-new',
        name: 'Fall term',
        starts_on: '2037-09-01',
        ends_on: '2037-12-01',
      },
    });
  });
});

describe('copy', () => {
  it('button, title and stamps', () => {
    expect(addClassesLabel(6, 'Fall term')).toBe('Add 6 classes to Fall term');
    expect(addClassesLabel(1, 'Fall term')).toBe('Add 1 class to Fall term');
    expect(addClassesLabel(0, 'Fall term')).toBe('Turn on a class to add');
    expect(foundTitle(6)).toBe('Found 6 classes');
    expect(partialStamp(2)).toBe('Check these: 2 times were hard to read.');
    expect(partialStamp(1)).toBe('Check these: 1 time was hard to read.');
    expect(addedToast(6, 'Fall term', 'Claude')).toBe(
      'Added 6 classes to Fall term. Now tell Claude about your projects.',
    );
    expect(calendarImportedToast('Fall term')).toBe(
      'Imported your calendars into Fall term. Check them in Routines.',
    );
  });

  it('dates must end on or after start', () => {
    expect(datesValid('2037-09-14', '2037-12-14')).toBe(true);
    expect(datesValid('2037-09-14', '2037-09-14')).toBe(true);
    expect(datesValid('2037-12-15', '2037-12-14')).toBe(false);
    expect(datesValid('', '2037-12-14')).toBe(false);
  });

  it('reading names the source', () => {
    expect(readingWhat('application/pdf', 'a.pdf', false)).toBe('PDF');
    expect(
      readingWhat(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'a.docx',
        false,
      ),
    ).toBe('Word doc');
    expect(readingWhat('image/png', 'IMG_1.png', false)).toBe('screenshot');
    expect(readingWhat('image/jpeg', 'x.jpg', true)).toBe('photo');
    expect(readingSteps('PDF', 'Fall term')).toEqual([
      'Reading the PDF',
      'Finding days, times and rooms',
      'Matching to Fall term',
    ]);
  });

  it('maps upload errors to the right state', () => {
    expect(readFailure({ code: 'file_unsupported' })).toEqual({ kind: 'cant_read' });
    expect(readFailure({ code: 'file_too_large' })).toEqual({ kind: 'cant_read' });
    expect(
      readFailure({
        code: 'daily_limit',
        message:
          "You've used today's 6 timetable reads. Try again tomorrow or bring your own AI key in Settings.",
      }),
    ).toEqual({
      kind: 'limit',
      message:
        "You've used today's 6 timetable reads. Try again tomorrow or bring your own AI key in Settings.",
    });
    expect(readFailure({ code: 'daily_limit' }).kind).toBe('limit');
    expect(readFailure({ code: 'vision_unavailable' })).toEqual({ kind: 'vision' });
    expect(readFailure({ code: 'server_error', message: 'x' })).toEqual({
      kind: 'other',
      message: 'x',
    });
  });
});
