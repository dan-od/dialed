import { navScroll, type NavScrollState } from '../day/navCollapse';

const step = (ys: number[], contentH = 460, viewH = 360) => {
  let st: NavScrollState = { anchor: 0, mini: false };
  const out: boolean[] = [];
  for (const y of ys) {
    st = navScroll(st, y, contentH, viewH);
    out.push(st.mini);
  }
  return out;
};

describe('floating nav collapse (Rest of today scroll)', () => {
  it('collapses scrolling down past 24 pt, expands scrolling up', () => {
    expect(step([10, 30, 60])).toEqual([false, true, true]);
    expect(step([10, 30, 60, 40])).toEqual([false, true, true, false]);
  });
  it('slow iOS scroll events (≈5 pt apart) still collapse and expand', () => {
    expect(step([5, 10, 15, 20, 25, 30, 35])).toEqual([
      false,
      false,
      false,
      false,
      true, // 25 pt: past 24 pt and more than 6 pt down from the top-most point
      true,
      true,
    ]);
    expect(step([5, 10, 15, 20, 25, 30, 35, 31, 27, 23])).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });
  it('the iOS bounce at the bottom does not re-expand it', () => {
    // max offset = 100; overscroll to 130, then the bounce settles back to 100 in small steps.
    expect(step([30, 80, 130, 125, 118, 110, 104, 100])).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });
  it('small jitter does not toggle it', () => {
    expect(step([30, 27, 31, 28])).toEqual([true, true, true, true]);
  });
  it('near the top it always expands (pull-down bounce included)', () => {
    expect(step([30, 2])).toEqual([true, false]);
    expect(step([-20])).toEqual([false]);
  });
});
