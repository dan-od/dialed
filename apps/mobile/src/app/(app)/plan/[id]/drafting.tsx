import { useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { draftingSteps, draftingSub } from '../../../../plan/copy';
import { useTermName } from '../../../../plan/useTermName';
import { PlanSteps, Pill } from '../../../../plan/ui';
import { H1, Header, Page, Sub } from '../../../../ui/Chrome';
import { Dialer } from '../../../../ui/Dialer';
import { useToast } from '../../../../ui/Toast';

/** Prototype `scrPlanLoading`. */
export default function Drafting() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi } = useApp();
  const router = useRouter();
  const toast = useToast();
  const { plan } = usePlan(planApi, id);
  const term = useTermName();
  const steps = useMemo(() => draftingSteps(term), [term]);

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
      <Header
        left={<View />}
        right={<Pill testID="plan-cancel" label="Cancel" onPress={() => void cancel()} />}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <H1 size={52}>Drafting your plan</H1>
        <Sub>{draftingSub()}</Sub>
        <Dialer />
        <PlanSteps steps={steps} style={{ marginTop: 26 }} />
      </ScrollView>
    </Page>
  );
}
