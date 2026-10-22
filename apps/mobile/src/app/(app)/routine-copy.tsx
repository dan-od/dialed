import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useApp } from '../../AppProvider';
import { WEEKDAYS } from '../../blocks/form';
import { SheetHeader, SheetScroll } from '../../blocks/ui';
import { haptic } from '../../lib/haptics';
import { copyDay } from '../../routines/draft';
import { copyToast, replacesLine } from '../../routines/model';
import { useRoutinesUi } from '../../routines/RoutinesUi';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { CheckIcon } from '../../ui/icons';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

/** Copy a day (prototype `copyDay`): replaces the picked days' blocks with copies; classes stay. */
export default function RoutineCopySheet() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { data } = useApp();
  const ui = useRoutinesUi();
  const [days, setDays] = useState<number[]>([]);
  const from = ui.day;
  const d = ui.draft;
  if (!d || !data) return null;
  const fixed = new Set(data.schedule.categories.filter((x) => x.protected).map((x) => x.id));
  const movable = (wd: number) => d.days[wd]!.some((b) => !fixed.has(b.category_id));
  const line = replacesLine(days.filter(movable).sort());

  const go = () => {
    const r = copyDay(d, from, days, randomUUID, fixed);
    if (r.error) {
      haptic.warning();
      toast(r.error);
      return;
    }
    ui.update(() => r.draft);
    haptic.light();
    router.back();
    toast(copyToast(from, [...days].sort()));
  };

  return (
    <SheetScroll>
      <View accessibilityLabel="Copy a day" style={{ gap: 14 }}>
        <SheetHeader title={`Copy ${WEEKDAYS[from]} to`} size={28} onClose={() => router.back()} />
        <T size={15} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
          Replaces the blocks on the days you pick. Classes on those days stay.
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {WEEKDAYS.map((w, i) => {
            if (i === from) return null;
            const on = days.includes(i);
            return (
              <Pressable
                key={w}
                testID={`cp-${i}`}
                accessibilityRole="checkbox"
                accessibilityLabel={w}
                accessibilityState={{ checked: on }}
                onPress={() => setDays((x) => (on ? x.filter((y) => y !== i) : [...x, i]))}
                style={{
                  flexBasis: '47%',
                  flexGrow: 1,
                  height: 44,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: on ? c.text : c.line,
                  backgroundColor: on ? c.text : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 12,
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    borderWidth: 1.5,
                    borderColor: on ? c.bg : c.muted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {on ? <CheckIcon color={c.bg} size={12} /> : null}
                </View>
                <T size={13} weight="700" color={on ? c.bg : c.soft}>
                  {w}
                </T>
              </Pressable>
            );
          })}
        </View>
        {line ? (
          <T size={13} weight="600" color={c.muted} accessibilityLiveRegion="polite">
            {line}
          </T>
        ) : null}
        <Button testID="cp-go" label="Copy" onPress={go} />
      </View>
    </SheetScroll>
  );
}
