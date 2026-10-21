import { useEffect } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
  type EntryAnimationsValues,
  type LayoutAnimation,
} from 'react-native-reanimated';
import { fonts, useTheme } from '../theme/theme';
import { DisplayTitle, lineShift } from '../ui/DisplayTitle';
import { heroIn } from '../ui/motion';
import { T } from '../ui/Text';
import type { BarModel, DayModel } from './model';

const COUNT_SHIFT = lineShift(0.9);

function Colon({ color }: { color: string }) {
  const op = useSharedValue(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    // 1 s period, steps(2,end): full for .5 s, .2 for .5 s. Steady with Reduce Motion.
    op.value = withRepeat(
      withSequence(
        withDelay(500, withTiming(0.2, { duration: 0 })),
        withDelay(500, withTiming(1, { duration: 0 })),
      ),
      -1,
    );
    return () => cancelAnimation(op);
  }, [op, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.Text style={[{ fontFamily: fonts.display, fontSize: 72, color }, style]}>
      :
    </Animated.Text>
  );
}

const barIn =
  (i: number, reduce: boolean) =>
  (_v: EntryAnimationsValues): LayoutAnimation => {
    'worklet';
    if (reduce)
      return {
        initialValues: { opacity: 0 },
        animations: { opacity: withTiming(1, { duration: 120 }) },
      };
    return {
      initialValues: { transform: [{ scaleY: 0 }] },
      animations: {
        transform: [
          {
            scaleY: withDelay(
              i * 30,
              withTiming(1, { duration: 800, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
            ),
          },
        ],
      },
    };
  };

export function DayBars({ bars }: { bars: BarModel[] }) {
  const reduce = useReducedMotion();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', gap: 3, height: 40, alignItems: 'flex-end', marginTop: 18 }}
    >
      {bars.map((b, i) => (
        <Animated.View
          key={b.key}
          entering={barIn(i, reduce)}
          style={{
            flex: b.flex,
            height: `${b.heightPct}%`,
            borderRadius: 3,
            backgroundColor: b.color,
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </View>
  );
}

export function DayHero({ m }: { m: DayModel }) {
  const { c } = useTheme();
  const { fontScale } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [h, mm] = m.countdown ? m.countdown.split(':') : [null, null];
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
      <View accessible accessibilityLabel={m.heroA11y} accessibilityLiveRegion="polite">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.acc }} />
          <T size={15} weight="600" color={c.acc2}>
            {m.label}
          </T>
        </View>
        <Animated.View entering={heroIn(reduce)} key={m.title}>
          <View style={{ marginTop: 4 }}>
            <DisplayTitle size={m.titleSize} color={c.hero} accessibilityRole="text">
              {m.title}
            </DisplayTitle>
          </View>
        </Animated.View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 14 }}>
          {h !== null ? (
            // `.count { font-size: 72px; line-height: .9 }`: natural-height digits in a .9 em box (no cap clipping).
            <View style={{ height: 72 * 0.9 * fontScale, overflow: 'visible' }}>
              <View style={{ flexDirection: 'row', marginTop: -72 * COUNT_SHIFT * fontScale }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 72, color: c.text }}>{h}</Text>
                <Colon color={c.text} />
                <Text style={{ fontFamily: fonts.display, fontSize: 72, color: c.text }}>{mm}</Text>
              </View>
            </View>
          ) : null}
          <T size={15} weight="600" color={c.muted} style={{ paddingBottom: 6, flexShrink: 1 }}>
            {m.sub}
          </T>
        </View>
      </View>
      <DayBars bars={m.bars} />
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}
        accessible
        accessibilityLabel={m.axis.mid}
      >
        <T size={12} weight="600" color={c.muted}>
          {m.axis.start}
        </T>
        <T size={12} weight="600" color={c.muted}>
          {m.axis.mid}
        </T>
        <T size={12} weight="600" color={c.muted}>
          {m.axis.end}
        </T>
      </View>
    </View>
  );
}
