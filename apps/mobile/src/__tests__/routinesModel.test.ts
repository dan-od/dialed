import {
  copyToast,
  dateRange,
  dayTabLabel,
  editorStatus,
  effectiveChoices,
  emptyDayLine,
  hoursText,
  nameTermDefaults,
  nameTermError,
  oneOffChanges,
  otherTermLine,
  removedToast,
  replacesLine,
  saveSentence,
  saveToast,
  termDateError,
  termNotices,
  termStatus,
  weeksHelper,
} from '../routines/model';

// Flow 05 copy and rules (prototype v9 + Flow_05 file + BACKEND_SETUP §3 effective dates).
const T = (name: string, starts_on: string, ends_on: string, is_draft = false) => ({
  id: name,
  name,
  starts_on,
  ends_on,
  is_draft,
  deleted_at: null,
});
const FALL = T('Fall term', '2026-09-14', '2026-12-11');
const EXAM = T('Exam weeks', '2026-12-12', '2026-12-22');
const WINTER = T('Winter term', '2027-01-05', '2027-04-16', true);
const TODAY = '2026-10-22'; // Thursday

describe('terms', () => {
  it('status tags: Active / Next / Draft / Past', () => {
    expect(termStatus(FALL, TODAY)).toBe('Active');
    expect(termStatus(EXAM, TODAY)).toBe('Next');
    expect(termStatus(WINTER, TODAY)).toBe('Draft');
    expect(termStatus(T('Summer', '2026-05-01', '2026-08-20'), TODAY)).toBe('Past');
  });
  it('the gap between Exam weeks and Winter term is explained; adjacent terms have no gap', () => {
    expect(termNotices([WINTER, FALL, EXAM])).toEqual([
      {
        kind: 'gap',
        after: 'Exam weeks',
        text: 'Dec 23 – Jan 4 has no term. Those days stay empty unless you add something.',
      },
    ]);
  });
  it('overlapping terms: the earlier start wins, and the notice says so', () => {
    const longFall = { ...FALL, ends_on: '2026-12-15' };
    expect(termNotices([longFall, EXAM])).toEqual([
      {
        kind: 'overlap',
        on: 'Fall term',
        text: 'Overlaps Exam weeks. Days in both use Fall term.',
      },
    ]);
  });
  it('ends before starts is refused inline', () => {
    expect(termDateError('2026-09-14', '2026-09-01')).toBe('Ends needs to be after starts.');
    expect(termDateError('2026-09-14', '2026-12-11')).toBeNull();
  });
  it('labels', () => {
    expect(dateRange(FALL)).toBe('Sep 14 to Dec 11');
    expect(otherTermLine(EXAM, FALL)).toBe('Dec 12 to Dec 22, starts after Fall term');
    expect(otherTermLine(WINTER, FALL)).toBe('Draft, from Jan 5. Add your new classes');
  });
});

describe('routine editor', () => {
  it('status, tabs, hours, empty day, remove and copy toasts', () => {
    expect(editorStatus(false)).toBe('Changes start next Monday');
    expect(editorStatus(true)).toBe('Unsaved changes');
    expect(hoursText(10.4)).toBe('10.4h');
    expect(hoursText(5)).toBe('5h');
    expect(dayTabLabel(0, 10.4)).toBe('Monday, 10.4 hours');
    expect(emptyDayLine(0)).toBe('Nothing repeats on Mondays yet. Add the first block below.');
    expect(removedToast('Gym', 0)).toBe('Removed Gym from Mondays.');
    expect(copyToast(0, [1, 3])).toBe('Copied Monday to Tue, Thu. Save to keep it.');
    expect(replacesLine([1, 3])).toBe('Replaces what’s on Tue and Thu.');
    expect(replacesLine([1, 2, 4])).toBe('Replaces what’s on Tue, Wed and Fri.');
    expect(replacesLine([])).toBeNull();
  });
});

describe('save sheet (effective date: BACKEND_SETUP §3, default next Monday)', () => {
  it('choices and the sentence that follows them', () => {
    expect(effectiveChoices(TODAY)).toEqual({ nextMonday: '2026-10-26', today: TODAY });
    expect(saveSentence('2026-10-26', TODAY)).toBe(
      'Changes start Monday, Oct 26. This week and earlier stay as they were.',
    );
    expect(saveSentence(TODAY, TODAY)).toBe('Changes start today. Earlier days stay as they were.');
    expect(saveSentence('2026-11-09', TODAY)).toBe(
      'Changes start Monday, Nov 9. Days before then stay as they were.',
    );
  });
  it('toasts', () => {
    expect(saveToast('Fall term', '2026-10-26', TODAY, true)).toBe(
      'Fall term saved. Changes start Mon Oct 26.',
    );
    expect(saveToast('Fall term', TODAY, TODAY, true)).toBe(
      'Fall term saved. Changes start today.',
    );
    expect(saveToast('Fall term', '2026-10-26', TODAY, false)).toBe(
      'Saved on this phone. It syncs when you reconnect.',
    );
  });
});

describe('name your term (D-35, behind the flag)', () => {
  it('prefills today → +13 weeks and recomputes the helper', () => {
    expect(nameTermDefaults(TODAY)).toEqual({
      name: 'Fall term',
      starts: TODAY,
      ends: '2027-01-21',
    });
    expect(weeksHelper(TODAY, '2027-01-21')).toBe(
      '13 weeks. “Rest of the year” still means Dec 31.',
    );
    expect(weeksHelper(TODAY, '2026-10-29')).toBe('1 week. “Rest of the year” still means Dec 31.');
  });
  it('errors', () => {
    expect(nameTermError('  ', TODAY, '2027-01-21')).toBe(
      'Give the term a name, like “Fall term”.',
    );
    expect(nameTermError('Spring', TODAY, TODAY)).toBe('Ends needs to be after starts.');
    expect(nameTermError('Spring', TODAY, '2027-01-21')).toBeNull();
  });
});

describe('one-off changes on Routines', () => {
  it("groups a date's overrides: note as the title, a short summary, newest first", () => {
    const sk = (n: number) => ({
      id: `s${n}`,
      on_date: '2026-10-12',
      kind: 'skip' as const,
      routine_block_id: `b${n}`,
      title: null,
      start_min: null,
      end_min: null,
      category_id: null,
      moved_to_date: null,
      note: 'Thanksgiving',
      deleted_at: null,
    });
    const add = {
      ...sk(99),
      kind: 'add' as const,
      routine_block_id: null,
      title: 'Sermon Sync',
      start_min: 780,
      end_min: 900,
      category_id: 'c',
    };
    const later = { ...sk(50), on_date: '2026-10-21', note: null };
    const rows = oneOffChanges([...Array.from({ length: 11 }, (_, i) => sk(i)), add, later]);
    expect(rows).toEqual([
      { date: '2026-10-21', label: 'Oct 21', title: 'One-off change', line: '1 block skipped' },
      {
        date: '2026-10-12',
        label: 'Oct 12',
        title: 'Thanksgiving',
        line: '11 blocks skipped · Sermon Sync 2h added',
      },
    ]);
  });
});
