import { View } from 'react-native';
import Animated, {
  Easing,
  useReducedMotion,
  withDelay,
  withTiming,
  type EntryAnimationsValues,
  type LayoutAnimation,
} from 'react-native-reanimated';
import { fonts, useTheme } from '../theme/theme';
import { T } from '../ui/Text';
import { MONTH_PT_PER_HOUR, type MonthDay } from './model';

const CHART_H = 150;

/** Day columns rise from the bottom, 20 ms stagger (prototype `rise`). */
const rise =
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
              i * 20,
              withTiming(1, { duration: 800, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
            ),
          },
        ],
      },
    };
  };

export function MonthChart({
  days,
  axis,
  notes,
}: {
  days: MonthDay[];
  axis: { day: number; left: number; label: string; today: boolean }[];
  notes: { day: number; left: number; label: string }[];
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        {days.map((d, i) => (
          <Animated.View
            key={d.date}
            entering={rise(i + 1, reduce)}
            style={{
              flex: 1,
              height: '100%',
              justifyContent: 'flex-end',
              gap: 1,
              opacity: d.past ? 0.5 : 1,
              transformOrigin: 'bottom',
            }}
          >
            {d.today ? (
              <View
                style={{
                  position: 'absolute',
                  left: -3,
                  right: -3,
                  top: 0,
                  bottom: -4,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: c.text,
                }}
              />
            ) : null}
            {[...d.segs].reverse().map((s) => (
              <View
                key={s.name}
                style={{
                  height: Math.max(1, s.hours * MONTH_PT_PER_HOUR - 1),
                  borderRadius: 2,
                  backgroundColor: s.color,
                }}
              />
            ))}
          </Animated.View>
        ))}
      </View>
      <View style={{ height: 16, marginTop: 8 }}>
        {axis.map((a) => (
          <T
            key={a.day}
            size={12}
            weight="400"
            color={a.today ? c.hero : c.muted}
            numberOfLines={1}
            style={{
              position: 'absolute',
              left: `${a.left}%`,
              fontFamily: fonts.display,
              lineHeight: 16,
            }}
          >
            {a.label}
          </T>
        ))}
      </View>
      {notes.length ? (
        <View style={{ height: 16, marginTop: 2 }}>
          {notes.map((n) => (
            <T
              key={n.day}
              size={11}
              weight="600"
              color={c.muted}
              numberOfLines={1}
              style={{ position: 'absolute', left: `${n.left}%`, lineHeight: 16 }}
            >
              {n.label}
            </T>
          ))}
        </View>
      ) : null}
    </View>
  );
}
