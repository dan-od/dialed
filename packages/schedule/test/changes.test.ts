import { describe, expect, it } from 'vitest';
import { nextFreeSlot, overlapOf, resolveDay } from '../src';
import { seedData } from './seed';

// Flow 04: overlap warning + default times for the Add sheet.
const mon = resolveDay('2026-10-19', seedData()).blocks;

describe('overlapOf (only work blocks count, touching edges do not)', () => {
  it('8:30–10 pm runs into WellServices (prototype add-overlap)', () => {
    expect(overlapOf(mon, 1230, 1320)?.title).toBe('WellServices');
  });
  it('a block that only touches the next one is not an overlap', () => {
    const wf = mon.find((b) => b.title === 'WellServices')!;
    expect(overlapOf(mon, wf.end_min, wf.end_min + 60)).toBeNull();
  });
  it('quiet blocks (meals, breaks) never trigger it', () => {
    const meal = mon.find((b) => b.quiet)!;
    const inside = overlapOf(mon, meal.start_min, meal.end_min);
    expect(inside === null || !inside.quiet).toBe(true);
  });
  it('the block being edited is ignored', () => {
    const gym = mon.find((b) => b.title === 'Gym')!;
    expect(overlapOf(mon, gym.start_min, gym.end_min, gym.key)).toBeNull();
    expect(overlapOf(mon, gym.start_min, gym.end_min)?.title).toBe('Gym');
  });
  it('end ≤ start is never an overlap (the time error shows instead)', () => {
    expect(overlapOf(mon, 1260, 1230)).toBeNull();
  });
});

describe('nextFreeSlot (default Starts: next free 5-min slot, 1 h)', () => {
  it('rounds up to the 5-minute grid and skips work blocks', () => {
    const s = nextFreeSlot(mon, 22 * 60 + 2);
    expect(s).toEqual({ start: 1325, end: 1385 });
  });
  it('jumps past a block that is running now', () => {
    const wf = mon.find((b) => b.title === 'WellServices')!;
    const s = nextFreeSlot(mon, wf.start_min + 10);
    expect(s.start).toBeGreaterThanOrEqual(wf.end_min);
    expect(overlapOf(mon, s.start, s.end)).toBeNull();
  });
  it('an empty day starts at the next 5 minutes', () => {
    expect(nextFreeSlot([], 601)).toEqual({ start: 605, end: 665 });
  });
  it('never ends after midnight: late in the day it falls back to the last hour', () => {
    expect(nextFreeSlot([], 23 * 60 + 40)).toEqual({ start: 1380, end: 1440 });
  });
});
