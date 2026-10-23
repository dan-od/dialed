import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../../AppProvider';
import { SheetScroll } from '../../blocks/ui';
import { useClock } from '../../clock/clock';
import { haptic } from '../../lib/haptics';
import { categoryWeek, mergedToast, mergeSub } from '../../settings/model';
import { SetGroup, SetRow, Swatch } from '../../settings/ui';
import { useTheme } from '../../theme/theme';
import { BackLink } from '../../ui/Chrome';
import { DisplayTitle } from '../../ui/DisplayTitle';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

/**
 * Merge category (Flow 09, prototype `catMerge`), stacked over Edit: tap a category and every block moves
 * there, then this one goes away. The toast offers Undo (server keeps the merge for 10 minutes).
 */
export default function CategoryMergeSheet() {
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, categories, syncNow } = useApp();
  const now = useClock(data?.profile?.time_zone ?? 'America/Toronto');
  const [busy, setBusy] = useState(false);
  const all = useMemo(
    () =>
      (data?.schedule.categories ?? [])
        .filter((x) => !x.deleted_at)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    [data],
  );
  const from = all.find((x) => x.id === id);
  if (!from || !data) return null;
  const n = categoryWeek(data.schedule, now.date).get(from.id)?.blocks ?? 0;
  const others = all.filter((x) => x.id !== from.id);

  const pick = async (toId: string) => {
    if (busy) return;
    setBusy(true);
    const to = others.find((x) => x.id === toId)!;
    const r = await categories.merge(from.id, to.id);
    haptic.success();
    // Close both sheets back to Categories.
    router.dismissTo('/categories');
    toast(mergedToast(from.name, to.name, n), {
      label: 'Undo',
      onPress: async () => {
        syncNow();
        const done = await categories.unmerge(r.mutationId);
        toast(done === 'sent' ? 'Put back.' : 'Undo works once this phone is back online.');
      },
    });
  };

  return (
    <SheetScroll>
      <View accessibilityLabel="Merge category" style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BackLink label="Back" a11yLabel="Back to Edit category" onPress={() => router.back()} />
        </View>
        <DisplayTitle size={24} color={c.text}>
          {`Merge ${from.name}`}
        </DisplayTitle>
        <T size={15} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
          {mergeSub(n, from.name)}
        </T>
        <SetGroup inset={false}>
          {others.map((x, i) => (
            <SetRow
              key={x.id}
              testID={`cm-${x.name}`}
              left={<Swatch color={isLight ? x.color_light : x.color_dark} />}
              label={x.name}
              value={x.group_name}
              last={i === others.length - 1}
              a11yLabel={`Merge into ${x.name}`}
              disabled={busy}
              onPress={() => void pick(x.id)}
            />
          ))}
        </SetGroup>
        {from.protected ? (
          <T size={13} weight="500" color={c.muted} style={{ lineHeight: 18 }}>
            {`Blocks moved out of ${from.name} won’t be protected from AI changes.`}
          </T>
        ) : null}
      </View>
    </SheetScroll>
  );
}
