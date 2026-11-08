import { instantAt, type IsoDate } from '@dialed/schedule';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';
import { nativeActivities } from '../../glance/activity';
import {
  CountdownPreview,
  DayRingPreview,
  LinePreview,
  LockBackdrop,
  NextPreview,
  NowPreview,
  RundownPreview,
  TimelinePreview,
  TodayPreview,
  UpNextPreview,
  WeekPreview,
} from '../../glance/GlancePreviews';
import { glancePreview, type GlancePreview } from '../../glance/preview';
import { buildSnapshot } from '../../glance/snapshot';
import { haptic } from '../../lib/haptics';
import { SetCap, SetGroup, SetRow, SetSwitch } from '../../settings/ui';
import { BackLink, H1, Header, Page } from '../../ui/Chrome';
import { InlineMessage } from '../../ui/Inline';
import { T } from '../../ui/Text';
import { ToastAwareScroll } from '../../ui/ToastAwareScroll';
import { useSchedule } from '../../week/useSchedule';

// Flow 08 Customize (D-14, D-81; prototype `lockEdit` / `homeEdit`): this phone's lock-screen mode, the line
// switch, and a guide to adding Dialed widgets in iOS's own editors, with previews drawn from live data.

export const MODE_TEXT = {
  live: 'Work blocks get a Live Activity. Meals, breaks and gaps show in the line under the date.',
  line: 'Everything shows in the line under the date: work, meals and breaks. No Live Activity.',
} as const;

export const HOW_TO = {
  lock: 'Touch and hold your Lock Screen, tap Customize, then Lock Screen. Tap the space under the clock and pick Dialed. Round ones take one space, wide ones two.',
  line: 'For the line, tap the date above the clock in the same editor and pick Dialed.',
  home: 'Touch and hold an empty spot on your Home Screen, tap Edit, then Add Widget, and search for Dialed.',
  rundown:
    'To show this week instead of today, or hide meals and breaks, touch and hold the Rundown or Today timeline and tap Edit Widget.',
} as const;

const LOCK = [
  {
    id: 'countdown',
    name: 'Countdown',
    size: 'Round',
    desc: 'Time left in the current block, or until the next one.',
    View: CountdownPreview,
  },
  {
    id: 'dayring',
    name: 'Day ring',
    size: 'Round',
    desc: 'Every work block today as a ring, with blocks left in the middle.',
    View: DayRingPreview,
  },
  {
    id: 'next',
    name: 'Up next',
    size: 'Wide',
    desc: 'The next block, when it starts and how long until then.',
    View: UpNextPreview,
  },
  {
    id: 'today',
    name: 'Today',
    size: 'Wide',
    desc: 'A timeline of today with a now marker and hours of work left.',
    View: TodayPreview,
  },
  {
    id: 'week',
    name: 'This week',
    size: 'Wide',
    desc: 'Hours done against hours planned, day by day.',
    View: WeekPreview,
  },
] as const;

const HOME = [
  {
    id: 'now',
    name: 'Now',
    size: 'Small',
    desc: 'Current block, countdown and what’s after.',
    View: NowPreview,
  },
  {
    id: 'upnext',
    name: 'Up next',
    size: 'Small',
    desc: 'Next block and how long until it starts.',
    View: NextPreview,
  },
  {
    id: 'rundown',
    name: 'Rundown',
    size: 'Medium',
    desc: 'Today’s next blocks, or this week’s hours.',
    View: RundownPreview,
  },
  {
    id: 'timeline',
    name: 'Today timeline',
    size: 'Large',
    desc: 'The whole day on a rail with a now line.',
    View: TimelinePreview,
  },
] as const;

function GuideItem({
  name,
  size,
  desc,
  children,
}: {
  name: string;
  size: string;
  desc: string;
  children: ReactNode;
}) {
  const { c } = useSchedule();
  return (
    <View
      accessible
      accessibilityLabel={`${name}, ${size}. ${desc}`}
      style={{
        gap: 10,
        padding: 12,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: c.line,
        backgroundColor: c.surf,
      }}
    >
      {children}
      <View>
        <T size={15} weight="800">
          {name}{' '}
          <T size={12} weight="600" color={c.muted}>
            {size}
          </T>
        </T>
        <T size={13} color={c.muted} style={{ lineHeight: 18 }}>
          {desc}
        </T>
      </View>
    </View>
  );
}

const Steps = ({ text }: { text: string }) => {
  const { c } = useSchedule();
  return (
    <T size={14} color={c.muted} style={{ lineHeight: 20, paddingHorizontal: 20, marginTop: 8 }}>
      {text}
    </T>
  );
};

export default function CustomizeScreen() {
  const { c, data, prefs, setPrefs, now } = useSchedule();
  const router = useRouter();
  const [laOn, setLaOn] = useState(true);
  useEffect(() => {
    const check = () => setLaOn(nativeActivities()?.activitiesEnabled() ?? true);
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  const p = data?.profile;
  const preview: GlancePreview | null = useMemo(() => {
    if (!data || !p) return null;
    // The app's clock (the dev clock in proof runs), as an instant.
    const at = instantAt(now.date as IsoDate, now.minute, p.time_zone);
    return glancePreview(buildSnapshot(data.schedule, prefs, p.time_zone, at), at, 'dark');
  }, [data, p, prefs, now.date, now.minute]);

  const live = prefs.lock_mode === 'live';
  const modes = [
    { id: 'live', label: 'Live Activity + line' },
    { id: 'line', label: 'Line only' },
  ] as const;

  return (
    <Page>
      <Header left={<BackLink label="Notifications" onPress={() => router.back()} />} />
      <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <H1 size={44}>Lock screen and widgets</H1>
          <T size={13} weight="700" color={c.muted}>
            Show what’s on as
          </T>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Lock screen mode"
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 4,
              padding: 4,
              borderRadius: 16,
              backgroundColor: c.surf2,
            }}
          >
            {modes.map((m) => {
              const on = prefs.lock_mode === m.id;
              return (
                <Pressable
                  key={m.id}
                  testID={`cz-mode-${m.id}`}
                  accessibilityRole="radio"
                  accessibilityLabel={m.label}
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    if (on) return;
                    haptic.selection();
                    void setPrefs({ lock_mode: m.id });
                  }}
                  style={{
                    flexGrow: 1,
                    flexBasis: 140,
                    minHeight: 40,
                    borderRadius: 12,
                    backgroundColor: on ? c.surf : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 6,
                  }}
                >
                  <T size={14} weight={on ? '800' : '600'}>
                    {m.label}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <T
            testID="cz-mode-text"
            size={13}
            weight="500"
            color={c.muted}
            style={{ lineHeight: 18 }}
            accessibilityLiveRegion="polite"
          >
            {MODE_TEXT[prefs.lock_mode]}
          </T>
        </View>

        {live ? (
          <SetGroup>
            <SetRow
              label="Line under the date"
              small="Meals, breaks and what’s next."
              last
              right={
                <SetSwitch
                  testID="cz-line"
                  label="Line under the date"
                  value={prefs.line_on}
                  onChange={(v) => void setPrefs({ line_on: v })}
                />
              }
            />
          </SetGroup>
        ) : null}

        {live && !laOn ? (
          <InlineMessage
            parts={[
              { hot: 'Live Activities are off in iPhone Settings.' },
              ' Work blocks show in the line until you turn them on. ',
              {
                link: 'Open Settings',
                onPress: () => void Linking.openSettings(),
                testID: 'cz-la-settings',
              },
            ]}
          />
        ) : null}

        <SetCap>Lock Screen widgets</SetCap>
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          <GuideItem
            name="Line under the date"
            size="Line"
            desc="What’s now or next, above the clock."
          >
            <LockBackdrop>
              {preview ? (
                <LinePreview p={preview} />
              ) : (
                <T size={15} weight="600" color="#FFFFFF">
                  Set up your week in Dialed
                </T>
              )}
            </LockBackdrop>
          </GuideItem>
          {LOCK.map(({ id, View: Preview, ...w }) => (
            <GuideItem key={id} {...w}>
              {preview && (id !== 'week' || preview.week) ? (
                <LockBackdrop>
                  <Preview p={preview} />
                </LockBackdrop>
              ) : null}
            </GuideItem>
          ))}
        </View>
        <Steps text={HOW_TO.lock} />
        <Steps text={HOW_TO.line} />

        <SetCap>Home Screen widgets</SetCap>
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          {HOME.map(({ id, View: Preview, ...w }) => (
            <GuideItem key={id} {...w}>
              {preview ? <Preview p={preview} /> : null}
            </GuideItem>
          ))}
        </View>
        <Steps text={HOW_TO.home} />
        <Steps text={HOW_TO.rundown} />
      </ToastAwareScroll>
    </Page>
  );
}
