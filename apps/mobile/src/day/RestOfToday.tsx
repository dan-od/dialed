import { useEffect, useRef } from 'react';
import {
  Pressable,
  useWindowDimensions,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type ScrollViewInstance,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { fonts, useTheme } from '../theme/theme';
import { T } from '../ui/Text';
import { useToastAwareList } from '../ui/Toast';
import { navScroll, type NavScrollState } from './navCollapse';
import { LARGE_TEXT } from '../ui/largeText';
import type { RowModel } from './model';

/** "Rest of today" sheet: the scroll container for the bottom of Day; drives the nav collapse. */
export function RestOfToday({
  rows,
  label,
  onRow,
  onCollapse,
}: {
  rows: RowModel[];
  label: string;
  onRow: (r: RowModel) => void;
  onCollapse: (mini: boolean) => void;
}) {
  const { c } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= LARGE_TEXT;
  const state = useRef<NavScrollState>({ anchor: 0, mini: false });
  // A just-added/changed row is brought into view so its New chip and flash are seen (Flow 04 exit).
  const scroller = useRef<ScrollViewInstance>(null);
  const listY = useRef(0);
  const viewH = useRef(0);
  const newKey = rows.find((r) => r.isNew)?.key ?? null;
  const shown = useRef<string | null>(null);
  const reveal = (key: string, y: number, h: number) => {
    if (key !== newKey || shown.current === key) return;
    shown.current = key;
    // After a frame: the list's content size must include the new row (and any toast room) first, or iOS
    // clamps the offset. The row sits a third of the way down, and always clear of the toast and nav.
    setTimeout(() => {
      const top = listY.current + y;
      const target = Math.max(top - viewH.current / 3, top + h - viewH.current + padRef.current);
      scroller.current?.scrollTo({ y: Math.max(0, target), animated: true });
    }, 120);
  };
  // While a toast shows, the end of the list makes room so the last row is never under it.
  const toastRoom = useToastAwareList(120, scroller);
  const padRef = useRef(toastRoom.paddingBottom);
  useEffect(() => {
    padRef.current = toastRoom.paddingBottom;
  }, [toastRoom.paddingBottom]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    toastRoom.track(e);
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const next = navScroll(
      state.current,
      contentOffset.y,
      contentSize.height,
      layoutMeasurement.height,
    );
    if (next.mini !== state.current.mini) onCollapse(next.mini);
    state.current = next;
  };
  return (
    <ScrollView
      ref={scroller}
      onLayout={(e) => {
        viewH.current = e.nativeEvent.layout.height;
        toastRoom.measure();
      }}
      accessibilityLabel="Rest of today"
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={{
        marginTop: 20,
        flex: 1,
        backgroundColor: c.sheetBg,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
      }}
      contentContainerStyle={{
        paddingTop: 20,
        paddingHorizontal: 20,
        paddingBottom: toastRoom.paddingBottom,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <T accessibilityRole="header" size={18} weight="700" color={c.sheetFg}>
          Rest of today
        </T>
        <T size={13} weight="600" color={c.sheetFg}>
          {label}
        </T>
      </View>
      <View
        style={{ marginTop: 6 }}
        onLayout={(e) => {
          listY.current = e.nativeEvent.layout.y;
        }}
      >
        {rows.length === 0 ? (
          <T weight="600" color={c.sheetFg} style={{ marginTop: 12 }}>
            Nothing else today. Enjoy the evening.
          </T>
        ) : (
          rows.map((r) => (
            <Pressable
              key={r.key}
              onLayout={
                r.isNew
                  ? (e) => reveal(r.key, e.nativeEvent.layout.y, e.nativeEvent.layout.height)
                  : undefined
              }
              accessibilityRole="button"
              accessibilityLabel={r.a11y}
              onPress={() => onRow(r)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: 11,
                  minHeight: 48,
                  borderBottomWidth: 1.5,
                  borderBottomColor: c.sheetLine,
                  opacity: pressed ? 0.7 : 1,
                },
                // Prototype `.row.new`: outlined in the row's text colour, with a one-off 1.2 s flash ring.
                r.isNew && {
                  marginVertical: 4,
                  marginHorizontal: -10,
                  paddingHorizontal: 10,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: c.sheetFg,
                },
              ]}
            >
              {r.isNew ? <FlashRing /> : null}
              <Text
                style={{
                  width: 62 * fontScale,
                  fontFamily: fonts.display,
                  fontSize: 22,
                  color: c.sheetTime,
                }}
                numberOfLines={1}
              >
                {r.time}
              </Text>
              {/* Large Dynamic Type: the duration moves under the title so long words never break. */}
              <View
                style={{
                  flex: 1,
                  flexDirection: stacked ? 'column' : 'row',
                  alignItems: stacked ? 'flex-start' : 'center',
                  gap: stacked ? 0 : 14,
                }}
              >
                <View
                  style={{
                    flex: stacked ? undefined : 1,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    columnGap: 6,
                  }}
                >
                  <T size={16} weight={r.quiet ? '500' : '700'} color={c.sheetFg}>
                    {r.title}
                  </T>
                  {r.isNew ? (
                    <View
                      style={{
                        backgroundColor: c.sheetFg,
                        borderRadius: 9,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                      }}
                    >
                      <T size={11} weight="800" color={c.sheetBg} style={{ lineHeight: 14 }}>
                        New
                      </T>
                    </View>
                  ) : null}
                  {r.pending ? (
                    <T size={12} weight="600" color={c.sheetFg}>
                      · waiting to sync
                    </T>
                  ) : null}
                </View>
                <T size={13} weight="600" color={c.sheetFg}>
                  {r.duration}
                </T>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

/** `@keyframes flash`: a 6 pt ring fading out over 1.2 s (none with Reduce Motion). */
function FlashRing() {
  const reduce = useReducedMotion();
  const v = useSharedValue(reduce ? 0 : 1);
  useEffect(() => {
    v.value = withTiming(0, { duration: 1200 });
  }, [v]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ scale: 1 + 0.02 * v.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: -8,
          bottom: -8,
          left: -8,
          right: -8,
          borderRadius: 20,
          borderWidth: 6,
          borderColor: 'rgba(255,241,232,0.35)',
        },
        style,
      ]}
    />
  );
}
