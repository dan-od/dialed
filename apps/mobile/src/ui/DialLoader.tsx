import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { LOGO_D, LOGO_SLOT } from './icons';

const SIZE = 48;
const ORIGIN: [number, number, number] = [(124 / 256) * SIZE, (147 / 256) * SIZE, 0];

/** The dial knob turning continuously (from LaunchSplash); static with Reduce Motion. role=img "Working". */
export function DialLoader({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const rot = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    rot.value = withRepeat(withTiming(360, { duration: 1200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [reduce, rot]);

  const slotStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Working"
      style={{ width: SIZE, height: SIZE }}
    >
      <Svg width={SIZE} height={SIZE} viewBox="0 0 256 256" style={{ position: 'absolute' }}>
        <Path fill={color} d={LOGO_D} />
      </Svg>
      <Animated.View
        style={[
          { position: 'absolute', width: SIZE, height: SIZE, transformOrigin: ORIGIN },
          reduce ? undefined : slotStyle,
        ]}
      >
        <Svg width={SIZE} height={SIZE} viewBox="0 0 256 256">
          <Path fill={color} d={LOGO_SLOT} fillOpacity={0.3} />
        </Svg>
      </Animated.View>
    </View>
  );
}
