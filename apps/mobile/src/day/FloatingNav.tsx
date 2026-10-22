import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { PlusIcon, UpIcon } from '../ui/icons';
import { navIn } from '../ui/motion';
import { T } from '../ui/Text';

export type Tab = 'day' | 'week' | 'month';
const LABEL: Record<Tab, string> = { day: 'Day', week: 'Week', month: 'Month' };

/** Floating nav: Day · Week · Month · +; collapses to a pill (insets 28 → 120) when the Day sheet scrolls down. */
export function FloatingNav({
  active,
  mini,
  onTab,
  onPlus,
  onExpand,
  bottom,
}: {
  active: Tab;
  mini: boolean;
  onTab: (t: Tab) => void;
  onPlus: () => void;
  onExpand: () => void;
  bottom: number;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const inset = useAnimatedStyle(() => {
    const v = mini ? 120 : 28;
    const cfg = { duration: reduce ? 120 : 450, easing: Easing.bezier(0.16, 1, 0.3, 1) };
    return { left: withTiming(v, cfg), right: withTiming(v, cfg) };
  });
  const tab = (t: Tab) => {
    const on = t === active;
    return (
      <Pressable
        key={t}
        accessibilityRole="tab"
        accessibilityLabel={LABEL[t]}
        accessibilityState={{ selected: on }}
        onPress={() => onTab(t)}
        style={{
          flex: 1,
          borderRadius: 15,
          backgroundColor: on ? c.navOnBg : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* One line: during the collapse animation the cells narrow and must clip, not wrap. */}
        <T
          size={14}
          weight={on ? '700' : '600'}
          color={on ? c.navOnFg : c.navIdle}
          numberOfLines={1}
        >
          {LABEL[t]}
        </T>
      </Pressable>
    );
  };
  const plus = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a block"
      onPress={onPlus}
      style={{
        flex: mini ? undefined : 1,
        width: mini ? 46 : undefined,
        borderRadius: 15,
        backgroundColor: c.plusBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PlusIcon color={c.ink} />
    </Pressable>
  );
  return (
    <Animated.View
      entering={navIn(reduce)}
      accessibilityRole="tablist"
      accessibilityLabel="Views"
      style={[
        {
          position: 'absolute',
          bottom,
          height: 54,
          borderRadius: 20,
          backgroundColor: c.navBg,
          borderWidth: 1,
          borderColor: 'rgba(255,241,232,0.08)',
          padding: 5,
          zIndex: 5,
          shadowColor: '#140A05',
          shadowOpacity: 0.45,
          shadowRadius: 17,
          shadowOffset: { width: 0, height: 14 },
        },
        inset,
      ]}
    >
      <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
        {mini ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show Day, Week and Month"
              onPress={onExpand}
              style={{
                flex: 1,
                borderRadius: 15,
                backgroundColor: c.navOnBg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <T size={14} weight="700" color={c.navOnFg}>
                {LABEL[active]}
              </T>
              <UpIcon color={c.navOnFg} />
            </Pressable>
            {plus}
          </>
        ) : (
          <>
            {(['day', 'week', 'month'] as Tab[]).map(tab)}
            {plus}
          </>
        )}
      </View>
    </Animated.View>
  );
}
