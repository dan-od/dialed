import { formatClock } from '@dialed/schedule';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, type ReactNode } from 'react';
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
  // Full-height sheets reach the home indicator; the last button scrolls clear of it.
  const { bottom } = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: c.sheetSurf }}
      contentContainerStyle={{
        paddingTop: 22,
        paddingHorizontal: 20,
        paddingBottom: 28 + bottom,
        gap: 14,
      }}
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

/** The prototype's `.inp` field showing plain text (no iOS capsule); tapping it opens the native wheel. */
export function PlainField({
  label,
  value,
  open,
  bad,
  onPress,
  testID,
  a11yLabel,
}: {
  label: string;
  value: string;
  open: boolean;
  bad?: boolean;
  onPress: () => void;
  testID?: string;
  a11yLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
      <Label>{label}</Label>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? `${label}, ${value}`}
        accessibilityHint={open ? 'Closes the picker' : 'Opens the picker'}
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        style={{
          minHeight: 52,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: bad ? c.err : open ? c.acc : c.line,
          backgroundColor: c.surf,
          justifyContent: 'center',
          paddingHorizontal: 14,
        }}
      >
        <T size={15} weight="600" numberOfLines={1}>
          {value}
        </T>
      </Pressable>
    </View>
  );
}

/**
 * Starts / Ends as plain text fields; tapping one opens the native wheel (5-minute steps) under the pair, tapping
 * it again (or the other field) closes or switches it. Owner direction 2026-10-23: no grey capsule.
 */
export function TimeRange({
  start,
  end,
  onStart,
  onEnd,
  badEnd,
  testIDs = ['start', 'end'],
}: {
  start: number;
  end: number;
  onStart: (min: number) => void;
  onEnd: (min: number) => void;
  badEnd?: boolean;
  testIDs?: [string, string];
}) {
  const { isLight, c } = useTheme();
  const [open, setOpen] = useState<'start' | 'end' | null>(null);
  const value = open === 'start' ? start : end;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PlainField
          label="Starts"
          testID={testIDs[0]}
          value={formatClock(start)}
          open={open === 'start'}
          onPress={() => setOpen((o) => (o === 'start' ? null : 'start'))}
        />
        <PlainField
          label="Ends"
          testID={testIDs[1]}
          value={formatClock(end)}
          open={open === 'end'}
          bad={badEnd}
          onPress={() => setOpen((o) => (o === 'end' ? null : 'end'))}
        />
      </View>
      {open ? (
        <View style={{ alignItems: 'center' }}>
          <DateTimePicker
            testID={`${testIDs[open === 'start' ? 0 : 1]}-wheel`}
            accessibilityLabel={open === 'start' ? 'Starts' : 'Ends'}
            mode="time"
            display="spinner"
            minuteInterval={5}
            value={asDate(value)}
            themeVariant={isLight ? 'light' : 'dark'}
            textColor={c.text}
            onValueChange={(_e, d) => {
              if (!d) return;
              const m = d.getHours() * 60 + d.getMinutes();
              if (open === 'start') onStart(m);
              else onEnd(m);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const asDay = (iso: string) => new Date(`${iso}T12:00:00`);
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sep 14, 2026" */
export const dateText = (iso: string) =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

/** A date as plain text in the field box; tapping opens the native date wheel under it. */
export function DateField({
  label,
  value,
  onChange,
  minimum,
  bad,
  testID,
  onClose,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimum?: string;
  bad?: boolean;
  testID?: string;
  /** Called when the wheel closes (save once, not on every tick). */
  onClose?: () => void;
}) {
  const { isLight, c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
      <PlainField
        label={label}
        testID={testID}
        value={dateText(value)}
        open={open}
        bad={bad}
        onPress={() => {
          if (open) onClose?.();
          setOpen(!open);
        }}
      />
      {open ? (
        <DateTimePicker
          testID={testID ? `${testID}-wheel` : undefined}
          accessibilityLabel={label}
          mode="date"
          display="spinner"
          value={asDay(value)}
          minimumDate={minimum ? asDay(minimum) : undefined}
          themeVariant={isLight ? 'light' : 'dark'}
          textColor={c.text}
          onValueChange={(_e, d) => {
            if (d) onChange(isoOf(d));
          }}
        />
      ) : null}
    </View>
  );
}
