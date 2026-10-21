import {
  Easing,
  withDelay,
  withTiming,
  type EntryAnimationsValues,
  type LayoutAnimation,
} from 'react-native-reanimated';

// Design_Identity motion table, as Reanimated custom entering animations. With Reduce Motion the caller
// passes `reduce` and gets a 120 ms fade instead of movement.
const ease = (a: number, b: number, c: number, d: number) => Easing.bezier(a, b, c, d);

function enter(
  opts: {
    dx?: number;
    dy?: number;
    scale?: number;
    duration: number;
    delay?: number;
    easing: ReturnType<typeof ease>;
  },
  reduce: boolean,
) {
  return (_v: EntryAnimationsValues): LayoutAnimation => {
    'worklet';
    if (reduce) {
      return {
        initialValues: { opacity: 0 },
        animations: { opacity: withTiming(1, { duration: 120 }) },
      };
    }
    const cfg = { duration: opts.duration, easing: opts.easing };
    const d = opts.delay ?? 0;
    return {
      initialValues: {
        opacity: 0,
        transform: [
          { translateX: opts.dx ?? 0 },
          { translateY: opts.dy ?? 0 },
          { scale: opts.scale ?? 1 },
        ],
      },
      animations: {
        opacity: withDelay(d, withTiming(1, cfg)),
        transform: [
          { translateX: withDelay(d, withTiming(0, cfg)) },
          { translateY: withDelay(d, withTiming(0, cfg)) },
          { scale: withDelay(d, withTiming(1, cfg)) },
        ],
      },
    };
  };
}

/** Push page: 18 pt slide + fade, 320 ms cubic-bezier(.2,.8,.2,1). */
export const pageIn = (reduce: boolean) =>
  enter({ dx: 18, duration: 320, easing: ease(0.2, 0.8, 0.2, 1) }, reduce);
/** Hero title: rises 36 pt + fade, 600 ms (.16,1,.3,1). */
export const heroIn = (reduce: boolean, delay = 0) =>
  enter({ dy: 36, duration: 600, delay, easing: ease(0.16, 1, 0.3, 1) }, reduce);
/** Toast: 16 pt up + fade, 350 ms (.2,.9,.2,1). */
export const toastIn = (reduce: boolean) =>
  enter({ dy: 16, duration: 350, easing: ease(0.2, 0.9, 0.2, 1) }, reduce);
/** Dialog pop: .92 → 1, 280 ms (.2,.9,.3,1.2). */
export const dialogIn = (reduce: boolean) =>
  enter({ scale: 0.92, duration: 280, easing: ease(0.2, 0.9, 0.3, 1.2) }, reduce);
/** Nav floats up 90 pt after 150 ms, 700 ms. */
export const navIn = (reduce: boolean) =>
  enter({ dy: 90, duration: 700, delay: 150, easing: ease(0.16, 1, 0.3, 1) }, reduce);
