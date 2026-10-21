import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { toastIn } from './motion';
import { toast as toastTokens } from '@dialed/tokens';
import { fonts, useTheme } from '../theme/theme';
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
}
const Ctx = createContext<ToastCtx>({ show: () => {}, msg: null, clear: () => {} });
export const useToast = () => useContext(Ctx).show;

/** One toast at a time, above the nav; 3.8 s, 6 s with an action; announced politely. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    setMsg({ id: Date.now(), text, action });
    AccessibilityInfo.announceForAccessibility(text);
  }, []);
  const clear = useCallback(() => setMsg(null), []);
  useEffect(() => {
    if (!msg) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), msg.action ? toastTokens.withActionMs : 3800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [msg]);
  return <Ctx.Provider value={{ show, msg, clear }}>{children}</Ctx.Provider>;
}

/** Renders the current toast; mount inside the ThemeProvider. */
export function ToastHost() {
  const { msg, clear } = useContext(Ctx);
  return msg ? <ToastView key={msg.id} msg={msg} onDone={clear} /> : null;
}

function ToastView({ msg, onDone }: { msg: ToastMsg; onDone: () => void }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Animated.View
      pointerEvents="box-none"
      entering={toastIn(reduce)}
      style={{ position: 'absolute', left: 28, right: 28, bottom: 90, zIndex: 40 }}
    >
      <View>
        <View
          accessibilityLiveRegion="polite"
          style={{
            backgroundColor: c.toastBg,
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
              onPress={() => {
                msg.action!.onPress();
                onDone();
              }}
              style={{
                height: 34,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: c.acc,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: 16,
                  letterSpacing: 0.3,
                  color: c.ink,
                }}
              >
                {msg.action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
