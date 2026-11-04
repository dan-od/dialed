import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { draftingSub } from '../../../../plan/copy';
import { useTheme } from '../../../../theme/theme';
import { Page } from '../../../../ui/Chrome';
import { DialLoader } from '../../../../ui/DialLoader';
import { StepList } from '../../../../ui/StepList';
import { T } from '../../../../ui/Text';
import { Button } from '../../../../ui/Button';
import { useEffect } from 'react';
import { useToast } from '../../../../ui/Toast';

const STEPS = [
  'Reading your schedule',
  'Matching your categories',
  'Fitting it into your week',
  'Checking your limits',
];

export default function Drafting() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { plan } = usePlan(planApi, id);

  useEffect(() => {
    if (!plan) return;
    if (plan.status === 'ready' || plan.status === 'stale') {
      router.replace({ pathname: '/plan/[id]/review', params: { id } });
    } else if (plan.status === 'question') {
      router.replace({ pathname: '/plan/[id]/question', params: { id } });
    } else if (plan.status === 'failed') {
      router.replace({ pathname: '/plan/[id]/error', params: { id } });
    } else if (plan.status === 'approved') {
      router.replace({ pathname: '/plan/[id]/done', params: { id } });
    }
  }, [plan?.status, id, router]);

  const cancel = async () => {
    try {
      await planApi.cancel(id);
      toast('Stopped. Your text is still here.');
      router.back();
    } catch {
      toast('Couldn’t cancel.');
    }
  };

  return (
    <Page>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 24 }}>
        <DialLoader color={c.acc} />
        <T size={20} weight="700" style={{ textAlign: 'center' }}>Drafting your plan</T>
        <StepList steps={STEPS} active={plan ? Math.min(STEPS.length - 1, plan.version) : 0} />
        <T size={14} weight="500" color={c.muted} style={{ textAlign: 'center', maxWidth: 280 }}>
          {draftingSub()}
        </T>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Button kind="secondary" label="Cancel" onPress={() => void cancel()} />
      </View>
    </Page>
  );
}
