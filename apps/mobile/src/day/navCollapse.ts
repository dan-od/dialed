export interface NavScrollState {
  /** Offset where the current direction started (the last extreme). */
  anchor: number;
  mini: boolean;
}

/**
 * Floating-nav collapse rule for the Rest-of-today sheet (prototype): collapse after scrolling down more than
 * 6 pt (once past 24 pt), expand after scrolling up more than 6 pt or near the top.
 * Distances are measured from the last extreme, not between events: iOS reports a steady swipe as ~5 pt steps,
 * which a per-event threshold never sees. Offsets are clamped to the content, so the overscroll bounce at
 * either end never reads as a direction change.
 */
export function navScroll(
  st: NavScrollState,
  rawY: number,
  contentH: number,
  viewH: number,
): NavScrollState {
  const max = Math.max(0, contentH - viewH);
  const y = Math.min(Math.max(rawY, 0), max);
  if (y < 4) return { anchor: y, mini: false };
  if (!st.mini) {
    if (y - st.anchor > 6 && y > 24) return { anchor: y, mini: true };
    return { anchor: Math.min(st.anchor, y), mini: false }; // follow the top-most point while expanded
  }
  if (st.anchor - y > 6) return { anchor: y, mini: false };
  return { anchor: Math.max(st.anchor, y), mini: true }; // follow the bottom-most point while collapsed
}
