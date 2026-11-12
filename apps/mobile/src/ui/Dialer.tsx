import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// Prototype `dialLoader()` / `.dialer`: 132 pt orange dial, 12 ticks lighting up behind a turning indicator
// (2.4 s per turn; `tkOn`: full at the pass, fading to .22 by 35 %). Static with Reduce Motion.
const SIZE = 132;
const PERIOD = 2400;
const ACC = '#FF5A1F';
const INK = '#140A05';
const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return { x1: 60 + 43 * s, y1: 60 - 43 * c, x2: 60 + 51 * s, y2: 60 - 51 * c };
});

const AnimatedLine = Animated.createAnimatedComponent(Line);

function Tick({ i, p, still }: { i: number; p: SharedValue<number>; still: boolean }) {
  const t = TICKS[i]!;
  const props = useAnimatedProps(() => {
    if (still) return { strokeOpacity: 0.22 };
    const ph = (p.value - i / 12 + 1) % 1;
    return { strokeOpacity: ph < 0.35 ? 1 - (ph / 0.35) * 0.78 : 0.22 };
  });
  return (
    <AnimatedLine {...t} stroke={INK} strokeWidth={4} strokeLinecap="round" animatedProps={props} />
  );
}

export function Dialer() {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    p.value = withRepeat(withTiming(1, { duration: PERIOD, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [reduce, p]);

  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 360}deg` }] }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Working"
      style={{
        width: SIZE,
        height: SIZE,
        marginTop: 30,
        alignSelf: 'center',
        borderRadius: SIZE / 2,
        backgroundColor: ACC,
        shadowColor: ACC,
        shadowOpacity: 0.28,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 14 },
      }}
    >
      <Svg width={SIZE} height={SIZE} viewBox="0 0 120 120" style={{ position: 'absolute' }}>
        <Circle cx={60} cy={60} r={60} fill={ACC} />
        {TICKS.map((_, i) => (
          <Tick key={i} i={i} p={p} still={reduce} />
        ))}
        <Circle cx={60} cy={60} r={32} fill={INK} />
      </Svg>
      <Animated.View
        style={[{ position: 'absolute', width: SIZE, height: SIZE }, reduce ? undefined : turn]}
      >
        <Svg width={SIZE} height={SIZE} viewBox="0 0 120 120">
          <Rect x={54} y={33} width={12} height={26} rx={6} fill={ACC} />
        </Svg>
      </Animated.View>
    </View>
  );
}
