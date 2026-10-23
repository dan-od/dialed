import type { Category, ScheduleData } from '@dialed/schedule';
import { planReminders } from '../notifications/plan';
import {
  blocksUseLine,
  categoryWeek,
  clampCap,
  deleteLine,
  hoursLabel,
  mergedToast,
  mergeSub,
  notifCount,
  notifParts,
  notifValue,
  PALETTE,
  paletteIndex,
  protectedLine,
  quietHoursText,
  sameName,
} from '../settings/model';

// Flow 09 rules and copy (prototype v11 `settings`, `categories`, `catEdit`, `catMerge`, `catDelete`,
// `notifSettings`; Flow_09 file; owner-accepted recommendations listed in the report).
const C = (id: string, name: string, over: Partial<Category> = {}): Category => ({
  id,
  name,
  group_name: 'Projects',
  color_dark: '#FF8F8F',
  color_light: '#D94141',
  weight: 1,
  quiet: false,
  protected: false,
  sort: 0,
  deleted_at: null,
  ...over,
});
const SPEED = C('speed', 'Speedwatch Ontario');
const WELL = C('well', 'WellServices', { color_dark: '#FFC15E', color_light: '#C98A00' });
const MEAL = C('meal', 'Meal', {
  group_name: 'Life',
  quiet: true,
  color_dark: '#8A6A5C',
  color_light: '#B89A8A',
});
const block = (id: string, cat: string, weekday: number, s: number, e: number, over = {}) => ({
  id,
  routine_id: 'r',
  weekday,
  start_min: s,
  end_min: e,
  title: id,
  category_id: cat,
  effective_from: '2026-09-14',
  effective_to: null as string | null,
  deleted_at: null as string | null,
  ...over,
});
const data: ScheduleData = {
  categories: [SPEED, WELL, MEAL],
  terms: [
    {
      id: 't',
      name: 'Fall term',
      starts_on: '2026-09-14',
      ends_on: '2026-12-11',
      is_draft: false,
      deleted_at: null,
    },
  ],
  routines: [{ id: 'r', term_id: 't', name: 'Fall term' }],
  routineBlocks: [
    block('sw-tue', 'speed', 1, 900, 990),
    block('sw-thu', 'speed', 3, 1140, 1230),
    block('sw-fri', 'speed', 4, 1155, 1230),
    // Ended last week: not in this week's hours.
    block('sw-old', 'speed', 5, 600, 720, { effective_to: '2026-10-19' }),
    block('lunch', 'meal', 4, 750, 810),
    block('dinner', 'meal', 4, 1080, 1125),
  ],
  overrides: [],
};
const TODAY = '2026-10-23'; // Friday

describe('categories page', () => {
  it('hours and blocks per category in this week of the active term (quiet ones count too)', () => {
    const w = categoryWeek(data, TODAY);
    expect(w.get('speed')).toEqual({ hours: 4.25, blocks: 3 });
    expect(w.get('meal')).toEqual({ hours: 1.75, blocks: 2 });
    expect(w.get('well')).toBeUndefined();
    expect(hoursLabel(4.25)).toBe('4.3h');
    expect(hoursLabel(14.6)).toBe('14.6h');
    expect(hoursLabel(13)).toBe('13h');
    expect(hoursLabel(0)).toBe('0h');
  });
  it('palette: 11 named pairs; a colour outside it (Meal, Break) picks none and keeps its colours', () => {
    expect(PALETTE).toHaveLength(11);
    expect(PALETTE[3]).toEqual({ name: 'Coral', dark: '#FF8F8F', light: '#D94141' });
    expect(paletteIndex(SPEED.color_dark)).toBe(3);
    expect(paletteIndex(MEAL.color_dark)).toBe(-1);
  });
  it('a name already used (any case, extra spaces) is found; renaming to itself is fine', () => {
    expect(sameName(data.categories, '  wellservices ')?.name).toBe('WellServices');
    expect(sameName(data.categories, 'Speedwatch  Ontario', 'speed')).toBeNull();
    expect(sameName(data.categories, 'Speedwatch Ontario', 'well')?.id).toBe('speed');
    expect(sameName([{ ...WELL, deleted_at: '2026-10-01' }], 'WellServices')).toBeNull();
  });
  it('plain counts, singular when it is one', () => {
    expect(blocksUseLine(3)).toBe('3 blocks a week use it.');
    expect(blocksUseLine(1)).toBe('1 block a week uses it.');
    expect(deleteLine(3)).toBe('3 blocks a week use it. Move them to:');
    expect(deleteLine(1)).toBe('1 block a week uses it. Move it to:');
    expect(deleteLine(0)).toBe('Nothing uses it right now.');
    expect(mergeSub(3, 'Speedwatch Ontario')).toBe(
      'Its 3 blocks move to the category you pick, then Speedwatch Ontario goes away.',
    );
    expect(mergeSub(1, 'Gym')).toBe(
      'Its 1 block moves to the category you pick, then Gym goes away.',
    );
    expect(mergedToast('Speedwatch Ontario', 'WellServices', 3)).toBe(
      'Merged Speedwatch Ontario into WellServices. 3 blocks moved.',
    );
    expect(mergedToast('A', 'B', 1)).toBe('Merged A into B. 1 block moved.');
  });
  it('moving blocks out of or into a protected category says what changes', () => {
    const CLASS = C('class', 'Class', { protected: true });
    expect(protectedLine(CLASS, WELL)).toBe(
      'Classes moved to WellServices won’t be protected from AI changes.',
    );
    expect(protectedLine(WELL, CLASS)).toBe(
      'Blocks moved to Class will be protected from AI changes.',
    );
    expect(protectedLine(SPEED, WELL)).toBeNull();
    expect(protectedLine(CLASS, null)).toBeNull();
  });
});

describe('notifications page', () => {
  const prefs = {
    lock_mode: 'live' as const,
    line_on: true,
    heads_up_min: null,
    meal_notes: false,
    plan_pushes: true,
    daily_cap: 6,
  };
  it('row value: "Live Activity · max 6", or "Off · max 6" when Line only', () => {
    expect(notifValue(prefs)).toBe('Live Activity · max 6');
    expect(notifValue({ ...prefs, lock_mode: 'line', daily_cap: 7 })).toBe('Off · max 7');
  });
  it('cap stays 1–20', () => {
    expect(clampCap(0)).toBe(1);
    expect(clampCap(21)).toBe(20);
    expect(clampCap(7)).toBe(7);
  });
  it('quiet hours read "12 am – 7:30 am" (en dash, minutes only when needed)', () => {
    expect(quietHoursText(0, 450)).toBe('12 am – 7:30 am');
    expect(quietHoursText(0, 540)).toBe('12 am – 9 am');
    expect(quietHoursText(1380, 420)).toBe('11 pm – 7 am');
  });
  it('the live count uses the same planner as the phone: heads-up for work blocks, notes for meals, capped', () => {
    const at1315 = new Date('2026-10-23T17:15:00Z'); // Fri 1:15 pm Toronto
    const q = { start: 0, end: 450 };
    const tz = 'America/Toronto';
    expect(notifCount(data, {}, prefs, at1315, tz, q)).toBe(0);
    // Heads-up 10 min: Speedwatch 7:15 pm today.
    expect(notifCount(data, {}, { ...prefs, heads_up_min: 10 }, at1315, tz, q)).toBe(1);
    // + quiet notes for dinner at 6 pm (lunch at 12:30 pm is past).
    expect(
      notifCount(data, {}, { ...prefs, heads_up_min: 10, meal_notes: true }, at1315, tz, q),
    ).toBe(2);
    expect(
      notifCount(
        data,
        {},
        { ...prefs, heads_up_min: 10, meal_notes: true, daily_cap: 1 },
        at1315,
        tz,
        q,
      ),
    ).toBe(1);
    const planned = planReminders(data, {}, at1315, tz, q, { ...prefs, heads_up_min: 5 });
    expect(planned[0]).toMatchObject({ title: 'sw-fri in 5 min' });
  });
  it('the sentence drops the Live Activity clause when Line only is on', () => {
    expect(notifParts(1, 'live')).toEqual([
      'With these settings you’d get ',
      { b: '1 notification' },
      ' for the rest of today, plus the Live Activity during work blocks.',
    ]);
    expect(notifParts(0, 'line')).toEqual([
      'With these settings you’d get ',
      { b: '0 notifications' },
      ' for the rest of today.',
    ]);
  });
});
