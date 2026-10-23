import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, AppState, Pressable, View } from 'react-native';
import type { Perm } from '../../blocks/form';
import { aiName } from '../../config';
import { notificationPermission } from '../../notifications/reminders';
import { clampCap, notifCount, notifParts, quietHoursText } from '../../settings/model';
import { SetCap, SetGroup, SetRow, SetSwitch, Stepper } from '../../settings/ui';
import { BackLink, H1, Header, Page } from '../../ui/Chrome';
import { ChevronIcon } from '../../ui/icons';
import { InlineMessage } from '../../ui/Inline';
import { T } from '../../ui/Text';
import { ToastAwareScroll } from '../../ui/ToastAwareScroll';
import { useSchedule } from '../../week/useSchedule';

const HEADS = [
  { v: null, label: 'Off' },
  { v: 5, label: '5 min' },
  { v: 10, label: '10 min' },
] as const;

/**
 * Notifications (Flow 09, prototype `notifSettings`): this phone's prefs, with a live count of what the rest of
 * today would bring. Quiet hours come from the profile (read-only until editing is approved).
 */
export default function NotificationsScreen() {
  const { c, data, prefs, setPrefs, now } = useSchedule();
  const router = useRouter();
  const [perm, setPerm] = useState<Perm>('granted');
  useEffect(() => {
    const check = () =>
      void notificationPermission()
        .then(setPerm)
        .catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);
  const p = data?.profile;
  const quiet = { start: p?.quiet_start_min ?? 0, end: p?.quiet_end_min ?? 540 };
  const count = useMemo(
    () =>
      data && p
        ? notifCount(
            data.schedule,
            p.profile_json?.block_alerts ?? {},
            prefs,
            new Date(),
            p.time_zone,
            quiet,
          )
        : 0,
    // `now` ticks every minute so the count follows the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, p, prefs, now.minute, quiet.start, quiet.end],
  );
  const heads = HEADS.find((h) => h.v === prefs.heads_up_min) ?? HEADS[0];
  const pickHeads = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Heads-up before they start',
        options: [...HEADS.map((h) => h.label), 'Cancel'],
        cancelButtonIndex: HEADS.length,
      },
      (i) => {
        const h = HEADS[i];
        if (h) void setPrefs({ heads_up_min: h.v });
      },
    );

  return (
    <Page>
      <Header left={<BackLink label="Settings" onPress={() => router.back()} />} />
      <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={56}>Notifications</H1>
        </View>
        <InlineMessage parts={notifParts(count, prefs.lock_mode)} />

        <SetCap>Work blocks</SetCap>
        <SetGroup>
          <SetRow
            label="Live Activity on the lock screen"
            small={
              prefs.lock_mode === 'live'
                ? 'Countdown and what’s next, for classes, projects and gym.'
                : 'Off: line only. Work blocks show in the line under the date instead.'
            }
            right={
              <SetSwitch
                testID="ns-la"
                label="Live Activity"
                value={prefs.lock_mode === 'live'}
                onChange={(on) => void setPrefs({ lock_mode: on ? 'live' : 'line' })}
              />
            }
          />
          <SetRow
            label="Heads-up before they start"
            small="Off by default, since the Live Activity already shows it."
            last
            right={
              <Pressable
                testID="ns-heads"
                accessibilityRole="button"
                accessibilityLabel="Heads-up before they start"
                accessibilityValue={{ text: heads.label }}
                onPress={pickHeads}
                style={{
                  width: 110,
                  height: 40,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: c.line,
                  backgroundColor: c.surf,
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <T size={14} weight="600" style={{ flex: 1 }}>
                  {heads.label}
                </T>
                <View style={{ transform: [{ rotate: '90deg' }] }}>
                  <ChevronIcon color={c.muted} size={14} />
                </View>
              </Pressable>
            }
          />
        </SetGroup>

        <SetCap>Meals and breaks</SetCap>
        <SetGroup>
          <SetRow
            label="Shown in the line under the date"
            small={
              'On the lock screen automatically, like "Dinner · 45m left, then Sermon Sync". No buzz.'
            }
            value="Always"
          />
          <SetRow
            label="Also send a quiet note"
            small="Off by default. No sound, no banner over other apps."
            last
            right={
              <SetSwitch
                testID="ns-meals"
                label="Meal and break notes"
                value={prefs.meal_notes}
                onChange={(v) => void setPrefs({ meal_notes: v })}
              />
            }
          />
        </SetGroup>

        <SetCap>Plans</SetCap>
        <SetGroup>
          <SetRow
            label={`When ${aiName()} finishes a plan`}
            small="Including plans sent from your AI app."
            last
            right={
              <SetSwitch
                testID="ns-plans"
                label="Plan notifications"
                value={prefs.plan_pushes}
                onChange={(v) => void setPrefs({ plan_pushes: v })}
              />
            }
          />
        </SetGroup>

        <SetCap>Limits</SetCap>
        <SetGroup>
          <SetRow
            label="At most per day"
            small="Extra ones are held back. The Live Activity doesn’t count."
            right={
              <Stepper
                value={prefs.daily_cap}
                min={1}
                max={20}
                unit="a day"
                onChange={(n) => void setPrefs({ daily_cap: clampCap(n) })}
              />
            }
          />
          <SetRow
            label="Quiet hours"
            small="Nothing between these times."
            value={quietHoursText(quiet.start, quiet.end)}
            last
          />
        </SetGroup>
        {perm === 'denied' ? (
          <InlineMessage
            parts={[
              { hot: 'Off in iPhone Settings,' },
              ' so none of this will fire. ',
              {
                link: 'Turn them on',
                onPress: () => router.push('/reminders-help'),
                testID: 'ns-perm',
              },
            ]}
          />
        ) : null}
      </ToastAwareScroll>
    </Page>
  );
}
