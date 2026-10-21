import { useRef } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { fonts, useTheme } from '../theme/theme';
import { T } from '../ui/Text';
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
  const last = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y - last.current > 6 && y > 24) onCollapse(true);
    else if (last.current - y > 6 || y < 4) onCollapse(false);
    last.current = y;
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
                style={{ width: 62, fontFamily: fonts.display, fontSize: 22, color: c.sheetTime }}
              >
                {r.time}
              </Text>
              <T size={16} weight={r.quiet ? '500' : '700'} color={c.sheetFg} style={{ flex: 1 }}>
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
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}
