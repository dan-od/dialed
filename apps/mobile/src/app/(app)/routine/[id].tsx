import { formatRange, overlapOf } from '@dialed/schedule';
import { useLocalSearchParams, useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useApp } from '../../../AppProvider';
import { useBlocksUi } from '../../../blocks/BlocksUi';
import { WEEKDAY_SHORT, WEEKDAYS } from '../../../blocks/form';
import { haptic } from '../../../lib/haptics';
import { dayHours, removeBlock, restoreBlock } from '../../../routines/draft';
import {
  addToDayLabel,
  copyDayLabel,
  dayTabLabel,
  editorStatus,
  emptyDayLine,
  hoursText,
  removedToast,
  shortDate,
} from '../../../routines/model';
import { useRoutinesUi } from '../../../routines/RoutinesUi';
import { fonts, useTheme } from '../../../theme/theme';
import { Button } from '../../../ui/Button';
import { BackLink, Dialog, H1, Header } from '../../../ui/Chrome';
import { CloseIcon, PlusIcon } from '../../../ui/icons';
import { D, T } from '../../../ui/Text';
import { LARGE_TEXT } from '../../../ui/largeText';
import { useToast } from '../../../ui/Toast';
import { ToastAwareScroll } from '../../../ui/ToastAwareScroll';

/** Routine editor (Flow 05, prototype `routineEdit`): a local draft of the week; Save sends one routine_save. */
export default function RoutineEditor() {
  const { c, isLight } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const reduce = useReducedMotion();
  const large = useWindowDimensions().fontScale >= LARGE_TEXT;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, online } = useApp();
  const ui = useRoutinesUi();
  const blocksUi = useBlocksUi();
  const [meals, setMeals] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (data && id && ui.draft?.routineId !== id) void ui.open(id, data.schedule);
  }, [data, id, ui]);

  // Back button and swipe-back both ask first when there are unsaved edits.
  usePreventRemove(ui.dirty && !leaving, () => {
    haptic.warning();
    setDiscard(true);
  });
  // Leave only after the cleared draft has re-rendered without unsaved changes (replaying the blocked action
  // after a cancelled swipe-back re-triggered the guard).
  useEffect(() => {
    if (leaving && !ui.dirty) navigation.goBack();
  }, [leaving, ui.dirty, navigation]);

  const s = data?.schedule;
  const routine = s?.routines.find((r) => r.id === id);
  const term = routine ? s?.terms.find((t) => t.id === routine.term_id) : undefined;
  const cats = useMemo(() => new Map((s?.categories ?? []).map((x) => [x.id, x])), [s]);
  const d = ui.draft && ui.draft.routineId === id ? ui.draft : null;
  if (!s || !routine || !term || !d) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const day = ui.day;
  const name = WEEKDAYS[day]!;
  const rows = d.days[day]!.map((b) => {
    const cat = cats.get(b.category_id);
    return {
      ...b,
      quiet: !!cat?.quiet,
      color: cat ? (isLight ? cat.color_light : cat.color_dark) : c.line,
    };
  });
  const shown = rows.filter((b) => meals || !b.quiet);
  const overlaps = new Set(
    rows
      .filter(
        (b) =>
          !b.quiet &&
          overlapOf(
            rows.filter((x) => x.id !== b.id),
            b.start_min,
            b.end_min,
          ),
      )
      .map((b) => b.id),
  );

  const remove = (bid: string, title: string) => {
    haptic.light();
    ui.update((x) => removeBlock(x, bid));
    toast(removedToast(title, day), {
      label: 'Undo',
      onPress: () => {
        ui.update((x) => restoreBlock(x, bid));
        toast('Put back.');
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header
        left={<BackLink label="Routines" onPress={() => router.back()} />}
        right={
          large ? undefined : (
            <T size={13} weight="600" color={c.muted} accessibilityLiveRegion="polite">
              {editorStatus(ui.dirty)}
            </T>
          )
        }
      />
      <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={52}>{term.name}</H1>
          {large ? (
            <T size={13} weight="600" color={c.muted} accessibilityLiveRegion="polite">
              {editorStatus(ui.dirty)}
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {[
              ['Starts', term.starts_on],
              ['Ends', term.ends_on],
            ].map(([l, v]) => (
              <View
                key={l}
                accessible
                accessibilityLabel={`${l} ${shortDate(v!)}`}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  backgroundColor: c.surf,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}
              >
                <T size={12} weight="600" color={c.muted}>
                  {l}
                </T>
                <D size={18}>{shortDate(v!)}</D>
              </View>
            ))}
          </View>
        </View>

        <View
          accessibilityRole="tablist"
          accessibilityLabel="Day of the week"
          style={{
            marginTop: 14,
            marginHorizontal: 16,
            flexDirection: 'row',
            flexWrap: large ? 'wrap' : 'nowrap',
            gap: 5,
          }}
        >
          {WEEKDAY_SHORT.map((w, i) => {
            const on = i === day;
            const h = dayHours(d, i, s.categories);
            return (
              <Pressable
                key={w}
                testID={`rtab-${i}`}
                accessibilityRole="tab"
                accessibilityLabel={dayTabLabel(i, h)}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.selection();
                  ui.setDay(i);
                }}
                style={{
                  flex: large ? undefined : 1,
                  flexBasis: large ? '23%' : undefined,
                  flexGrow: 1,
                  minHeight: 56,
                  paddingVertical: 4,
                  borderRadius: 14,
                  backgroundColor: on ? c.acc : c.surf,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <T size={12} weight="700" color={on ? c.ink : c.text} style={{ lineHeight: 15 }}>
                  {w}
                </T>
                <Text
                  style={{ fontFamily: fonts.display, fontSize: 15, color: on ? c.ink : c.text }}
                >
                  {hoursText(h)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            marginTop: 14,
            paddingHorizontal: 20,
            flexDirection: 'row',
            flexWrap: 'wrap',
            rowGap: 6,
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <T size={17} weight="700" accessibilityRole="header">
            {`Every ${name}`}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T size={13} weight="600" color={c.muted}>
              Meals and breaks
            </T>
            <Switch
              testID="meals-sw"
              accessibilityLabel="Show meals and breaks"
              value={meals}
              onValueChange={setMeals}
              trackColor={{ true: c.acc, false: c.line }}
              thumbColor={meals ? c.ink : c.muted}
              ios_backgroundColor={c.line}
            />
          </View>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          {shown.length === 0 ? (
            <T weight="600" color={c.muted} style={{ marginVertical: 14 }}>
              {emptyDayLine(day)}
            </T>
          ) : (
            shown.map((b) => (
              <Animated.View
                key={b.id}
                exiting={reduce ? FadeOut.duration(120) : FadeOut.duration(200)}
                layout={reduce ? undefined : LinearTransition.duration(200)}
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 48,
                    paddingVertical: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: c.surf2,
                  },
                  ui.highlight === b.id && {
                    backgroundColor: c.surf2,
                    borderRadius: 12,
                    paddingHorizontal: 8,
                  },
                ]}
              >
                {large ? null : (
                  <Text
                    style={{ width: 94, fontFamily: fonts.display, fontSize: 15, color: c.text }}
                  >
                    {formatRange(b.start_min, b.end_min)}
                  </Text>
                )}
                <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: b.color }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  {large ? (
                    <Text style={{ fontFamily: fonts.display, fontSize: 15, color: c.text }}>
                      {formatRange(b.start_min, b.end_min)}
                    </Text>
                  ) : null}
                  <T weight={b.quiet ? '500' : '600'} style={{ lineHeight: 19 }}>
                    {b.title}
                  </T>
                  {overlaps.has(b.id) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View
                        style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.stamp }}
                      />
                      <T size={12} weight="600" color={c.muted}>
                        Overlaps
                      </T>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  testID={`rm-${b.title}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${b.title} from every ${name}`}
                  hitSlop={2}
                  onPress={() => remove(b.id, b.title)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon color={c.text} />
                </Pressable>
              </Animated.View>
            ))
          )}
        </View>

        <View
          style={{
            marginTop: 12,
            paddingHorizontal: 20,
            flexDirection: large ? 'column' : 'row',
            gap: 8,
          }}
        >
          <Pressable
            testID="add-to-day"
            accessibilityRole="button"
            accessibilityLabel={`Add to every ${name}`}
            onPress={() => {
              blocksUi.setAdd({
                date: term.starts_on,
                title: '',
                category_id: null,
                start: 1320,
                end: 1380,
                repeat: true,
                alert: null,
                overlapOk: false,
                dirty: false,
                mode: 'routine',
                weekday: day,
                routineId: d.routineId,
              });
              router.push('/add');
            }}
            style={{
              flex: large ? undefined : 1,
              minHeight: 50,
              borderRadius: 16,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: c.acc2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <PlusIcon color={c.acc2} />
            <T weight="700" color={c.acc2}>
              {addToDayLabel(day)}
            </T>
          </Pressable>
          <View style={{ flex: large ? undefined : 1 }}>
            <Button
              testID="copy-day"
              kind="secondary"
              label={copyDayLabel(day)}
              onPress={() => router.push('/routine-copy')}
            />
          </View>
        </View>

        <View style={{ marginTop: 16, paddingHorizontal: 20 }}>
          {!online ? (
            <T size={13} weight="600" color={c.muted} style={{ marginBottom: 8 }}>
              You’re offline. Saving keeps it on this phone until you reconnect.
            </T>
          ) : null}
          <Button
            testID="save-routine"
            label="Save routine"
            disabled={!ui.dirty}
            onPress={() => router.push('/routine-save')}
          />
        </View>
      </ToastAwareScroll>
      <Dialog
        visible={discard}
        title="Discard routine changes?"
        body={`Your edits to ${term.name} haven’t been saved.`}
      >
        <Button
          kind="secondary"
          label="Keep editing"
          style={{ marginTop: 6 }}
          onPress={() => setDiscard(false)}
        />
        <Button
          kind="destructive"
          label="Discard"
          onPress={() => {
            haptic.warning();
            setDiscard(false);
            setLeaving(true);
            void ui.clear();
          }}
        />
      </Dialog>
    </View>
  );
}
