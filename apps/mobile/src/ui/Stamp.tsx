import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { T } from './Text';

/** A notice banner across the full width (stale, offline in plan views). */
export function Stamp({ text, kind = 'warning' }: { text: string; kind?: 'warning' | 'info' }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const bg = kind === 'warning' ? c.err : c.surf2;
  const fg = kind === 'warning' ? '#fff' : c.text;
  return (
    <Animated.View
      entering={
        reduce
          ? FadeIn.duration(120)
          : FadeInDown.duration(250).withInitialValues({ transform: [{ translateY: -8 }] })
      }
      accessibilityRole="alert"
      style={{
        marginHorizontal: 20,
        marginBottom: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: bg,
      }}
    >
      <T size={14} weight="600" color={fg} style={{ lineHeight: 20 }}>
        {text}
      </T>
    </Animated.View>
  );
}
