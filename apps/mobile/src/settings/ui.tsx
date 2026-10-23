import type { ReactNode } from 'react';
import { Pressable, Switch, useWindowDimensions, View } from 'react-native';
import { haptic } from '../lib/haptics';
import { useTheme } from '../theme/theme';
import { ChevronIcon } from '../ui/icons';
import { LARGE_TEXT } from '../ui/largeText';
import { D, T } from '../ui/Text';

// Prototype v11 settings pieces: `.setcap`, `.setgroup`, `.setrow` (value `.v`, chevron `.ch`, `.lbl2` with a
// small line), `.switch`, `.stepper`, the category swatch.

/** `.setcap`: 13/700 muted, uppercase, margin 22 20 0. */
export function SetCap({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <T
      accessibilityRole="header"
      size={13}
      weight="700"
      color={c.muted}
      style={{
        marginTop: 22,
        marginHorizontal: 20,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      {children}
    </T>
  );
}

/** `.setgroup`: radius 20 on surf, margin 14 20 0 (inset 0 inside sheets). */
export function SetGroup({ children, inset = true }: { children: ReactNode; inset?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        marginTop: inset ? 14 : 0,
        marginHorizontal: inset ? 20 : 0,
        borderRadius: 20,
        backgroundColor: c.surf,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

export const Swatch = ({ color }: { color: string }) => (
  <View style={{ width: 14, height: 14, borderRadius: 5, backgroundColor: color }} />
);

/**
 * `.setrow`: 54 pt min, padding 10 16, 1 pt surf2 line (none on the last), 16/600. A button when it has
 * `onPress` (value read with the label); `small` makes the two-line `.lbl2` label. Large Dynamic Type puts the
 * value under the label.
 */
export function SetRow({
  label,
  small,
  value,
  chevron,
  right,
  left,
  color,
  last,
  onPress,
  disabled,
  testID,
  a11yLabel,
}: {
  label: string;
  small?: string;
  value?: ReactNode;
  chevron?: boolean;
  right?: ReactNode;
  left?: ReactNode;
  color?: string;
  last?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  a11yLabel?: string;
}) {
  const { c } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= LARGE_TEXT;
  const valueText = typeof value === 'string' ? value : undefined;
  const v =
    value === undefined ? null : typeof value === 'string' ? (
      <T
        size={14}
        weight="600"
        color={c.muted}
        style={{ textAlign: stacked ? 'left' : 'right', flexShrink: 1 }}
      >
        {value}
      </T>
    ) : (
      value
    );
  const body = (
    <View
      style={{
        minHeight: 54,
        paddingVertical: 10,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.surf2,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {left}
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: stacked || small ? 'column' : 'row',
          alignItems: stacked || small ? 'flex-start' : 'center',
          gap: small ? 2 : 12,
        }}
      >
        <T size={16} weight="600" color={color ?? c.text} style={{ flexShrink: 1 }}>
          {label}
        </T>
        {small ? (
          <T size={13} weight="500" color={c.muted} style={{ lineHeight: 17 }}>
            {small}
          </T>
        ) : null}
        {v && !small ? (
          <View style={{ marginLeft: stacked ? 0 : 'auto', flexShrink: 1 }}>{v}</View>
        ) : null}
      </View>
      {v && small ? v : null}
      {right}
      {chevron ? <ChevronIcon color={c.muted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityValue={valueText ? { text: valueText } : undefined}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      {body}
    </Pressable>
  );
}

/** `.switch` as the native iOS switch in Dialed colours (on = acc with an ink knob); selection haptic. */
export function SetSwitch({
  value,
  onChange,
  label,
  testID,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Switch
      testID={testID}
      accessibilityLabel={label}
      value={value}
      onValueChange={(v) => {
        haptic.selection();
        onChange(v);
      }}
      trackColor={{ true: c.acc, false: c.line }}
      thumbColor={value ? c.ink : c.muted}
      ios_backgroundColor={c.line}
    />
  );
}

/** `.stepper`: − value + (36 pt buttons on surf2, Anton 22 value), clamped; "Fewer"/"More", value announced. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  unit,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  unit: string;
}) {
  const { c } = useTheme();
  const btn = (label: string, glyph: string, d: number, testID: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: value + d < min || value + d > max }}
      hitSlop={4}
      onPress={() => {
        const n = Math.max(min, Math.min(max, value + d));
        if (n === value) return;
        haptic.selection();
        onChange(n);
      }}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: c.surf2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <T size={20} weight="700">
        {glyph}
      </T>
    </Pressable>
  );
  return (
    <View
      accessible={false}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
    >
      {btn('Fewer', '−', -1, 'cap-dn')}
      <D
        size={22}
        accessibilityLabel={`${value} ${unit}`}
        accessibilityLiveRegion="polite"
        style={{ minWidth: 28, textAlign: 'center', lineHeight: 28 }}
      >
        {String(value)}
      </D>
      {btn('More', '+', 1, 'cap-up')}
    </View>
  );
}
