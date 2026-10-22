import { ToastAwareScroll } from '../../../ui/ToastAwareScroll';
import { addDays } from '@dialed/schedule';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../../../theme/theme';
import { IconButton } from '../../../ui/Button';
import { Header } from '../../../ui/Chrome';
import { DisplayTitle } from '../../../ui/DisplayTitle';
import { BackIcon, RepeatIcon } from '../../../ui/icons';
import { TabPage } from '../../../ui/TabPage';
import { D, T } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';
import { MonthChart } from '../../../week/MonthChart';
import { monthModel } from '../../../week/model';
import { ThemeButton } from '../../../week/ThemeButton';
import { useSchedule } from '../../../week/useSchedule';

const prevMonth = (m: string) => addDays(`${m}-01`, -1).slice(0, 7);

/** Month poster + day chart + weeks list (Flow 03). `?month=YYYY-MM` shows an earlier month. */
export default function MonthScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ month?: string }>();
  const { data, now, c, isLight } = useSchedule();
  const { fontScale } = useWindowDimensions();
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : now.date.slice(0, 7);
  const m = useMemo(
    () => (data ? monthModel(data.schedule, month, now, { isLight }) : null),
    [data, month, now, isLight],
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabPage>
        <Header
          left={
            <IconButton
              label="Previous month"
              onPress={() => router.setParams({ month: prevMonth(month) })}
            >
              <BackIcon color={c.text} />
            </IconButton>
          }
          right={
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <RoutinesPill onPress={() => toast('Routines arrive with the next build step.')} />
              <ThemeButton />
            </View>
          }
        />
        {m ? (
          <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8 }}>
            <View
              style={{
                paddingHorizontal: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <DisplayTitle size={132} line={0.85} letterSpacing={-2} color={c.hero}>
                  {m.month}
                </DisplayTitle>
              </View>
              <View
                style={{ alignItems: 'flex-end', paddingBottom: 4 }}
                accessible
                accessibilityLabel={`${m.month} ${m.year}. ${m.planned}, ${m.done}, ${m.toGo}.`}
              >
                <D size={34} style={{ lineHeight: 38 }}>
                  {m.year}
                </D>
                {[m.planned, m.done, m.toGo].map((line, i) => (
                  <T
                    key={i}
                    size={13}
                    weight="600"
                    color={c.muted}
                    style={{ marginTop: i === 0 ? 4 : 0, lineHeight: 19 }}
                  >
                    {line}
                  </T>
                ))}
              </View>
            </View>
            <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
              <MonthChart days={m.days} axis={m.axis} notes={m.axisNotes} />
            </View>
            <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <T accessibilityRole="header" size={17} weight="700">
                  Weeks
                </T>
                <T size={13} weight="600" color={c.muted}>
                  Tap a week to open it
                </T>
              </View>
              <View style={{ marginTop: 8, gap: 4 }}>
                {m.weeks.map((w) => (
                  <Pressable
                    key={w.start}
                    accessibilityRole="button"
                    accessibilityLabel={w.a11y}
                    onPress={() =>
                      router.navigate({ pathname: '/week', params: { start: w.start } })
                    }
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      minHeight: 44,
                      borderRadius: 14,
                      backgroundColor: w.current ? c.surf2 : c.surf,
                      borderWidth: 1.5,
                      borderColor: w.current ? c.acc : 'transparent',
                      opacity: pressed ? 0.8 : w.past ? 0.6 : 1,
                    })}
                  >
                    <D
                      size={16}
                      numberOfLines={1}
                      style={{ width: 98 * fontScale, lineHeight: 22 }}
                    >
                      {w.label}
                    </D>
                    <View
                      style={{
                        flex: 1,
                        height: 10,
                        borderRadius: 3,
                        backgroundColor: c.track,
                        flexDirection: 'row',
                        gap: 2,
                        overflow: 'hidden',
                      }}
                    >
                      {w.bar.map((s, i) => (
                        <View
                          key={i}
                          style={{
                            width: `${s.width}%`,
                            borderRadius: 2,
                            backgroundColor: s.color,
                          }}
                        />
                      ))}
                    </View>
                    <D
                      size={16}
                      color={w.current ? c.hero : c.text}
                      style={{ width: 50 * fontScale, textAlign: 'right', lineHeight: 22 }}
                      numberOfLines={1}
                    >
                      {w.total}
                    </D>
                  </Pressable>
                ))}
              </View>
            </View>
          </ToastAwareScroll>
        ) : null}
      </TabPage>
    </View>
  );
}

function RoutinesPill({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Routines"
      onPress={onPress}
      style={({ pressed }) => ({
        height: 44,
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: c.surf2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <RepeatIcon color={c.acc2} />
      <T size={14} weight="600">
        Routines
      </T>
    </Pressable>
  );
}
