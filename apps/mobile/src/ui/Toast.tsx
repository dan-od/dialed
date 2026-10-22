import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast as toastTokens } from '@dialed/tokens';
import { fonts, useTheme } from '../theme/theme';
import { toastIn } from './motion';
import { T } from './Text';

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; onPress: () => void };
}

interface ToastCtx {
  show: (text: string, action?: ToastMsg['action']) => void;
  msg: ToastMsg | null;
  clear: () => void;
  anchors: Record<string, number>;
  setAnchor: (id: string, bottom: number | null) => void;
  /** Measured height of the toast on screen (0 until laid out). */
  height: number;
  setHeight: (h: number) => void;
}
const Ctx = createContext<ToastCtx>({
  show: () => {},
  msg: null,
  clear: () => {},
  anchors: {},
  setAnchor: () => {},
  height: 0,
  setHeight: () => {},
});
export const useToast = () => useContext(Ctx).show;

/** Gap between a toast and the bottom actions or nav it sits above. */
export const TOAST_GAP = 12;

/**
 * Toast distance from the bottom of the screen: above the highest registered bottom chrome (floating nav,
 * pinned buttons), never over it. Without any, it clears the home indicator.
 */
export function toastBottom(anchors: number[], safeBottom: number): number {
  const chrome = anchors.length ? Math.max(...anchors) : Math.max(safeBottom, 12);
  return chrome + TOAST_GAP;
}

/** Until the toast is laid out, lists assume a two-line toast. */
export const TOAST_EST_HEIGHT = 66;

/** Distance from the screen bottom a list's last row must clear while a toast shows. */
export function toastClearance(anchors: number[], safeBottom: number, toastHeight: number): number {
  return toastBottom(anchors, safeBottom) + toastHeight + TOAST_GAP;
}
/** A list's bottom padding: its own, or more while a toast would otherwise cover the last row. */
export const listBottom = (base: number, clearance: number) => Math.max(base, clearance);

/** 0 when no toast shows; otherwise how much of the screen bottom the toast and the chrome below it take. */
export function useToastClearance(): number {
  const { msg, anchors, height } = useContext(Ctx);
  // Read without throwing: lists also render in tests and previews without a SafeAreaProvider.
  const insets = useContext(SafeAreaInsetsContext);
  if (!msg) return 0;
  return toastClearance(Object.values(anchors), insets?.bottom ?? 0, height || TOAST_EST_HEIGHT);
}

/**
 * Bottom padding for a scrolling list that keeps its last row clear of a toast. If the list was scrolled to
 * its end when the toast appeared, it scrolls on so that row stays visible. Pass the list's scroll events.
 */
export function useToastAwareList(base: number, scroller: { current: ScrollViewInstance | null }) {
  const clearance = useToastClearance();
  // How far the list reaches below the screen's bottom edge (the Day panel runs under the home indicator).
  const [overshoot, setOvershoot] = useState(0);
  const { height: windowH } = useWindowDimensions();
  const measure = () =>
    scroller.current?.measureInWindow((_x, y, _w, h) =>
      setOvershoot(Math.max(0, Math.round(y + h - windowH))),
    );
  const paddingBottom = listBottom(base, clearance ? clearance + overshoot : 0);
  const atEnd = useRef(false);
  const prev = useRef(paddingBottom);
  useEffect(() => {
    const grew = paddingBottom > prev.current;
    prev.current = paddingBottom;
    if (!grew || !atEnd.current) return;
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [paddingBottom, scroller]);
  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 8;
  };
  return { paddingBottom, track, measure };
}

/**
 * A screen with actions pinned near the bottom declares how much of the bottom they occupy (points from the
 * screen's bottom edge to the top of the topmost control). Cleared when the screen unmounts.
 */
export function useToastAnchor(bottom: number | null) {
  const { setAnchor } = useContext(Ctx);
  const id = useId();
  useEffect(() => {
    setAnchor(id, bottom);
    return () => setAnchor(id, null);
  }, [bottom, id, setAnchor]);
}

/** One toast at a time; 3.8 s, 6 s with an action; announced politely. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const [anchors, setAnchors] = useState<Record<string, number>>({});
  const [height, setHeight] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    setMsg({ id: Date.now(), text, action });
    AccessibilityInfo.announceForAccessibility(text);
  }, []);
  const clear = useCallback(() => {
    setMsg(null);
    setHeight(0);
  }, []);
  const setAnchor = useCallback((id: string, bottom: number | null) => {
    setAnchors((prev) => {
      if (bottom === null) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return prev[id] === bottom ? prev : { ...prev, [id]: bottom };
    });
  }, []);
  useEffect(() => {
    if (!msg) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setMsg(null);
        setHeight(0);
      },
      msg.action ? toastTokens.withActionMs : 3800,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [msg]);
  return (
    <Ctx.Provider value={{ show, msg, clear, anchors, setAnchor, height, setHeight }}>
      {children}
    </Ctx.Provider>
  );
}

/** Renders the current toast; mount inside the ThemeProvider. */
export function ToastHost() {
  const { msg, clear, anchors, setHeight } = useContext(Ctx);
  const insets = useSafeAreaInsets();
  const bottom = toastBottom(Object.values(anchors), insets.bottom);
  return msg ? (
    <ToastView key={msg.id} msg={msg} onDone={clear} bottom={bottom} onHeight={setHeight} />
  ) : null;
}

function ToastView({
  msg,
  onDone,
  bottom,
  onHeight,
}: {
  msg: ToastMsg;
  onDone: () => void;
  bottom: number;
  onHeight: (h: number) => void;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Animated.View
      pointerEvents="box-none"
      entering={toastIn(reduce)}
      onLayout={(e) => onHeight(Math.ceil(e.nativeEvent.layout.height))}
      style={{ position: 'absolute', left: 28, right: 28, bottom, zIndex: 40 }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          // Owner review 2026-10-21: a surface that stands out from both the page and the Rest-of-today panel
          // (toastBg + toastLine edge; see packages/tokens/test/contrast.test.ts).
          backgroundColor: c.toastBg,
          borderWidth: 1.5,
          borderColor: c.toastLine,
          borderRadius: 16,
          paddingVertical: 12,
          paddingLeft: 16,
          paddingRight: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 13,
          shadowOffset: { width: 0, height: 10 },
        }}
      >
        <T size={14} weight="600" color={c.toastFg} style={{ flex: 1, lineHeight: 19 }}>
          {msg.text}
        </T>
        {msg.action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={{ top: 5, bottom: 5 }} // 34 pt button + 10 = 44 pt target
            onPress={() => {
              // Clear first: the action may show its own toast ("Put back.").
              const act = msg.action!;
              onDone();
              act.onPress();
            }}
            style={{
              height: 34,
              minWidth: 44,
              paddingHorizontal: 12,
              borderRadius: 10,
              backgroundColor: c.toastActBg,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: fonts.display,
                fontSize: 16,
                letterSpacing: 0.3,
                color: c.toastActFg,
              }}
            >
              {msg.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
