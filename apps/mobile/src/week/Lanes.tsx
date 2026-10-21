import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useReducedMotion,
  withDelay,
  withTiming,
  type EntryAnimationsValues,
  type LayoutAnimation,
} from 'react-native-reanimated';
import { fonts, useTheme } from '../theme/theme';
import { D, T } from '../ui/Text';
import type { Lane } from './model';

/** Track wipes in left → right, 50 ms stagger (Flow 03 / prototype `wipe`); fade with Reduce Motion. */
const wipe =
  (i: number, reduce: boolean) =>
  (_v: EntryAnimationsValues): LayoutAnimation => {
    'worklet';
    if (reduce)
      return {
        initialValues: { opacity: 0 },
        animations: { opacity: withTiming(1, { duration: 120 }) },
      };
    return {
      initialValues: { transform: [{ scaleX: 0 }] },
      animations: {
        transform: [
          {
            scaleX: withDelay(
              i * 50,
              withTiming(1, { duration: 800, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
            ),
          },
        ],
      },
    };
  };

export function LaneRow({
  lane,
  index,
  onPress,
}: {
  lane: Lane;
  index: number;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const { fontScale } = useWindowDimensions();
  const reduce = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lane.a11y}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: lane.today ? c.acc : 'transparent',
        backgroundColor: lane.today ? c.surf2 : 'transparent',
        opacity: pressed ? 0.8 : 1,
        minHeight: 48,
      })}
    >
      <View style={{ width: 42 * fontScale }}>
        <T size={11} weight="700" color={lane.today ? c.acc2 : c.muted} style={{ lineHeight: 14 }}>
          {lane.wd}
        </T>
        <D size={28} style={{ lineHeight: 30 }}>
          {lane.numeral}
        </D>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Animated.View
          entering={wipe(index, reduce)}
          style={{ height: 22, borderRadius: 6, backgroundColor: c.track, transformOrigin: 'left' }}
        >
          {lane.segs.map((s) => (
            <View
              key={s.key}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${s.left}%`,
                width: `${Math.max(0.3, s.width)}%`,
                borderRadius: 4,
                backgroundColor: s.color,
                opacity: s.past ? 0.4 : 1,
              }}
            />
          ))}
          {lane.now !== null && lane.now >= 0 && lane.now <= 100 ? (
            <View
              style={{
                position: 'absolute',
                top: -5,
                bottom: -5,
                width: 2,
                left: `${lane.now}%`,
                backgroundColor: c.text,
              }}
            />
          ) : null}
        </Animated.View>
        <T
          size={12}
          weight="600"
          color={lane.today ? c.acc2 : c.muted}
          style={{ marginTop: 5, lineHeight: 16 }}
          numberOfLines={2}
        >
          {lane.summary}
        </T>
      </View>
      <D
        size={19}
        color={lane.today ? c.hero : c.text}
        style={{ width: 46 * fontScale, textAlign: 'right', lineHeight: 24 }}
        numberOfLines={1}
      >
        {lane.total}
      </D>
    </Pressable>
  );
}

/** "8a 12p 4p 8p 12a" aligned to the track's 0/25/50/75/100 % (prototype axis is ~10 pt off; recorded delta). */
export function LaneAxis() {
  const { c } = useTheme();
  const labels = ['8a', '12p', '4p', '8p', '12a'];
  // Lanes: padding 10 (list) + 10 (lane) + 42 (day) + 12 (gap) on the left; 12 + 46 + 10 + 10 on the right.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ marginTop: 14, marginBottom: 6, marginLeft: 74, marginRight: 78, height: 16 }}
    >
      {labels.map((l, i) => (
        <T
          key={l}
          size={12}
          weight="400"
          color={c.muted}
          style={{
            position: 'absolute',
            fontFamily: fonts.display,
            lineHeight: 16,
            left: i === labels.length - 1 ? undefined : `${i * 25}%`,
            right: i === labels.length - 1 ? 0 : undefined,
            transform: i > 0 && i < labels.length - 1 ? [{ translateX: -8 }] : undefined,
          }}
        >
          {l}
        </T>
      ))}
    </View>
  );
}
