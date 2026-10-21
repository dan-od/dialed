import { useRef } from 'react';
import {
  Pressable,
  useWindowDimensions,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { fonts, useTheme } from '../theme/theme';
import { T } from '../ui/Text';
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
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
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
      contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 120 }}
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
      <View style={{ marginTop: 6 }}>
        {rows.length === 0 ? (
          <T weight="600" color={c.sheetFg} style={{ marginTop: 12 }}>
            Nothing else today. Enjoy the evening.
          </T>
        ) : (
          rows.map((r) => (
            <Pressable
              key={r.key}
              accessibilityRole="button"
              accessibilityLabel={r.a11y}
              onPress={() => onRow(r)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 11,
                minHeight: 48,
                borderBottomWidth: 1.5,
                borderBottomColor: c.sheetLine,
                opacity: pressed ? 0.7 : 1,
              })}
            >
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
                <T
                  size={16}
                  weight={r.quiet ? '500' : '700'}
                  color={c.sheetFg}
                  style={{ flex: stacked ? undefined : 1 }}
                >
                  {r.title}
                  {r.pending ? (
                    <T size={12} weight="600" color={c.sheetFg}>
                      {' · waiting to sync'}
                    </T>
                  ) : null}
                </T>
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
