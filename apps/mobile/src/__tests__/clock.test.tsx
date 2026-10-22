import { act, renderHook } from '@testing-library/react-native';
import { cycleDevClock, setDevClock, useClock } from '../clock/clock';

// Flow 03 "Minute boundary update": the hero updates at the exact minute without waiting for a re-render.
describe('useClock', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await act(async () => {
      setDevClock(null);
    });
    jest.useRealTimers();
  });

  it('ticks at the real minute boundary (2:29:50 pm → 2:30 pm Toronto)', async () => {
    jest.setSystemTime(new Date('2026-10-19T18:29:50Z')); // 14:29:50 America/Toronto (EDT)
    const { result } = await renderHook(() => useClock('America/Toronto'));
    expect(result.current).toEqual({ date: '2026-10-19', minute: 869 });
    await act(async () => {
      jest.advanceTimersByTime(9_000);
    });
    expect(result.current.minute).toBe(869);
    await act(async () => {
      jest.advanceTimersByTime(1_100);
    });
    expect(result.current.minute).toBe(870);
  });

  it('dev clock ticks from the moment it is set and crosses its own minute boundary', async () => {
    jest.setSystemTime(new Date('2026-10-21T21:00:07Z'));
    const { result } = await renderHook(() => useClock('America/Toronto'));
    await act(async () => {
      setDevClock({ date: '2026-10-19', minute: 869, second: 45 });
    });
    expect(result.current).toEqual({ date: '2026-10-19', minute: 869 });
    await act(async () => {
      jest.advanceTimersByTime(14_000);
    });
    expect(result.current.minute).toBe(869);
    await act(async () => {
      jest.advanceTimersByTime(1_200);
    });
    expect(result.current.minute).toBe(870);
  });

  it('long-press cycle: 1:15 pm → 8:20 pm → 11:30 pm → 2:29:45 pm → 1:15 pm today → real clock', async () => {
    jest.setSystemTime(new Date('2026-10-21T16:00:00Z'));
    const { result } = await renderHook(() => useClock('America/Toronto'));
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        cycleDevClock();
      });
      seen.push(result.current.minute);
    }
    expect(seen).toEqual([795, 1220, 1410, 869]);
    expect(result.current.date).toBe('2026-10-19');
    await act(async () => {
      cycleDevClock();
    });
    // Flow 04 preset: the real date (device time zone, Toronto in CI and the Simulator) at 1:15 pm
    expect(result.current).toEqual({ date: '2026-10-21', minute: 795 });
    await act(async () => {
      cycleDevClock();
    });
    expect(result.current).toEqual({ date: '2026-10-21', minute: 720 });
  });
});
