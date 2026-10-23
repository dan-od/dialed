import { useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useApp } from '../../AppProvider';
import { DateField, ErrorText, Label, SheetHeader, SheetScroll } from '../../blocks/ui';
import { FEATURES } from '../../config';
import { haptic } from '../../lib/haptics';
import { nameTermDefaults, nameTermError, weeksHelper } from '../../routines/model';
import { useRoutinesUi } from '../../routines/RoutinesUi';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { useSchedule } from '../../week/useSchedule';

/**
 * Name your term (NAT-11, prototype "New screens to approve"). D-35: awaiting owner approval, so it only
 * opens with the d35Screens feature flag on.
 */
export default function NameTermSheet() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { blocks } = useApp();
  const { data, now } = useSchedule();
  const ui = useRoutinesUi();
  const init = nameTermDefaults(now.date);
  const [name, setName] = useState(init.name);
  const [starts, setStarts] = useState(init.starts);
  const [ends, setEnds] = useState(init.ends);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!FEATURES.d35Screens) return null;

  const create = async () => {
    const e = nameTermError(name, starts, ends);
    setError(e);
    if (e) {
      if (e.startsWith('Ends')) haptic.warning();
      return;
    }
    if (!data || busy) return;
    setBusy(true);
    try {
      const r = await blocks.createTerm(name, starts, ends);
      await ui.open(r.routineId, data.schedule);
      ui.setDay(0);
      haptic.success();
      router.replace({ pathname: '/routine/[id]', params: { id: r.routineId } });
      toast(`${name.trim()} created. Add your Monday blocks.`);
    } catch {
      setBusy(false);
      toast('That term couldn’t be saved on this phone. Try again.');
    }
  };

  const date = (label: string, value: string, set: (v: string) => void) => (
    <DateField
      label={label}
      value={value}
      onChange={(v) => {
        set(v);
        setError(null);
      }}
    />
  );

  return (
    <SheetScroll>
      <View accessibilityLabel="Name your term" style={{ gap: 14 }}>
        <SheetHeader title="Name your term" size={28} onClose={() => router.back()} />
        <T size={15} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
          Your routine repeats every week between these dates. You can change them later in
          Settings.
        </T>
        <View style={{ gap: 6 }}>
          <Label>Name</Label>
          <TextInput
            testID="nt-name"
            accessibilityLabel="Name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            maxLength={40}
            selectionColor={c.acc}
            style={{
              height: 52,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: c.line,
              backgroundColor: c.surf,
              paddingHorizontal: 16,
              fontSize: 17,
              fontWeight: '600',
              color: c.text,
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {date('Starts', starts, setStarts)}
          {date('Ends', ends, setEnds)}
        </View>
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : (
          <T size={13} weight="600" color={c.muted}>
            {weeksHelper(starts, ends)}
          </T>
        )}
        <Button
          testID="nt-go"
          label="Create and add blocks"
          busy={busy}
          onPress={() => void create()}
        />
      </View>
    </SheetScroll>
  );
}
