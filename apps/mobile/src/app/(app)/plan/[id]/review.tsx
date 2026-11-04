import { ScrollView, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { toChangeCards, enabledCount } from '../../../../plan/model';
import { approveLabel, reviewTitle, staleSentence, planSourceLabel } from '../../../../plan/copy';
import { useTheme } from '../../../../theme/theme';
import { BackLink, Header, Page } from '../../../../ui/Chrome';
import { Button } from '../../../../ui/Button';
import { PinnedFooter } from '../../../../ui/PinnedFooter';
import { Stamp } from '../../../../ui/Stamp';
import { Spinner } from '../../../../ui/Spinner';
import { haptic } from '../../../../lib/haptics';
import { T } from '../../../../ui/Text';
import { useToast } from '../../../../ui/Toast';
import { useState, useCallback, useMemo, useEffect } from 'react';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { termFor } from '@dialed/schedule';

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi, data, syncNow } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const { plan, refresh, setPlan } = usePlan(planApi, id);
  const [busy, setBusy] = useState(false);

  const cards = useMemo(() => plan ? toChangeCards(plan) : [], [plan]);
  const enabled = enabledCount(cards);
  const stale = plan?.status === 'stale';

  const term = data?.schedule
    ? termFor(new Date().toISOString().slice(0, 10), data.schedule.terms ?? [])
    : null;
  const termName = term?.name ?? 'your schedule';

  const toggleChange = useCallback(async (changeId: string, value: boolean) => {
    haptic.selection();
    try {
      const updated = await planApi.toggle(id, changeId, { enabled: value });
      setPlan(updated);
    } catch {
      toast('Couldn’t update that change. Try again.');
    }
  }, [id, planApi, setPlan, toast]);

  const approve = useCallback(async () => {
    if (!plan || busy) return;
    setBusy(true);
    haptic.selection();
    try {
      const result = await planApi.approve(id, { plan_version: plan.version });
      haptic.success();
      syncNow();
      setPlan(result);
      router.replace({ pathname: '/plan/[id]/done', params: { id } });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'plan_stale') {
        haptic.warning();
        void refresh();
      } else if (err.code === 'plan_changed') {
        toast('This plan was just updated. Check it again.');
        void refresh();
      } else {
        toast('Couldn’t approve. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [plan, id, planApi, busy, setPlan, syncNow, router, refresh, toast]);

  const discard = useCallback(async () => {
    haptic.warning();
    try {
      await planApi.discard(id);
      toast('Plan discarded. Your routine is unchanged.');
      router.replace('/routines');
    } catch {
      toast('Couldn’t discard. Try again.');
    }
  }, [id, planApi, router, toast]);

  if (!plan) {
    return (
      <Page>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner color={c.muted} size={24} />
        </View>
      </Page>
    );
  }

  const source = planSourceLabel(plan);

  return (
    <Page>
      <Header
        left={<BackLink label="Plan it" onPress={() => router.replace('/plan')} />}
        right={
          <Button kind="destructive" label="Discard" onPress={() => void discard()} style={{ width: 80, height: 36 }} />
        }
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 }}>
        <T size={28} weight="700">{reviewTitle(cards.length, termName)}</T>
        {source ? <T size={14} weight="500" color={c.muted} style={{ marginTop: 4 }}>{source}</T> : null}
        <View style={{ marginTop: 4, padding: 12, borderRadius: 12, backgroundColor: c.surf2 }}>
          <T size={13} weight="500" color={c.muted} numberOfLines={2}>{plan.request_text}</T>
        </View>

        {stale ? (
          <View style={{ marginTop: 12 }}>
            <Stamp text={staleSentence()} kind="warning" />
          </View>
        ) : null}

        <View style={{ marginTop: 16, gap: 10 }}>
          {cards.map((card, i) => (
            <Animated.View
              key={card.id}
              entering={reduce ? undefined : FadeInDown.delay(i * 80).duration(250)}
              style={{ padding: 14, borderRadius: 16, backgroundColor: c.surf, gap: 6 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1 }}>
                  <View style={{
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
                    backgroundColor: c.surf2,
                  }}>
                    <T size={11} weight="700" color={c.muted}>{card.tag}</T>
                  </View>
                  <T size={15} weight="700" numberOfLines={1} style={{ flex: 1 }}>{card.title}</T>
                </View>
                <Switch
                  accessibilityLabel={`Include: ${card.title}`}
                  value={card.enabled}
                  onValueChange={(v) => void toggleChange(card.id, v)}
                  trackColor={{ false: c.surf2, true: c.acc }}
                  disabled={stale}
                />
              </View>
              {card.fromTo ? <T size={13} weight="500" color={c.muted}>{card.fromTo}</T> : null}
              <T size={13} weight="500" color={c.soft}>{card.note}</T>
            </Animated.View>
          ))}
        </View>

        {plan.impact.length > 0 ? (
          <View style={{ marginTop: 20 }}>
            <T size={13} weight="700" color={c.muted} style={{ textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              What this does to your week
            </T>
            {plan.impact.map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <T size={14} weight="600">{row.label}</T>
                <T size={14} weight="500" color={c.muted}>
                  {row.before} → {row.after}
                </T>
              </View>
            ))}
          </View>
        ) : null}

        {plan.checks.length > 0 ? (
          <View style={{ marginTop: 16, gap: 4 }}>
            {plan.checks.map((ck) => (
              <T key={ck.id} size={13} weight="500" color={ck.passed ? c.muted : c.err}>
                {ck.passed ? '✓' : '✗'} {ck.detail}
              </T>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <PinnedFooter>
        <Button
          kind="primary"
          label={approveLabel(enabled)}
          disabled={enabled === 0 || stale || busy}
          busy={busy}
          onPress={() => void approve()}
        />
      </PinnedFooter>
    </Page>
  );
}
