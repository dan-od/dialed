import { TOAST_GAP, toastBottom } from '../ui/Toast';

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
