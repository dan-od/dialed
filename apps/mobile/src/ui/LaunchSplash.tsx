import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { LOGO_D, LOGO_SLOT, Wordmark } from './icons';

const MARK = 132;
// Bowl centre (124,147) in the 256 viewBox, scaled to the 132 pt mark.
const ORIGIN: [number, number, number] = [(124 / 256) * MARK, (147 / 256) * MARK, 0];

/**
 * Launch (Flow 01 step 1): mark scales in, the knob's indicator turns −170° → 0 with overshoot, DIALED rises at
 * 750 ms; hands off at ~1.7 s (0.7 s and no movement with Reduce Motion). Never waits on the network.
 */
export function LaunchSplash({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const mark = useSharedValue(reduce ? 1 : 0);
  const slot = useSharedValue(reduce ? 0 : -170);
  const word = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      const t = setTimeout(onDone, 700);
      return () => clearTimeout(t);
    }
    mark.value = withTiming(1, { duration: 500, easing: Easing.bezier(0.2, 0.9, 0.3, 1.15) });
    slot.value = withDelay(
      200,
      withTiming(0, { duration: 1000, easing: Easing.bezier(0.3, 1.35, 0.45, 1) }),
    );
    word.value = withDelay(
      750,
      withTiming(1, { duration: 500, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }, (fin) => {
        if (fin) runOnJS(onDone)();
      }),
    );
  }, [mark, onDone, reduce, slot, word]);
  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: 0.7 + 0.3 * mark.value }],
  }));
  const slotStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${slot.value}deg` }] }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: 36 * (1 - word.value) }],
  }));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Dialed"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#FF5A1F',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        zIndex: 100,
      }}
    >
      <Animated.View style={[{ width: MARK, height: MARK }, markStyle]}>
        <Svg width={MARK} height={MARK} viewBox="0 0 256 256" style={{ position: 'absolute' }}>
          <Path fill="#140A05" d={LOGO_D} />
        </Svg>
        <Animated.View
          style={[
            { position: 'absolute', width: MARK, height: MARK, transformOrigin: ORIGIN },
            slotStyle,
          ]}
        >
          <Svg width={MARK} height={MARK} viewBox="0 0 256 256">
            <Path fill="#FF5A1F" d={LOGO_SLOT} />
          </Svg>
        </Animated.View>
      </Animated.View>
      <Animated.View style={wordStyle}>
        <Wordmark color="#140A05" height={34} />
      </Animated.View>
    </View>
  );
}
