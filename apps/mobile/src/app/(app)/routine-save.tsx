import { addDays } from '@dialed/schedule';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { LARGE_TEXT } from '../../ui/largeText';
import { useApp } from '../../AppProvider';
import { DateField, SheetScroll } from '../../blocks/ui';
import { haptic } from '../../lib/haptics';
import { effectiveChoices, saveSentence, saveToast } from '../../routines/model';
import { useRoutinesUi } from '../../routines/RoutinesUi';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { DisplayTitle } from '../../ui/DisplayTitle';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { useSchedule } from '../../week/useSchedule';

type Choice = 'nextMonday' | 'today' | 'pick';

/**
 * Save sheet (prototype `applyRoutine`) with the effective-date choice from BACKEND_SETUP §3: Next Monday
 * (default) | Today | Pick a date. Past days never change.
 */
export default function RoutineSaveSheet() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { blocks, online } = useApp();
  const { data, now } = useSchedule();
  const ui = useRoutinesUi();
  const large = useWindowDimensions().fontScale >= LARGE_TEXT;
  const choices = effectiveChoices(now.date);
  const [choice, setChoice] = useState<Choice>('nextMonday');
  const [picked, setPicked] = useState(addDays(choices.nextMonday, 7));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const effective =
    choice === 'pick' ? picked : choice === 'today' ? choices.today : choices.nextMonday;
  const routine = data?.schedule.routines.find((r) => r.id === ui.draft?.routineId);
  const name = routine?.name ?? 'routine';

  // Leave once nothing is unsaved (so the editor's guard doesn't fire; the editor may already have reopened a
  // clean draft from the saved week): back to Routines.
  useEffect(() => {
    if (done && !ui.dirty) {
      router.dismissTo('/routines');
      toast(done);
    }
  }, [done, ui.dirty, router, toast]);

  const save = async () => {
    if (!ui.draft || busy) return;
    setBusy(true);
    try {
      await blocks.saveRoutine(ui.draft, effective, ui.alerts);
      haptic.success();
      const msg = saveToast(name, effective, now.date, online);
      await ui.clear();
      setDone(msg);
    } catch {
      setBusy(false);
      toast('That routine couldn’t be saved on this phone. Try again.');
    }
  };

  const opts: { id: Choice; label: string }[] = [
    { id: 'nextMonday', label: 'Next Monday' },
    { id: 'today', label: 'Today' },
    { id: 'pick', label: 'Pick a date' },
  ];
  return (
    <SheetScroll>
      <View accessibilityLabel="Save the routine" style={{ gap: 14 }}>
        <DisplayTitle size={32} line={1} color={c.text}>
          {`Save ${name}?`}
        </DisplayTitle>
        <T
          size={15}
          weight="500"
          color={c.muted}
          style={{ lineHeight: 20 }}
          accessibilityLiveRegion="polite"
        >
          {saveSentence(effective, now.date)}
        </T>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Changes start"
          style={{
            flexDirection: large ? 'column' : 'row',
            gap: 4,
            padding: 4,
            borderRadius: 16,
            backgroundColor: c.surf2,
          }}
        >
          {opts.map((o) => {
            const on = choice === o.id;
            return (
              <Pressable
                key={o.id}
                testID={`eff-${o.id}`}
                accessibilityRole="radio"
                accessibilityLabel={o.label}
                accessibilityState={{ checked: on }}
                hitSlop={{ top: 2, bottom: 2 }}
                onPress={() => {
                  haptic.selection();
                  setChoice(o.id);
                }}
                style={{
                  flex: 1,
                  minHeight: 40,
                  borderRadius: 12,
                  backgroundColor: on ? c.surf : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 6,
                }}
              >
                <T size={14} weight={on ? '800' : '600'} numberOfLines={1}>
                  {o.label}
                </T>
              </Pressable>
            );
          })}
        </View>
        {choice === 'pick' ? (
          <DateField
            label="Changes start on"
            testID="eff-date"
            value={picked}
            minimum={now.date}
            onChange={(v) => setPicked(v < now.date ? now.date : v)}
          />
        ) : null}
        <Button
          testID="apply-go"
          label={online ? 'Save routine' : 'Save on this phone'}
          busy={busy}
          onPress={() => void save()}
        />
        <Button kind="secondary" label="Keep editing" onPress={() => router.back()} />
      </View>
    </SheetScroll>
  );
}
