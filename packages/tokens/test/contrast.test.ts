import { describe, expect, it } from 'vitest';
import { colors, contrast } from '../src';

// Owner review 2026-10-21: toasts must stand out from the page and the "Rest of today" panel in both themes;
// the light-mode stamp text must reach 4.5:1 while keeping the amber look.
describe('contrast rules', () => {
  for (const theme of ['dark', 'light'] as const) {
    const c = colors[theme];
    it(`${theme}: stamp text (ink on stamp) ≥ 4.5:1`, () => {
      expect(contrast(c.ink, c.stamp)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: toast text ≥ 4.5:1 and action label ≥ 4.5:1`, () => {
      expect(contrast(c.toastFg, c.toastBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.toastActFg, c.toastActBg)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: toast edge stands out (≥ 3:1) from the page and from the Rest-of-today panel`, () => {
      // The edge is the fill, or the 1.5 pt toastLine border where the fill alone can't reach 3:1.
      const edge = (under: string) =>
        Math.max(contrast(c.toastBg, under), contrast(c.toastLine, under));
      expect(edge(c.bg)).toBeGreaterThanOrEqual(3);
      expect(edge(c.sheetBg)).toBeGreaterThanOrEqual(3);
    });
  }
  it('prototype light stamp was below AA (recorded fidelity delta)', () => {
    expect(contrast('#140A05', '#8F5A00')).toBeLessThan(4.5);
  });
});
