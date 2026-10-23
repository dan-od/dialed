import { createContext, useMemo, useRef, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  View,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, useTheme } from '../theme/theme';
import { BackIcon } from './icons';
import { dialogIn, pageIn } from './motion';
import { DisplayTitle } from './DisplayTitle';
import { T } from './Text';

/** Page container: bg, entrance (18 pt slide + fade), safe-area aware. */
export function Page({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Animated.View entering={pageIn(reduce)} style={{ flex: 1, backgroundColor: c.bg }}>
      {children}
    </Animated.View>
  );
}

/** `.hdr`: top inset stands in for the prototype's 50 pt; left 20, right 16; 44 pt row. */
export function Header({ left, right }: { left: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: Math.max(50, insets.top),
        paddingLeft: 20,
        paddingRight: 16,
        minHeight: Math.max(50, insets.top) + 44,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {left}
      {right}
    </View>
  );
}

export function BackLink({
  label,
  onPress,
  a11yLabel,
}: {
  label: string;
  onPress: () => void;
  /** Spoken label when "Back to <label>" reads wrong (a sheet's plain "Back"). */
  a11yLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? `Back to ${label}`}
      onPress={onPress}
      hitSlop={6}
      style={{ height: 44, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 2 }}
    >
      <BackIcon color={c.acc2} />
      <T size={16} weight="600" color={c.acc2}>
        {label}
      </T>
    </Pressable>
  );
}

/** Lets a focused field bring itself into view above the keyboard. */
export const FormScrollContext = createContext<{ reveal: (node: ViewInstance | null) => void }>({
  reveal: () => {},
});

/** Form page body: `.scroll` with padding-top 8 and bottom 110; focused fields scroll above the keyboard. */
export function FormScroll({ children }: { children: ReactNode }) {
  const scroll = useRef<ScrollViewInstance>(null);
  const content = useRef<ViewInstance>(null);
  const ctx = useMemo(
    () => ({
      reveal: (node: ViewInstance | null) => {
        if (!node || !content.current) return;
        // Keep the field ~120 pt from the top so it stays clear of the keyboard on a 667 pt screen too.
        node.measureLayout(
          content.current,
          (_x: number, y: number) =>
            scroll.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
          () => {},
        );
      },
    }),
    [],
  );
  return (
    <FormScrollContext.Provider value={ctx}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 110 }}
        automaticallyAdjustKeyboardInsets
      >
        <View ref={content}>{children}</View>
      </ScrollView>
    </FormScrollContext.Provider>
  );
}

/** `.h1` page title in Anton, hero colour, line height .9, auto-fit down to 26 pt per longest word. */
export function H1({ children, size, upper }: { children: string; size: number; upper?: boolean }) {
  const { c } = useTheme();
  return (
    <DisplayTitle size={size} color={c.hero} upper={upper}>
      {children}
    </DisplayTitle>
  );
}

export function Sub({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <T size={15} weight="500" color={c.muted} style={{ marginTop: 8, lineHeight: 20 }}>
      {children}
    </T>
  );
}

/** Centred dialog for destructive/irreversible actions only; scrim never dismisses it. */
export function Dialog({
  visible,
  title,
  body,
  children,
}: {
  visible: boolean;
  title: string;
  body: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View
        entering={FadeIn.duration(250)}
        style={{
          flex: 1,
          backgroundColor: c.scrim,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          entering={dialogIn(reduce)}
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={{
            width: 290,
            backgroundColor: c.surf,
            borderRadius: 22,
            padding: 20,
            gap: 10,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 25,
            shadowOffset: { width: 0, height: 20 },
          }}
        >
          <T size={18} weight="700">
            {title}
          </T>
          <T size={14} color={c.muted} style={{ lineHeight: 20 }}>
            {body}
          </T>
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export const displayFont = fonts.display;
