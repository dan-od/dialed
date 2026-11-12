import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { latestQuestion } from '../../../../plan/model';
import { useAiName } from '../../../../plan/useAiName';
import { useTheme } from '../../../../theme/theme';
import { BackLink, H1, Header, Page } from '../../../../ui/Chrome';
import { AiMark } from '../../../../ui/icons';
import { haptic } from '../../../../lib/haptics';
import { T } from '../../../../ui/Text';
import { Spinner } from '../../../../ui/Spinner';
import { useToast } from '../../../../ui/Toast';

const SOMETHING_ELSE = 'Something else, I’ll explain';

/** Prototype `scrQuestion`. */
export default function Question() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi } = useApp();
  const { c } = useTheme();
  const ai = useAiName();
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const { plan } = usePlan(planApi, id);
  const [busy, setBusy] = useState(false);

  const question = plan ? latestQuestion(plan.messages) : undefined;
  const options = (question?.options ?? []).filter((o) => !/^something else/i.test(o));

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

  if (!plan || !question) {
    return (
      <Page>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner color={c.muted} size={24} />
        </View>
      </Page>
    );
  }

  const option = (label: string, i: number, onPress: () => void) => (
    <Pressable
      key={label}
      testID={`ans-${i}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: 16,
        backgroundColor: c.surf2,
        paddingHorizontal: 16,
        paddingVertical: 12,
        justifyContent: 'center',
        opacity: pressed ? 0.85 : busy ? 0.6 : 1,
      })}
    >
      <T size={15} weight="600">
        {label}
      </T>
    </Pressable>
  );

  return (
    <Page>
      <Header left={<BackLink label="Plan it" onPress={() => router.replace('/plan')} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <H1 size={48}>One quick question</H1>
        <Animated.View
          entering={reduce ? undefined : FadeInDown.duration(450)}
          style={{ marginTop: 16, borderRadius: 20, backgroundColor: c.surf, padding: 16 }}
        >
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <AiMark color={c.acc2} />
            <T size={13} weight="700" color={c.acc2}>
              {ai}
            </T>
          </View>
          <T size={17} weight="600" style={{ marginTop: 8, lineHeight: 24 }}>
            {question.body}
          </T>
        </Animated.View>
        <View style={{ gap: 8, marginTop: 14 }}>
          {options.map((o, i) => option(o, i, () => void answer(o)))}
          {option(SOMETHING_ELSE, options.length, () => router.replace('/plan'))}
        </View>
      </ScrollView>
    </Page>
  );
}
