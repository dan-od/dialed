import type { IsoDate } from '@dialed/schedule';
import { instantAt } from '@dialed/schedule';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../../AppProvider';
import { nativeActivities } from '../../glance/activity';
import { devGlancePinned, devGlanceSnapshot, setDevGlancePinned } from '../../glance/devGlance';
import { nativeGlance } from '../../glance/writer';
import { T } from '../../ui/Text';

/**
 * Dev-only (Flow 08 step 10 proof; absent from release behaviour): `dialed://dev-glance?minute=795[&la=1]`
 * writes the seed Monday at that minute for the widgets and optionally starts its Live Activity locally;
 * `?clear=1` hands the snapshot and activities back to the app.
 */
export default function DevGlance() {
  const { minute, la, clear } = useLocalSearchParams<{
    minute?: string;
    la?: string;
    clear?: string;
  }>();
  const { data, prefs } = useApp();
  const [msg, setMsg] = useState('Working…');
  useEffect(() => {
    if (!__DEV__ || !data) return;
    const glance = nativeGlance();
    const acts = nativeActivities();
    void (async () => {
      if (clear) {
        setDevGlancePinned(false);
        await acts?.endAllActivities();
        setMsg('Glance: back to the app');
        return;
      }
      const target = Number(minute ?? 795);
      const real = new Date();
      const { snapshot, zone, shift, localDate } = devGlanceSnapshot(
        data.schedule,
        prefs,
        '2037-10-19',
        target,
        real,
      );
      setDevGlancePinned(true);
      await glance?.writeSnapshot(JSON.stringify(snapshot));
      await glance?.reloadTimelines();
      let laMsg = '';
      if (la && acts) {
        await acts.endAllActivities();
        const day = snapshot.days[0].blocks;
        const at = target + shift;
        const cur = day.find((b) => !b.quiet && b.start_min <= at && at < b.end_min);
        if (cur) {
          const t = (m: number) => instantAt(localDate as IsoDate, m, zone).toISOString();
          await acts.startActivity(
            {
              blockKey: cur.key,
              title: cur.title,
              categoryColorHex: snapshot.categories[cur.category_id]?.color_dark ?? '#FF5A1F',
              startsAt: t(cur.start_min),
            },
            {
              endsAt: t(cur.end_min),
              next: day
                .filter((b) => b.start_min >= cur.end_min)
                .slice(0, 2)
                .map((b) => ({
                  title: b.title,
                  startsAt: t(b.start_min),
                  durationMin: b.end_min - b.start_min,
                })),
            },
            true,
          );
          laMsg = ` · activity: ${cur.title}`;
        }
      }
      setMsg(`Glance pinned: ${zone} shift ${shift}${laMsg}`);
    })().catch((e: Error) => setMsg(`Glance failed: ${e.message}`));
  }, [data, prefs, minute, la, clear]);
  if (!__DEV__) return <Redirect href="/day" />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <T testID="dev-glance" size={15} weight="700">
        {msg}
      </T>
      <T size={12}>{devGlancePinned() ? 'pinned' : ''}</T>
    </View>
  );
}
