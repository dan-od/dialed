import { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { startsLabel } from '../../../../plan/impact';
import { usePlanToday, useTermName } from '../../../../plan/useTermName';
import { ListRow } from '../../../../plan/ui';
import { useTheme } from '../../../../theme/theme';
import { H1, Header, Page, Sub } from '../../../../ui/Chrome';
import { Button } from '../../../../ui/Button';
import { CheckIcon } from '../../../../ui/icons';
import { haptic } from '../../../../lib/haptics';
import { T } from '../../../../ui/Text';
import { Spinner } from '../../../../ui/Spinner';

/** Prototype `scrDone`. */
export default function Done() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi, data } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const reduce = useReducedMotion();
  const { plan } = usePlan(planApi, id);
  const term = useTermName();
  const today = usePlanToday();

  useEffect(() => {
    haptic.success();
  }, []);

  const applied = useMemo(
    () => (plan ? plan.changes.filter((ch) => ch.enabled).map((ch) => ch.title) : []),
    [plan],
  );
  const schedule = data?.schedule;
  const starts = useMemo(
    () => (plan && schedule ? startsLabel(plan, schedule, today) : 'this week'),
    [plan, schedule, today],
  );

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
      <Header left={<View />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <Animated.View
          entering={reduce ? undefined : ZoomIn.springify().damping(12)}
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: c.acc,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon color={c.ink} size={40} />
        </Animated.View>
        <View style={{ marginTop: 18 }}>
          <H1 size={56}>{`${term ?? 'Your schedule'} updated`}</H1>
        </View>
        <Sub>{`Changes start ${starts}. Past days stay as they were.`}</Sub>
        <View style={{ marginTop: 12 }}>
          {applied.map((t, i) => (
            <ListRow key={`${t}-${i}`}>
              <CheckIcon color={c.ok} />
              <T size={15} weight="600" style={{ flex: 1 }}>
                {t}
              </T>
            </ListRow>
          ))}
        </View>
        <View style={{ gap: 8, marginTop: 22 }}>
          <Button
            kind="primary"
            label="See this week"
            onPress={() => router.replace('/(app)/(tabs)/week')}
          />
          <Button
            kind="secondary"
            label="Back to Routines"
            onPress={() => router.replace('/routines')}
          />
        </View>
      </ScrollView>
    </Page>
  );
}
