import { DEFAULT_DEVICE_PREFS, type DevicePrefs } from '@dialed/contracts';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { glancePreview } from '../glance/preview';
import { buildSnapshot } from '../glance/snapshot';

// Flow 08 step 9: the Customize page (mode, line switch, iPhone Settings state, guide previews) and the
// previews' text, which must read like the widgets (LockModel/HomeModel Swift checks use the same values).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const TZ = 'America/Toronto';
/** Previews are pictures: hidden from VoiceOver (each guide item reads its name and what it shows). */
const HIDDEN = { includeHiddenElements: true };
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const render = (ui: ReactElement) =>
  rtlRender(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
const at1315 = new Date('2037-10-19T17:15:00.000Z');

jest.mock('../lib/haptics', () => ({
  haptic: { selection: jest.fn(), light: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
const mockEnabled = { value: true };
jest.mock('../glance/activity', () => ({
  nativeActivities: () => ({ activitiesEnabled: () => mockEnabled.value }),
}));
const mockState: { prefs: DevicePrefs; setPrefs: jest.Mock } = {
  prefs: DEFAULT_DEVICE_PREFS,
  setPrefs: jest.fn(),
};
jest.mock('../week/useSchedule', () => ({
  useSchedule: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    c: require('@dialed/tokens').colors.dark,
    data: {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      schedule: require('../../../../packages/schedule/test/seed').seedData(),
      profile: { time_zone: 'America/Toronto' },
    },
    prefs: mockState.prefs,
    setPrefs: mockState.setPrefs,
    now: { minute: 795, date: '2037-10-19' },
  }),
}));

describe('glancePreview (same text as the widgets)', () => {
  const snap = buildSnapshot(seedData(), DEFAULT_DEVICE_PREFS, TZ, at1315);

  it('at 1:15 pm Monday', () => {
    const p = glancePreview(snap, at1315)!;
    expect(p.line).toBe('Then Cryptography prep at 2:45');
    expect(p.countdown).toMatchObject({ live: true, label: '1:15', caption: 'LEFT' });
    expect(p.countdown.progress).toBeCloseTo(35 / 110);
    expect(p.dayRing.left).toBe(5);
    expect(p.dayRing.segments).toHaveLength(7);
    expect(p.upNext).toEqual({
      kicker: 'Next · in 1h 30m',
      title: 'Cryptography prep',
      detail: '2:45–4:15 · 1h 30m',
    });
    expect(p.today.kicker).toBe('Today · 7h 30m of work left');
    expect(p.today.middle).toBe('5 blocks left');
    expect(p.week!.kicker).toMatch(/^Week · 2\.9 \/ \d+h$/);
    expect(p.week!.detail).toBe('Today: 10.4h planned');
    expect(p.now).toMatchObject({
      title: 'Sermon Sync',
      left: '1:15',
      foot: 'Then Cryptography prep',
    });
    expect(p.next).toEqual({
      time: '2:45',
      title: 'Cryptography prep',
      foot: 'in 1h 30m · 1h 30m',
    });
    expect(p.rundown.rows[0]).toMatchObject({ time: '12:40', detail: '1:15 left', current: true });
    expect(p.rundown.rows).toHaveLength(4);
    expect(p.timeline.kicker).toBe('Mon 19 · 5 blocks left');
    expect(p.timeline.rows).toHaveLength(7);
  });

  it('at 10:30 pm: nothing else today, tomorrow’s first work block', () => {
    const late = new Date('2037-10-20T02:30:00.000Z');
    const p = glancePreview(buildSnapshot(seedData(), DEFAULT_DEVICE_PREFS, TZ, late), late)!;
    expect(p.upNext).toEqual({
      kicker: 'Up next',
      title: 'Nothing else today',
      detail: 'Tomorrow 8:10 · Cryptography lecture',
    });
    expect(p.rundown.rows[0]!.title).toBe('Tomorrow 8:10 · Cryptography lecture');
    expect(p.now).toBeNull();
  });

  it('no routine: no previews (the widgets say “Set up your week in Dialed”)', () => {
    const empty = buildSnapshot(
      { ...seedData(), routineBlocks: [], overrides: [] },
      DEFAULT_DEVICE_PREFS,
      TZ,
      at1315,
    );
    expect(glancePreview(empty, at1315)).toBeNull();
  });
});

describe('Customize page', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Customize = require('../app/(app)/customize').default as () => React.JSX.Element;
  beforeEach(() => {
    mockState.prefs = DEFAULT_DEVICE_PREFS;
    mockState.setPrefs.mockClear();
    mockEnabled.value = true;
  });

  it('Live Activity + line: mode selected, its explanation, the line switch, and live previews', async () => {
    await render(<Customize />);
    expect(
      screen.getByRole('radio', { name: 'Live Activity + line' }).props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId('cz-mode-text').props.children).toMatch(
      /^Work blocks get a Live Activity/,
    );
    expect(screen.getByTestId('cz-line')).toBeTruthy();
    expect(screen.getByText('Then Cryptography prep at 2:45', HIDDEN)).toBeTruthy();
    expect(screen.getAllByText('1:15', HIDDEN).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^Rundown, Medium/)).toBeTruthy();
    expect(screen.queryByTestId('cz-la-settings')).toBeNull();
  });

  it('switching to Line only saves the mode', async () => {
    await render(<Customize />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Line only' }));
    expect(mockState.setPrefs).toHaveBeenCalledWith({ lock_mode: 'line' });
  });

  it('Line only: the line switch is hidden (it is forced on) and the explanation changes', async () => {
    mockState.prefs = { ...DEFAULT_DEVICE_PREFS, lock_mode: 'line', line_on: true };
    await render(<Customize />);
    expect(screen.queryByTestId('cz-line')).toBeNull();
    expect(screen.getByTestId('cz-mode-text').props.children).toMatch(
      /^Everything shows in the line/,
    );
    // In Line only the line names the work block itself.
    expect(screen.getByText('Sermon Sync · 1h 15m left', HIDDEN)).toBeTruthy();
  });

  it('the line switch saves line_on', async () => {
    await render(<Customize />);
    await fireEvent(screen.getByTestId('cz-line'), 'valueChange', false);
    expect(mockState.setPrefs).toHaveBeenCalledWith({ line_on: false });
  });

  it('Live Activities off in iPhone Settings: says so, with Open Settings', async () => {
    mockEnabled.value = false;
    await render(<Customize />);
    expect(screen.getByText('Live Activities are off in iPhone Settings.')).toBeTruthy();
    expect(screen.getByTestId('cz-la-settings')).toBeTruthy();
  });
});
