import { listBottom, TOAST_EST_HEIGHT, TOAST_GAP, toastBottom, toastClearance } from '../ui/Toast';

describe('toast placement (never over bottom actions)', () => {
  it('sits above the floating nav (nav bottom 24 + height 54 → 90, the prototype value)', () => {
    expect(toastBottom([24 + 54], 34)).toBe(90);
  });
  it('sits above pinned buttons when they reach higher than the nav', () => {
    expect(toastBottom([78, 196], 34)).toBe(196 + TOAST_GAP);
  });
  it('without bottom chrome it clears the home indicator', () => {
    expect(toastBottom([], 34)).toBe(34 + TOAST_GAP);
    expect(toastBottom([], 0)).toBe(12 + TOAST_GAP);
  });
});

describe('lists make room for a toast (it never covers the last row)', () => {
  it('clearance = toast bottom + toast height + gap, for one- and two-line toasts', () => {
    expect(toastClearance([78], 34, 46)).toBe(90 + 46 + TOAST_GAP);
    expect(toastClearance([78], 34, 65)).toBe(90 + 65 + TOAST_GAP);
  });
  it('before the toast is measured, room for two lines is assumed', () => {
    expect(TOAST_EST_HEIGHT).toBeGreaterThanOrEqual(65);
  });
  it('list padding grows only while a toast shows', () => {
    expect(listBottom(120, 0)).toBe(120);
    expect(listBottom(120, 167)).toBe(167);
    expect(listBottom(200, 167)).toBe(200);
  });
});
