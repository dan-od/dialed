import { weekStartOf } from '@dialed/schedule';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { DisplayTitle } from '../../../../ui/DisplayTitle';
import { Header } from '../../../../ui/Chrome';
import { TabPage } from '../../../../ui/TabPage';
import { T } from '../../../../ui/Text';
import { LaneAxis, LaneRow } from '../../../../week/Lanes';
import { weekModel } from '../../../../week/model';
import { Seg } from '../../../../week/Seg';
import { ThemeButton } from '../../../../week/ThemeButton';
import { useSchedule } from '../../../../week/useSchedule';
import { haptic } from '../../../../lib/haptics';

/** Week lanes (Flow 03). `?start=YYYY-MM-DD` opens another week (from Month). */
export default function WeekScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ start?: string }>();
  const { data, now, c, isLight } = useSchedule();
  const start =
    params.start && /^\d{4}-\d{2}-\d{2}$/.test(params.start)
      ? weekStartOf(params.start)
      : weekStartOf(now.date);
  const w = useMemo(
    () => (data ? weekModel(data.schedule, start, now, { isLight }) : null),
    [data, start, now, isLight],
  );
  const openDay = (day: number) =>
    router.push({ pathname: '/week/cards', params: { start, day: String(day) } });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabPage>
        <Header
          left={
            <T accessibilityRole="header" size={16} weight="700">
              {w?.label ?? ''}
            </T>
          }
          right={<ThemeButton />}
        />
        {w ? (
          <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 110 }}>
            <View style={{ paddingHorizontal: 20 }}>
              <DisplayTitle size={64} color={c.hero}>
                {w.title}
              </DisplayTitle>
              <View
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <T size={15} weight="600" color={c.muted}>
                  {w.planned}
                </T>
                <Seg
                  value="lanes"
                  onChange={() =>
                    openDay(
                      Math.max(
                        0,
                        w.lanes.findIndex((l) => l.today),
                      ),
                    )
                  }
                />
              </View>
            </View>
            <LaneAxis />
            <View style={{ gap: 4, paddingHorizontal: 10 }}>
              {w.lanes.map((lane, i) => (
                <LaneRow
                  key={lane.date}
                  lane={lane}
                  index={i}
                  onPress={() => {
                    haptic.selection();
                    openDay(i);
                  }}
                />
              ))}
            </View>
            <View
              style={{
                marginTop: 12,
                marginHorizontal: 20,
                flexDirection: 'row',
                flexWrap: 'wrap',
                columnGap: 14,
                rowGap: 4,
              }}
            >
              {w.legend.map((l) => (
                <View key={l.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: l.color }}
                  />
                  <T size={12} weight="600" color={c.soft}>
                    {l.name}
                  </T>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </TabPage>
    </View>
  );
}
