import {
  addPrimaryLabel,
  addToast,
  editOutcome,
  removeOutcome,
  editPrimaryLabel,
  lengthChip,
  overlapText,
  setEnd,
  setStart,
  validateAdd,
  type AddForm,
} from '../blocks/form';

// Flow 04 copy and form rules (prototype v8 §3–§11, Flow_04 states table, D-32).
const blank: AddForm = {
  title: '',
  category_id: null,
  start: 1320,
  end: 1380,
  repeat: false,
  alert: null,
  overlapOk: false,
};

describe('Add form validation', () => {
  it('every error says what to do, focus order name → category → end', () => {
    const e = validateAdd({ ...blank, start: 1260, end: 1230 });
    expect(e).toEqual({
      title: 'Give the block a name, like “Capstone reading”.',
      category: 'Pick a category so it gets the right colour and totals.',
      time: 'End time needs to be after 9:00 pm.',
    });
    expect(validateAdd({ ...blank, title: '  Read  ', category_id: 'c' })).toEqual({});
  });
  it('titles over 80 characters are refused (server cap)', () => {
    expect(validateAdd({ ...blank, title: 'x'.repeat(81), category_id: 'c' }).title).toBe(
      'Keep the name under 80 characters.',
    );
  });
});

describe('times', () => {
  it('moving Starts keeps the length (at least 15 min) and never passes midnight', () => {
    expect(setStart({ start: 1320, end: 1380 }, 600)).toEqual({ start: 600, end: 660 });
    expect(setStart({ start: 1320, end: 1320 }, 600)).toEqual({ start: 600, end: 615 });
    expect(setStart({ start: 600, end: 720 }, 1380)).toEqual({ start: 1380, end: 1440 });
  });
  it('Ends at 12:00 am means midnight (24:00), not the start of the day', () => {
    expect(setEnd({ start: 1380, end: 1440 }, 0)).toEqual({ start: 1380, end: 1440 });
  });
  it('length chips set Ends and show which one is on', () => {
    expect(lengthChip({ start: 1320, end: 1380 })).toBe(60);
    expect(lengthChip({ start: 1320, end: 1335 })).toBeNull();
  });
});

describe('overlap and the primary button', () => {
  it('prototype overlap copy', () => {
    expect(overlapText({ title: 'WellServices', start_min: 1230, end_min: 1320 })).toBe(
      'This runs into WellServices, 8:30 pm to 10:00 pm. Keep both, or change the time.',
    );
  });
  it('Add block → Add anyway after the first tap on an overlap; Adding while saving', () => {
    expect(addPrimaryLabel({ overlap: false, overlapOk: false, saving: false })).toBe('Add block');
    expect(addPrimaryLabel({ overlap: true, overlapOk: false, saving: false })).toBe('Add block');
    expect(addPrimaryLabel({ overlap: true, overlapOk: true, saving: false })).toBe('Add anyway');
    expect(addPrimaryLabel({ overlap: false, overlapOk: false, saving: true })).toBe('Adding');
  });
});

describe('add toasts', () => {
  const t = (o: Partial<Parameters<typeof addToast>[0]>) =>
    addToast({
      weekday: 'Monday',
      repeat: false,
      online: true,
      alert: null,
      perm: 'undetermined',
      ...o,
    });
  it('today, every week, nudges, reminders off, offline', () => {
    expect(t({})).toBe('Added to Monday.');
    expect(t({ repeat: true })).toBe('Added to every Monday.');
    expect(t({ alert: 10, perm: 'granted' })).toBe(
      'Added to Monday. You’ll get a nudge 10 min before.',
    );
    expect(t({ alert: 0, perm: 'granted' })).toBe(
      'Added to Monday. You’ll get a nudge when it starts.',
    );
    expect(t({ alert: 30, perm: 'denied' })).toBe(
      'Added. Reminders are off for Dialed in Settings.',
    );
    expect(t({ online: false, repeat: true })).toBe(
      'Saved on this phone. It syncs when you’re back online.',
    );
  });
});

describe('edit sheet', () => {
  const o = { title: 'Gym', start: 975, end: 1050, category_id: 'g', day: 0 };
  it('No changes yet → Save changes → Move to <day>', () => {
    expect(editPrimaryLabel(o, o)).toEqual({ label: 'No changes yet', disabled: true });
    expect(editPrimaryLabel(o, { ...o, start: 990 })).toEqual({
      label: 'Save changes',
      disabled: false,
    });
    expect(editPrimaryLabel(o, { ...o, day: 2 })).toEqual({
      label: 'Move to Wednesday',
      disabled: false,
    });
  });
  it('outcomes and toasts for once / every / one-off / move / offline', () => {
    const e = (x: Partial<Parameters<typeof editOutcome>[0]>) =>
      editOutcome({
        routine: true,
        scope: 'once',
        today: 0,
        day: 0,
        title: 'Gym',
        online: true,
        ...x,
      });
    expect(e({})).toEqual({ kind: 'modifyOnce', toast: 'Changed for this Monday only.' });
    expect(e({ scope: 'every' })).toEqual({ kind: 'modifyEvery', toast: 'Updated every Monday.' });
    expect(e({ routine: false })).toEqual({ kind: 'modifyOnce', toast: 'Updated.' });
    expect(e({ day: 2, scope: 'every' })).toEqual({
      kind: 'moveEvery',
      toast: 'Moved to every Wednesday.',
    });
    expect(e({ day: 2 })).toEqual({
      kind: 'moveOnce',
      toast: 'Moved to Wednesday, this week only.',
    });
    expect(e({ online: false }).toast).toBe(
      'Changed for this Monday only. Syncs when you’re back online.',
    );
  });
  it('destructive button and its toast', () => {
    const e = (x: Partial<Parameters<typeof removeOutcome>[0]>) =>
      removeOutcome({ routine: true, scope: 'once', today: 0, title: 'Gym', ...x });
    expect(e({})).toEqual({
      kind: 'skip',
      label: 'Skip it this Monday',
      toast: 'Skipped Gym this Monday.',
    });
    expect(e({ scope: 'every' })).toEqual({
      kind: 'delete',
      label: 'Delete block',
      toast: 'Deleted Gym.',
    });
    expect(e({ routine: false })).toEqual({
      kind: 'delete',
      label: 'Delete block',
      toast: 'Deleted Gym.',
    });
  });
});
