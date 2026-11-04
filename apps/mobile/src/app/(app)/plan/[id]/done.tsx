import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { useTheme } from '../../../../theme/theme';
import { Page } from '../../../../ui/Chrome';
import { Button } from '../../../../ui/Button';
import { PinnedFooter } from '../../../../ui/PinnedFooter';
import { haptic } from '../../../../lib/haptics';
import { T } from '../../../../ui/Text';
import { Spinner } from '../../../../ui/Spinner';
import { useEffect, useMemo } from 'react';
import { termFor } from '@dialed/schedule';
import Animated, { BounceIn } from 'react-native-reanimated';

export default function Done() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi, data } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const { plan } = usePlan(planApi, id);

  const term = data?.schedule
    ? termFor(new Date().toISOString().slice(0, 10), data.schedule.terms ?? [])
    : null;
  const termName = term?.name ?? 'Your schedule';

  useEffect(() => {
    haptic.success();
  }, []);

  const applied = useMemo(() => {
    if (!plan) return [];
    return plan.changes.filter((ch) => ch.enabled).map((ch) => ch.title);
  }, [plan]);

  if (!plan) {
    return (
      <Page>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner color={c.muted} size={24} />
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <View
        accessible
        accessibilityRole="header"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 16 }}
      >
        <Animated.View entering={BounceIn.duration(400)}>
          <T size={48}>{'✓'}</T>
        </Animated.View>
        <T size={28} weight="700" style={{ textAlign: 'center' }}>{termName} updated</T>
        <T size={15} weight="500" color={c.muted} style={{ textAlign: 'center', maxWidth: 280 }}>
          Changes start this week. Past days stay as they were.
        </T>
        <View style={{ gap: 4, marginTop: 8 }}>
          {applied.map((t) => (
            <T key={t} size={14} weight="500" color={c.text}>{'•'} {t}</T>
          ))}
        </View>
      </View>
      <PinnedFooter>
        <Button kind="primary" label="See this week" onPress={() => router.replace('/(app)/(tabs)/week')} />
        <Button kind="secondary" label="Back to Routines" onPress={() => router.replace('/routines')} />
      </PinnedFooter>
    </Page>
  );
}
