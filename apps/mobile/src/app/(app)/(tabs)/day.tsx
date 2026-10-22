import { addDays, resolveDay } from '@dialed/schedule';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useApp } from '../../../AppProvider';
import { newEditDraft, useBlocksUi } from '../../../blocks/BlocksUi';
import { dateLabel, useClock } from '../../../clock/clock';
import { DayHeader } from '../../../day/DayHeader';
import { DayHero } from '../../../day/DayHero';
import { dayModel } from '../../../day/model';
import { useNavState } from '../../../day/navState';
import { RestOfToday } from '../../../day/RestOfToday';
import { SetupChooser } from '../../../day/SetupChooser';
import { useTheme } from '../../../theme/theme';
import { Notice } from '../../../ui/Notice';
import { TabPage } from '../../../ui/TabPage';
import { Spinner } from '../../../ui/Spinner';
import { T } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';

export default function DayScreen() {
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { data, sync, online, session, syncNow, toggleTheme } = useApp();
  const { setMini } = useNavState();
  const ui = useBlocksUi();
  const profile = data?.profile ?? null;
  const tz = profile?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const clock = useClock(tz);
  const name =
    profile?.display_name || (session.status === 'signedIn' ? session.user.display_name : '');

  const model = useMemo(() => {
    if (!data) return null;
    const today = resolveDay(clock.date, data.schedule);
    const pendingIds = new Set(data.pending);
    const tomorrow = resolveDay(addDays(clock.date, 1), data.schedule);
    return {
      // No routine block in any term → the setup chooser (C-0102), not an empty "Free day".
      setup: data.schedule.routineBlocks.filter((b) => !b.deleted_at).length === 0,
      m: dayModel({
        blocks: today.blocks,
        tomorrow: tomorrow.blocks,
        minute: clock.minute,
        dayStart: profile?.day_start_min ?? 540,
        dayEnd: profile?.day_end_min ?? 1440,
        width,
        isLight,
        colors: { acc: c.acc, barPast: c.barPast, barFut: c.barFut },
        pendingIds,
        highlight: ui.highlight,
      }),
      blocks: today.blocks,
    };
  }, [data, clock, profile, width, isLight, c, ui.highlight]);

  const soon = () => toast('That arrives with the next build step.');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TabPage>
        <DayHeader
          date={dateLabel(clock.date)}
          name={name}
          pending={sync.pending}
          syncing={sync.syncing && sync.pending > 0}
          paused={sync.problem === 'paused'}
          onSync={syncNow}
          onAccount={() => router.push('/account')}
          onPlan={soon}
          onTheme={() => void toggleTheme(isLight)}
        />
        {!online ? (
          <Notice stamp="Offline" text="You’re offline. Showing what’s saved on this phone." />
        ) : null}
        {!sync.hasData ? (
          <View
            style={{
              paddingHorizontal: 20,
              marginTop: 24,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'center',
            }}
          >
            {online ? <Spinner color={c.muted} /> : null}
            <T weight="600" color={c.muted}>
              {online ? 'Getting your week' : 'Connect once to get your week onto this phone.'}
            </T>
          </View>
        ) : model?.setup ? (
          <SetupChooser onPick={soon} />
        ) : model ? (
          <>
            <DayHero m={model.m} />
            <RestOfToday
              rows={model.m.rows}
              label={model.m.restLabel}
              onRow={(r) => {
                const b = model.blocks.find((x) => x.key === r.key);
                if (!b) return;
                ui.setEdit(newEditDraft(b));
                router.push('/edit');
              }}
              onCollapse={setMini}
            />
          </>
        ) : null}
      </TabPage>
    </View>
  );
}
