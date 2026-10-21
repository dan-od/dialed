import { Pressable, Text, View, type PressableProps, type ViewStyle } from 'react-native';
import { fonts, useTheme } from '../theme/theme';
import { Spinner } from './Spinner';
import { T } from './Text';

type Kind = 'primary' | 'secondary' | 'link' | 'destructive';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  kind?: Kind;
  busy?: boolean;
  style?: ViewStyle;
  /** Text colour override (e.g. Sign out on a secondary button uses `err`). */
  fg?: string;
}

/** Primary `.btn` (Anton 20 on acc), secondary `.btn2`, transparent link/destructive variants. Busy keeps width. */
export function Button({
  label,
  kind = 'primary',
  busy = false,
  disabled,
  style,
  fg: fgOverride,
  ...rest
}: Props) {
  const { c } = useTheme();
  const off = disabled || busy;
  const base: ViewStyle =
    kind === 'primary'
      ? { height: 54, borderRadius: 18, backgroundColor: c.acc }
      : {
          height: 50,
          borderRadius: 16,
          backgroundColor: kind === 'secondary' ? c.surf2 : 'transparent',
        };
  const fg =
    fgOverride ??
    (kind === 'primary'
      ? c.ink
      : kind === 'link'
        ? c.acc2
        : kind === 'destructive'
          ? c.err
          : c.text);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy }}
      disabled={off}
      style={({ pressed }) => [
        base,
        {
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {busy ? (
        <Spinner color={fg} />
      ) : kind === 'primary' ? (
        <Text style={{ fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.3, color: fg }}>
          {label}
        </Text>
      ) : (
        <T
          size={15}
          weight={kind === 'destructive' || kind === 'link' || fgOverride ? '700' : '600'}
          color={fg}
        >
          {label}
        </T>
      )}
    </Pressable>
  );
}

export function IconButton({
  label,
  onPress,
  children,
  filled,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  filled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: filled ? 0 : 1,
        borderColor: c.line,
        backgroundColor: filled ? c.acc : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View pointerEvents="none">{children}</View>
    </Pressable>
  );
}
