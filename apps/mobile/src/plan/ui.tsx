import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { CheckIcon, SendIcon, WarnIcon } from '../ui/icons';
import { T } from '../ui/Text';

// Flow 06 pieces from prototype v11 CSS: `.pill`, `.sendb`, `.flabel`, `.chip`, `.checkline`, `.steps`.

/** `.pill`: 44 tall, radius 22, surf2 (or transparent + muted, e.g. Discard), 14/600. */
export function Pill({
  label,
  onPress,
  quiet,
  testID,
}: {
  label: string;
  onPress: () => void;
  quiet?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        height: 44,
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: quiet ? 'transparent' : c.surf2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <T size={14} weight="600" color={quiet ? c.muted : c.text}>
        {label}
      </T>
    </Pressable>
  );
}

/** `.sendb`: 44 orange circle with the up arrow in ink. */
export function SendButton({
  label,
  onPress,
  disabled,
  busy,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  const off = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: c.acc,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: off ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <SendIcon color={c.ink} />
    </Pressable>
  );
}

/** `.flabel`: 13/700 muted. */
export function FieldLabel({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <T size={13} weight="700" color={c.muted}>
      {children}
    </T>
  );
}

/** `.chip`: 36 tall outline pill, 13/700 soft. */
export function Chip({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: c.line,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <T size={13} weight="700" color={c.soft}>
        {label}
      </T>
    </Pressable>
  );
}

/** `.checkline`: 13/600, ✓ in ok or ⚠ in err. */
export function CheckLine({ ok, text }: { ok: boolean; text: string }) {
  const { c } = useTheme();
  const color = ok ? c.ok : c.err;
  return (
    <View
      accessible
      accessibilityLabel={`${ok ? 'OK' : 'Warning'}: ${text}`}
      style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}
    >
      <View style={{ marginTop: 2 }}>
        {ok ? <CheckIcon color={color} /> : <WarnIcon color={color} />}
      </View>
      <T size={13} weight="600" color={color} style={{ flex: 1, lineHeight: 18 }}>
        {text}
      </T>
    </View>
  );
}

/** `.steps`: each step fades in 0.4 s after the last, a 26 pt surf2 circle holding an orange check. */
export function PlanSteps({ steps, style }: { steps: string[]; style?: ViewStyle }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? steps.length : 1);
  useEffect(() => {
    if (reduce) return;
    const timers = steps.slice(1).map((_, i) => setTimeout(() => setShown(i + 2), (i + 1) * 400));
    return () => timers.forEach(clearTimeout);
  }, [steps, reduce]);
  return (
    <View accessibilityRole="text" accessibilityLiveRegion="polite" style={[{ gap: 14 }, style]}>
      {steps.slice(0, shown).map((s) => (
        <Animated.View
          key={s}
          entering={FadeIn.duration(400)}
          style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: c.surf2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckIcon color={c.acc2} />
          </View>
          <T size={16} weight="600">
            {s}
          </T>
        </Animated.View>
      ))}
    </View>
  );
}

/** `.list-row`: 48 min, hairline under, gap 12. */
export function ListRow({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 48,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: c.surf2,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  ) : (
    <View style={style}>{children}</View>
  );
}
