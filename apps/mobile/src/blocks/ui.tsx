import DateTimePicker from '@react-native-community/datetimepicker';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { IconButton } from '../ui/Button';
import { DisplayTitle } from '../ui/DisplayTitle';
import { CloseIcon } from '../ui/icons';
import { T } from '../ui/Text';

// Flow 04 sheet pieces (prototype v8 §1.4): `.sheet` padding 10/20/28 with 14 pt gaps, `.chip`, `.group`,
// `.field` labels, inline `.err`. The sheet itself is a native formSheet (Design_Identity platform deltas).

export function SheetScroll({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: c.sheetSurf }}
      contentContainerStyle={{ paddingTop: 22, paddingHorizontal: 20, paddingBottom: 28, gap: 14 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function SheetHeader({
  title,
  size = 32,
  onClose,
  left,
}: {
  title: string;
  size?: number;
  onClose?: () => void;
  left?: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {left}
      <View style={{ flex: 1 }}>
        <DisplayTitle size={size} line={1} color={c.text}>
          {title}
        </DisplayTitle>
      </View>
      {onClose ? (
        <IconButton label="Close" onPress={onClose}>
          <CloseIcon color={c.text} />
        </IconButton>
      ) : left ? (
        <View style={{ width: 44 }} />
      ) : null}
    </View>
  );
}

export function Label({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <T size={13} weight="700" color={c.muted} accessible={false}>
      {children}
    </T>
  );
}

export function ErrorText({ children, id }: { children: string; id?: string }) {
  const { c } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)} nativeID={id}>
      <T size={13} weight="600" color={c.err}>
        {children}
      </T>
    </Animated.View>
  );
}

/** `.chip` (36 pt; hitSlop makes the target 44 pt). */
export function Chip({
  label,
  on,
  onPress,
  dashed,
  swatch,
  style,
  a11yLabel,
}: {
  label: string;
  on?: boolean;
  onPress: () => void;
  dashed?: boolean;
  swatch?: string;
  style?: ViewStyle;
  a11yLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        {
          height: 36,
          paddingHorizontal: 12,
          borderRadius: 18,
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: dashed ? c.acc2 : on ? c.text : c.line,
          backgroundColor: on ? c.text : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {swatch ? (
        <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: swatch }} />
      ) : null}
      <T size={13} weight="700" color={dashed ? c.acc2 : on ? c.bg : c.soft} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

/** `.group` with `.grow` rows (52 pt, 1 pt line between rows). */
export function Group({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ borderRadius: 16, backgroundColor: c.surf2, overflow: 'hidden' }}>
      {children}
    </View>
  );
}
export function GroupRow({
  icon,
  label,
  right,
  last,
  onPress,
  a11y,
}: {
  icon: ReactNode;
  label: string;
  right: ReactNode;
  last?: boolean;
  onPress?: () => void;
  a11y?: { label: string; value?: string; hint?: string };
}) {
  const { c } = useTheme();
  const body = (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.line,
      }}
    >
      {icon}
      <T size={15} weight="600" style={{ flex: 1 }}>
        {label}
      </T>
      {right}
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y?.label ?? label}
      accessibilityValue={a11y?.value ? { text: a11y.value } : undefined}
      accessibilityHint={a11y?.hint}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}

const asDate = (min: number) => new Date(2000, 0, 1, Math.floor(min / 60) % 24, min % 60);

/** Native iOS time picker (compact, 5-minute steps) in the prototype's 52 pt field box. */
export function TimeField({
  label,
  value,
  onChange,
  bad,
  testID,
}: {
  label: string;
  value: number;
  onChange: (min: number) => void;
  bad?: boolean;
  testID?: string;
}) {
  const { c, isLight } = useTheme();
  return (
    <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
      <Label>{label}</Label>
      <View
        style={{
          height: 52,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: bad ? c.err : c.line,
          backgroundColor: c.surf,
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingHorizontal: 6,
        }}
      >
        <DateTimePicker
          testID={testID}
          accessibilityLabel={label}
          mode="time"
          display="compact"
          minuteInterval={5}
          value={asDate(value)}
          themeVariant={isLight ? 'light' : 'dark'}
          accentColor={c.acc}
          onValueChange={(_e, d) => {
            if (d) onChange(d.getHours() * 60 + d.getMinutes());
          }}
        />
      </View>
    </View>
  );
}
