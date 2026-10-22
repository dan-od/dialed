import { resolveDay, termFor, weekdayOf, weekStartOf } from '@dialed/schedule';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBlocksUi, newAddDraft } from '../../blocks/BlocksUi';
import { WEEKDAY_SHORT } from '../../blocks/form';
import { aiName, FEATURES } from '../../config';
import { FloatingNav } from '../../day/FloatingNav';
import { baseWeek, dayHours } from '../../routines/draft';
import {
  dateRange,
  oneOffChanges,
  otherTermLine,
  shortDate,
  termStatus,
} from '../../routines/model';
import { useRoutinesUi } from '../../routines/RoutinesUi';
import { fonts } from '../../theme/theme';
import { BackLink, H1, Header, Sub } from '../../ui/Chrome';
import { AiMark, ChevronIcon, PlusIcon } from '../../ui/icons';
import { D, T } from '../../ui/Text';
import { useToast, useToastAnchor } from '../../ui/Toast';
import { ToastAwareScroll } from '../../ui/ToastAwareScroll';
import { useSchedule } from '../../week/useSchedule';
import { ThemeButton } from '../../week/ThemeButton';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Routines (Flow 05, prototype `routines`): the active term's week, other terms, one-off changes. */
export default function RoutinesScreen() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { data, now, c } = useSchedule();
  const routinesUi = useRoutinesUi();
  const blocksUi = useBlocksUi();
  const navBottom = Math.max(24, insets.bottom - 10);
  useToastAnchor(navBottom + 54);

  const m = useMemo(() => {
    if (!data) return null;
    const s = data.schedule;
    const live = s.terms
      .filter((t) => !t.deleted_at)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    const active =
      termFor(now.date, s.terms) ?? live.find((t) => !t.is_draft && t.ends_on >= now.date) ?? null;
    const routine = active ? s.routines.find((r) => r.term_id === active.id) : undefined;
    const hours = (routineId: string | undefined) => {
      if (!routineId) return [0, 0, 0, 0, 0, 0, 0];
      const w = baseWeek(s, routineId);
      return [0, 1, 2, 3, 4, 5, 6].map((d) => dayHours(w, d, s.categories));
    };
    const week = hours(routine?.id);
    const others = live
      .filter((t) => t.id !== active?.id && termStatus(t, now.date) !== 'Past')
      .map((t) => {
        const r = s.routines.find((x) => x.term_id === t.id);
        return {
          t,
          line: otherTermLine(t, active),
          total: hours(r?.id).reduce((a, b) => a + b, 0),
        };
      });
    return { active, routine, week, others, changes: oneOffChanges(s.overrides) };
  }, [data, now.date]);

  const total = m ? Math.round(m.week.reduce((a, b) => a + b, 0)) : 0;
  const max = m ? Math.max(1, ...m.week) : 1;

  const openEditor = async () => {
    if (!data || !m?.routine) return;
    await routinesUi.open(m.routine.id, data.schedule);
    routinesUi.setDay(0);
    router.push({ pathname: '/routine/[id]', params: { id: m.routine.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header
        left={
          <BackLink
            label={MONTHS[Number(now.date.slice(5, 7)) - 1]!}
            onPress={() => router.back()}
          />
        }
        right={<ThemeButton />}
      />
      <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={60}>Routines</H1>
          <Sub>
            Your repeating weeks. Every day in the calendar fills in from the routine that covers
            it.
          </Sub>
        </View>

        {m?.active && m.routine ? (
          <Pressable
            testID="routine-card"
            accessibilityRole="button"
            accessibilityLabel={`${m.active.name}, active now, ${dateRange(m.active)}, ${total} hours a week. Edit week.`}
            onPress={() => void openEditor()}
            style={({ pressed }) => ({
              marginTop: 16,
              marginHorizontal: 20,
              padding: 16,
              borderRadius: 24,
              backgroundColor: c.acc,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  height: 24,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: c.ink,
                  justifyContent: 'center',
                }}
              >
                <T size={12} weight="700" color="#FF8A57">
                  Active now
                </T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <T size={14} weight="700" color={c.ink}>
                  Edit week
                </T>
                <ChevronIcon color={c.ink} />
              </View>
            </View>
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexShrink: 1 }}>
                <D size={38} color={c.ink} style={{ lineHeight: 42 }}>
                  {m.active.name}
                </D>
                <T size={14} weight="600" color={c.ink} style={{ marginTop: 4 }}>
                  {dateRange(m.active)}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <D size={30} color={c.ink} style={{ lineHeight: 34 }}>
                  {`${total}h`}
                </D>
                <T size={12} weight="600" color={c.ink}>
                  a week
                </T>
              </View>
            </View>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                flexDirection: 'row',
                gap: 6,
                marginTop: 14,
                height: 54,
                alignItems: 'flex-end',
              }}
            >
              {m.week.map((h, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View
                    style={{
                      width: '100%',
                      height: Math.round((h / max) * 36),
                      borderRadius: 5,
                      backgroundColor: c.ink,
                    }}
                  />
                  <T size={11} weight="700" color={c.ink} style={{ lineHeight: 14 }}>
                    {WEEKDAY_SHORT[i]![0]}
                  </T>
                </View>
              ))}
            </View>
          </Pressable>
        ) : null}

        {m?.others.length ? (
          <View
            style={{
              marginTop: 14,
              marginHorizontal: 20,
              borderRadius: 20,
              backgroundColor: c.surf,
              overflow: 'hidden',
            }}
          >
            {m.others.map(({ t, line, total: h }, i) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`${t.name}. ${line}. ${t.is_draft ? 'Set up' : `${Math.round(h)} hours a week`}. Opens terms and dates.`}
                onPress={() => router.push('/terms')}
                style={({ pressed }) => ({
                  minHeight: 48,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderBottomWidth: i === m.others.length - 1 ? 0 : 1,
                  borderBottomColor: c.surf2,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ flex: 1 }}>
                  <T weight="700">{t.name}</T>
                  <T size={13} color={c.muted}>
                    {line}
                  </T>
                </View>
                {t.is_draft ? (
                  <T size={13} weight="700" color={c.acc2}>
                    Set up
                  </T>
                ) : (
                  <D size={18}>{`${Math.round(h)}h`}</D>
                )}
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: 10, marginHorizontal: 20, flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Describe a change to ${aiName()}`}
            onPress={() => toast(`Planning with ${aiName()} arrives with Flow 06.`)}
            style={{
              flex: 1,
              height: 50,
              borderRadius: 16,
              backgroundColor: c.surf,
              borderWidth: 1.5,
              borderColor: c.acc,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
            }}
          >
            <AiMark color={c.acc2} />
            <T size={15} weight="500" color={c.muted} numberOfLines={1}>
              {`Describe a change to ${aiName()}`}
            </T>
          </Pressable>
          {FEATURES.d35Screens ? (
            <Pressable
              testID="new-routine"
              accessibilityRole="button"
              accessibilityLabel="New routine"
              onPress={() => router.push('/name-term')}
              style={{
                width: 50,
                height: 50,
                borderRadius: 16,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.acc2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PlusIcon color={c.acc2} />
            </Pressable>
          ) : null}
        </View>

        {m?.changes.length ? (
          <View style={{ marginTop: 18, paddingHorizontal: 20 }}>
            <T size={17} weight="700" accessibilityRole="header">
              One-off changes
            </T>
            {m.changes.map((o) => (
              <Pressable
                key={o.date}
                accessibilityRole="button"
                accessibilityLabel={`${shortDate(o.date)}, ${o.title}. ${o.line}. Opens that day.`}
                onPress={() =>
                  router.push({
                    pathname: '/week/cards',
                    params: { start: weekStartOf(o.date), day: String(weekdayOf(o.date)) },
                  })
                }
                style={({ pressed }) => ({
                  minHeight: 48,
                  paddingVertical: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: c.surf2,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{ width: 52, fontFamily: fonts.display, fontSize: 18, color: c.muted }}
                >
                  {o.label}
                </Text>
                <View style={{ flex: 1 }}>
                  <T weight="700">{o.title}</T>
                  <T size={13} color={c.muted}>
                    {o.line}
                  </T>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ToastAwareScroll>
      <FloatingNav
        active="month"
        mini={false}
        bottom={navBottom}
        onTab={(t) => {
          router.dismissAll();
          router.navigate(`/${t}`);
        }}
        onPlus={() => {
          if (!data) return;
          blocksUi.flash(null);
          blocksUi.setAdd(
            newAddDraft(now.date, now.minute, resolveDay(now.date, data.schedule).blocks),
          );
          router.push('/add');
        }}
        onExpand={() => {}}
      />
    </View>
  );
}
