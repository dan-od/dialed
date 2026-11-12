import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { failureCopy, MAX_REDOS, tryAgainLabel } from '../../../../plan/copy';
import { useTheme } from '../../../../theme/theme';
import { Page } from '../../../../ui/Chrome';
import { Button } from '../../../../ui/Button';
import { haptic } from '../../../../lib/haptics';
import { T } from '../../../../ui/Text';
import { useToast } from '../../../../ui/Toast';
import { useState, useEffect } from 'react';

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

  const edit = () => {
    router.replace('/plan');
  };

  const openSettings = () => {
    router.push('/ai-assistant');
  };

  return (
    <Page>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
          gap: 16,
        }}
      >
        <T size={28} weight="700" style={{ textAlign: 'center' }}>
          {copy.title}
        </T>
        <T size={15} weight="500" color={c.muted} style={{ textAlign: 'center', maxWidth: 300 }}>
          {copy.body}
        </T>
        {copy.reason ? (
          <T size={15} weight="600" style={{ textAlign: 'center', maxWidth: 300 }}>
            {copy.reason}
          </T>
        ) : null}
        {plan?.request_text ? (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: c.surf2, maxWidth: 300 }}>
            <T size={13} weight="500" color={c.muted} numberOfLines={3}>
              Your request, saved
            </T>
            <T size={14} weight="500" numberOfLines={3} style={{ marginTop: 4 }}>
              {plan.request_text}
            </T>
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 40, gap: 10 }}>
        {copy.canRetry ? (
          <Button
            kind="primary"
            label={tryAgainLabel((plan?.attempts ?? 0) + 2, MAX_REDOS + 1)}
            busy={busy}
            onPress={() => void retry()}
          />
        ) : (
          <Button kind="primary" label="Got it" onPress={() => router.replace('/plan')} />
        )}
        {copy.settings ? <Button kind="link" label="Open Settings" onPress={openSettings} /> : null}
        <Button kind="secondary" label="Edit my request" onPress={edit} />
      </View>
    </Page>
  );
}
