import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { attemptLine, failureCopy } from '../../../../plan/copy';
import { useTheme } from '../../../../theme/theme';
import { BackLink, H1, Header, Page, Sub } from '../../../../ui/Chrome';
import { Button } from '../../../../ui/Button';
import { haptic } from '../../../../lib/haptics';
import { T } from '../../../../ui/Text';
import { useToast } from '../../../../ui/Toast';

/** Prototype `scrError`; the title and sentence follow the real cause (`failureCopy`). */
export default function PlanError() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { plan } = usePlan(planApi, id);
  const [busy, setBusy] = useState(false);

  const copy = failureCopy(
    plan ?? { error_code: 'provider_error', validation_errors: [], attempts: 0 },
  );

  useEffect(() => {
    if (plan && plan.status !== 'failed') {
      if (plan.status === 'ready' || plan.status === 'stale')
        router.replace({ pathname: '/plan/[id]/review', params: { id } });
      else if (plan.status === 'drafting')
        router.replace({ pathname: '/plan/[id]/drafting', params: { id } });
    }
  }, [plan?.status, id, router]);

  useEffect(() => {
    haptic.warning();
  }, []);

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await planApi.redo(id);
      router.replace({ pathname: '/plan/[id]/drafting', params: { id } });
    } catch {
      toast('Couldn’t retry. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const toComposer = () => router.replace('/plan');

  return (
    <Page>
      <Header left={<BackLink label="Plan it" onPress={toComposer} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <H1 size={52}>{copy.title}</H1>
        <Sub>{copy.reason ? `${copy.body} ${copy.reason}` : copy.body}</Sub>
        {plan?.request_text ? (
          <View style={{ marginTop: 18 }}>
            <T size={12} weight="700" color={c.muted} style={{ marginBottom: 4 }}>
              Your request, saved
            </T>
            <T size={17} weight="600" color={c.soft} style={{ lineHeight: 24 }}>
              “{plan.request_text}”
            </T>
          </View>
        ) : null}
        <View style={{ gap: 8, marginTop: 18 }}>
          {copy.canRetry ? (
            <Button
              testID="retry"
              kind="primary"
              label="Try again"
              busy={busy}
              onPress={() => void retry()}
            />
          ) : (
            <Button testID="err-ok" kind="primary" label="Got it" onPress={toComposer} />
          )}
          {copy.settings ? (
            <Button
              kind="secondary"
              label="Open Settings"
              onPress={() => router.push('/ai-assistant')}
            />
          ) : null}
          <Button testID="err-edit" kind="secondary" label="Edit my request" onPress={toComposer} />
        </View>
        <T size={13} color={c.muted} style={{ marginTop: 14 }}>
          {attemptLine(plan?.attempts ?? 0)}
        </T>
      </ScrollView>
    </Page>
  );
}
