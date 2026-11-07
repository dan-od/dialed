import { Redirect, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { View } from 'react-native';
import { Spinner } from '../../../../ui/Spinner';
import { useTheme } from '../../../../theme/theme';

export default function PlanRouter() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi } = useApp();
  const { c } = useTheme();
  const { plan, loading } = usePlan(planApi, id);

  if (loading || !plan) {
    return (
      <View
        style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}
      >
        <Spinner color={c.muted} size={24} />
      </View>
    );
  }

  // Flow 02: timetable plans are checked on Found classes (also when reopened from Recent plans).
  const timetable =
    plan.source === 'timetable' &&
    (plan.status === 'ready' ||
      plan.status === 'stale' ||
      (plan.status === 'failed' && plan.error_code === 'nothing_found'));
  if (timetable) {
    return <Redirect href={{ pathname: '/import/found', params: { id } }} />;
  }

  switch (plan.status) {
    case 'drafting':
      return <Redirect href={{ pathname: '/plan/[id]/drafting', params: { id } }} />;
    case 'question':
      return <Redirect href={{ pathname: '/plan/[id]/question', params: { id } }} />;
    case 'ready':
    case 'stale':
      return <Redirect href={{ pathname: '/plan/[id]/review', params: { id } }} />;
    case 'failed':
      return <Redirect href={{ pathname: '/plan/[id]/error', params: { id } }} />;
    case 'approved':
      return <Redirect href={{ pathname: '/plan/[id]/done', params: { id } }} />;
    default:
      return <Redirect href="/plan" />;
  }
}
