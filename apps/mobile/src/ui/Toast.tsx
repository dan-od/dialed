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
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
}
const Ctx = createContext<ToastCtx>({
  show: () => {},
  msg: null,
  clear: () => {},
  anchors: {},
  setAnchor: () => {},
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    setMsg({ id: Date.now(), text, action });
    AccessibilityInfo.announceForAccessibility(text);
  }, []);
  const clear = useCallback(() => setMsg(null), []);
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
    timer.current = setTimeout(() => setMsg(null), msg.action ? toastTokens.withActionMs : 3800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [msg]);
  return <Ctx.Provider value={{ show, msg, clear, anchors, setAnchor }}>{children}</Ctx.Provider>;
}

/** Renders the current toast; mount inside the ThemeProvider. */
export function ToastHost() {
  const { msg, clear, anchors } = useContext(Ctx);
  const insets = useSafeAreaInsets();
  const bottom = toastBottom(Object.values(anchors), insets.bottom);
  return msg ? <ToastView key={msg.id} msg={msg} onDone={clear} bottom={bottom} /> : null;
}

function ToastView({ msg, onDone, bottom }: { msg: ToastMsg; onDone: () => void; bottom: number }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Animated.View
      pointerEvents="box-none"
      entering={toastIn(reduce)}
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
              msg.action!.onPress();
              onDone();
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
