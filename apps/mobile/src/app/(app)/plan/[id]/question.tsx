import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { latestQuestion } from '../../../../plan/model';
import { useTheme } from '../../../../theme/theme';
import { BackLink, Header, Page } from '../../../../ui/Chrome';
import { haptic } from '../../../../lib/haptics';
import { T } from '../../../../ui/Text';
import { Spinner } from '../../../../ui/Spinner';
import { useToast } from '../../../../ui/Toast';
import { useState } from 'react';

export default function Question() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { plan } = usePlan(planApi, id);
  const [busy, setBusy] = useState(false);

  const question = plan ? latestQuestion(plan.messages) : undefined;

  const answer = async (option: string) => {
    setBusy(true);
    haptic.selection();
    try {
      await planApi.answer(id, { option });
      router.replace({ pathname: '/plan/[id]/drafting', params: { id } });
    } catch {
      toast('Couldn’t send the answer. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const somethingElse = () => {
    router.replace('/plan');
  };

  if (!plan || !question) {
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
      <Header left={<BackLink label="Plan it" onPress={() => router.replace('/plan')} />} />
      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 16 }}>
        <T size={28} weight="700">
          One quick question
        </T>
        <View style={{ padding: 16, borderRadius: 16, backgroundColor: c.surf, gap: 8 }}>
          <T size={15} weight="600">
            {question.body}
          </T>
        </View>
        <View style={{ gap: 10 }}>
          {(question.options ?? []).map((opt) => (
            <Pressable
              key={opt}
              accessibilityRole="button"
              accessibilityLabel={opt}
              disabled={busy}
              onPress={() => void answer(opt)}
              style={({ pressed }) => ({
                height: 50,
                borderRadius: 16,
                backgroundColor: c.surf,
                borderWidth: 1.5,
                borderColor: c.line,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <T size={15} weight="600">
                {opt}
              </T>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Something else, I'll explain"
            disabled={busy}
            onPress={somethingElse}
            style={({ pressed }) => ({
              height: 50,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <T size={15} weight="600" color={c.acc2}>
              Something else, I’ll explain
            </T>
          </Pressable>
        </View>
      </View>
    </Page>
  );
}
