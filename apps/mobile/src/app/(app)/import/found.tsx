import { useState } from 'react';
import { AccessibilityInfo, ScrollView, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useApp } from '../../../AppProvider';
import { DateField } from '../../../blocks/ui';
import { aiName } from '../../../config';
import {
  addClassesLabel,
  addedToast,
  buildFoundModel,
  datesValid,
  foundTitle,
  NOTHING_FOUND,
  partialStamp,
  termDatesPayload,
  weekdayShort,
} from '../../../import/foundClasses';
import { openSettings, type TimetableSource } from '../../../import/pickTimetable';
import { useTimetableStart } from '../../../import/useTimetableStart';
import { haptic } from '../../../lib/haptics';
import { usePlan } from '../../../plan/usePlan';
import { useTheme } from '../../../theme/theme';
import { Button } from '../../../ui/Button';
import { BackLink, H1, Header, Page, Sub } from '../../../ui/Chrome';
import { PinnedFooter } from '../../../ui/PinnedFooter';
import { Spinner } from '../../../ui/Spinner';
import { Stamp } from '../../../ui/Stamp';
import { D, T } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';

const CAMERA_OFF = 'Camera access is off. Turn it on in Settings to take a photo.';

/** Flow 02 "Found N classes" (and "No classes found") for a timetable plan. */
export default function Found() {
  const { id, source, name } = useLocalSearchParams<{
    id: string;
    source?: TimetableSource;
    name?: string;
  }>();
  const { planApi, syncNow } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const { plan, setPlan, refresh } = usePlan(planApi, id);
  const [busy, setBusy] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [dates, setDates] = useState<{ startsOn: string; endsOn: string } | null>(null);
  const start = useTimetableStart(() => setCameraOff(true));

  const fromCamera = source === 'camera';
  const backLabel = fromCamera ? 'Retake' : 'Pick another';
  const goBackToSource = () => {
    setCameraOff(false);
    void start({ source: fromCamera ? 'camera' : undefined, replace: true });
  };

  if (!plan) {
    return (
      <Page>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner color={c.muted} size={24} />
        </View>
      </Page>
    );
  }

  const cameraStamp = cameraOff ? (
    <View style={{ gap: 8, marginTop: 12 }}>
      <Stamp text={CAMERA_OFF} />
      <Button kind="secondary" label="Open Settings" onPress={openSettings} />
    </View>
  ) : null;

  if (plan.status === 'failed' && plan.error_code === 'nothing_found') {
    return (
      <Page>
        <Header left={<BackLink label="Set up" onPress={() => router.dismissAll()} />} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <H1 size={56}>No classes found</H1>
          <Sub>{NOTHING_FOUND}</Sub>
          {cameraStamp}
        </ScrollView>
        <PinnedFooter>
          {fromCamera ? <Button kind="primary" label="Retake" onPress={goBackToSource} /> : null}
          <Button
            kind={fromCamera ? 'secondary' : 'primary'}
            label="Pick another"
            onPress={() => {
              setCameraOff(false);
              void start({ replace: true });
            }}
          />
          <Button
            kind="secondary"
            label="Describe instead"
            onPress={() => {
              router.dismissAll();
              router.push('/plan');
            }}
          />
        </PinnedFooter>
      </Page>
    );
  }

  const m = buildFoundModel(plan);
  const stale = plan.status === 'stale';
  const termName = m.term?.name ?? 'your schedule';
  const startsOn = dates?.startsOn ?? m.term?.startsOn ?? '';
  const endsOn = dates?.endsOn ?? m.term?.endsOn ?? '';
  const badDates = !!m.term && !datesValid(startsOn, endsOn);

  const toggle = async (changeId: string, value: boolean) => {
    haptic.selection();
    try {
      const updated = await planApi.toggle(id, changeId, { enabled: value });
      setPlan(updated);
      const n = buildFoundModel(updated).enabledCount;
      AccessibilityInfo.announceForAccessibility(addClassesLabel(n, termName));
    } catch {
      toast('Couldn’t update that class. Try again.');
    }
  };

  const saveDates = async (next: { startsOn: string; endsOn: string }) => {
    if (!m.term || !datesValid(next.startsOn, next.endsOn)) return;
    if (next.startsOn === m.term.startsOn && next.endsOn === m.term.endsOn) return;
    try {
      const updated = await planApi.toggle(id, m.term.changeId, {
        payload: termDatesPayload(m.term, next.startsOn, next.endsOn),
      });
      setPlan(updated);
    } catch {
      toast('Couldn’t save the term dates. Try again.');
    }
  };

  const add = async () => {
    if (busy || m.enabledCount === 0 || badDates) return;
    setBusy(true);
    try {
      await planApi.approve(id, { plan_version: plan.version });
      haptic.success();
      syncNow();
      const n = m.enabledCount;
      router.dismissAll();
      toast(addedToast(n, termName, aiName()), {
        label: 'Describe',
        onPress: () => router.push('/plan'),
      });
    } catch (e: unknown) {
      const err = e as { code?: string };
      haptic.warning();
      if (err.code === 'plan_changed') toast('This plan was just updated. Check it again.');
      else if (err.code !== 'plan_stale') toast('Couldn’t add the classes. Try again.');
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const fileName = name || 'your timetable';

  return (
    <Page>
      <Header
        left={<BackLink label={backLabel} a11yLabel={backLabel} onPress={goBackToSource} />}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={56}>{foundTitle(m.classes.length)}</H1>
          <Sub>{`From ${fileName}. Check the times, then add them.`}</Sub>
          {cameraStamp}
          {stale ? (
            <View style={{ marginTop: 12 }}>
              <Stamp text="Your schedule changed since this was read. Pick the file again." />
            </View>
          ) : m.lowConfidenceCount > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Stamp text={partialStamp(m.lowConfidenceCount)} />
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 14, gap: 8 }}>
          {m.classes.map((cl, i) => (
            <Animated.View
              key={cl.id}
              entering={reduce ? FadeIn.duration(150) : FadeInDown.delay(i * 60).duration(250)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: cl.checkThis ? c.err : c.line,
                backgroundColor: c.surf,
                opacity: cl.enabled ? 1 : 0.55,
              }}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <T size={16} weight="700" style={{ lineHeight: 20 }}>
                  {cl.title}
                </T>
                <View
                  style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}
                >
                  <D size={15}>{`${weekdayShort(cl.weekday)} ${cl.start}–${cl.end}`}</D>
                  <T size={13} weight="600" color={c.muted}>
                    {cl.kind}
                    {cl.room ? ` · ${cl.room}` : ''}
                  </T>
                </View>
                {cl.checkThis ? (
                  <T size={13} weight="700" color={c.err}>
                    Check these: this time was hard to read
                  </T>
                ) : null}
                {cl.overlap ? (
                  <T size={13} weight="600" color={c.muted}>
                    {cl.overlap}
                  </T>
                ) : null}
              </View>
              <Switch
                accessibilityLabel={`Include ${cl.title} ${cl.kind}`}
                value={cl.enabled}
                disabled={stale || busy}
                onValueChange={(v) => void toggle(cl.id, v)}
                trackColor={{ false: c.surf2, true: c.acc }}
              />
            </Animated.View>
          ))}
        </View>

        {m.term ? (
          <View style={{ paddingHorizontal: 20, marginTop: 14, flexDirection: 'row', gap: 8 }}>
            <DateField
              label="Term starts"
              testID="found-term-start"
              value={startsOn}
              bad={badDates}
              onChange={(v) => setDates({ startsOn: v, endsOn })}
              onClose={() => void saveDates({ startsOn, endsOn })}
            />
            <DateField
              label="Term ends"
              testID="found-term-end"
              value={endsOn}
              minimum={startsOn}
              bad={badDates}
              onChange={(v) => setDates({ startsOn, endsOn: v })}
              onClose={() => void saveDates({ startsOn, endsOn })}
            />
          </View>
        ) : null}
        {badDates ? (
          <T size={13} weight="600" color={c.err} style={{ paddingHorizontal: 20, marginTop: 6 }}>
            The term ends before it starts.
          </T>
        ) : null}
      </ScrollView>

      <PinnedFooter>
        <Button
          kind="primary"
          label={addClassesLabel(m.enabledCount, termName)}
          disabled={m.enabledCount === 0 || stale || busy || badDates}
          busy={busy}
          onPress={() => void add()}
        />
      </PinnedFooter>
    </Page>
  );
}
