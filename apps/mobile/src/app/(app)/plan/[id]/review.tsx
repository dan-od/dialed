import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../../AppProvider';
import { usePlan } from '../../../../plan/usePlan';
import { toChangeCards, enabledCount, type ChangeTag } from '../../../../plan/model';
import { changeTimes, weekImpact } from '../../../../plan/impact';
import { approveLabel, reviewTitle, staleLine, planSourceLabel } from '../../../../plan/copy';
import { usePlanToday, useTermName } from '../../../../plan/useTermName';
import { useAiName } from '../../../../plan/useAiName';
import { CheckLine, FieldLabel, Pill, SendButton } from '../../../../plan/ui';
import { calendarImportedToast } from '../../../../import/foundClasses';
import { useTheme } from '../../../../theme/theme';
import { BackLink, H1, Header, Page } from '../../../../ui/Chrome';
import { Button } from '../../../../ui/Button';
import { InlineMessage } from '../../../../ui/Inline';
import { ArrowIcon } from '../../../../ui/icons';
import { Spinner } from '../../../../ui/Spinner';
import { haptic } from '../../../../lib/haptics';
import { D, T } from '../../../../ui/Text';
import { useToast } from '../../../../ui/Toast';

/** Prototype `scrReview`. */
export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planApi, data, syncNow } = useApp();
  const { c } = useTheme();
  const ai = useAiName();
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { plan, refresh, setPlan } = usePlan(planApi, id);
  const term = useTermName();
  const today = usePlanToday();
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);

  const cards = useMemo(() => (plan ? toChangeCards(plan) : []), [plan]);
  const enabled = enabledCount(cards);
  const stale = plan?.status === 'stale';
  const schedule = data?.schedule;
  const impact = useMemo(
    () => (plan && schedule ? weekImpact(plan, schedule, today) : []),
    [plan, schedule, today],
  );
  const times = useMemo(() => {
    const out = new Map<string, { from: string | null; to: string }>();
    if (!plan || !schedule) return out;
    for (const row of plan.changes) out.set(row.id, changeTimes(row, schedule, today));
    return out;
  }, [plan, schedule]);

  const tagColor = (tag: ChangeTag) =>
    tag === 'New' || tag === 'New category'
      ? c.ok
      : tag === 'Removed' || tag === 'Skip'
        ? c.err
        : c.warn;

  const toggleChange = useCallback(
    async (changeId: string, value: boolean) => {
      haptic.selection();
      try {
        setPlan(await planApi.toggle(id, changeId, { enabled: value }));
      } catch {
        toast('Couldn’t update that change. Try again.');
      }
    },
    [id, planApi, setPlan, toast],
  );

  const approve = useCallback(async () => {
    if (!plan || busy) return;
    setBusy(true);
    haptic.selection();
    try {
      await planApi.approve(id, { plan_version: plan.version });
      haptic.success();
      syncNow();
      if (plan.source === 'calendar') {
        // Flow 02: calendar imports land on Day with a toast instead of the Done page.
        router.dismissAll();
        const termCh = plan.changes.find(
          (ch) => ch.kind === 'create_term' || ch.kind === 'update_term',
        );
        toast(calendarImportedToast(termCh?.title ?? term ?? 'your schedule'));
        return;
      }
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
  }, [plan, id, planApi, busy, setPlan, syncNow, router, refresh, toast, term]);

  const redo = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await planApi.redo(id);
      router.replace({ pathname: '/plan/[id]/drafting', params: { id } });
    } catch {
      toast('Couldn’t redo the plan. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, id, planApi, router, toast]);

  const sendReply = useCallback(async () => {
    const text = reply.trim();
    if (!text || replying) return;
    setReplying(true);
    try {
      await planApi.reply(id, text);
      setReply('');
      router.replace({ pathname: '/plan/[id]/drafting', params: { id } });
    } catch {
      toast(`Couldn’t send that to ${ai}. Try again.`);
    } finally {
      setReplying(false);
    }
  }, [reply, replying, planApi, id, router, toast, ai]);

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
        right={<Pill testID="plan-discard" label="Discard" quiet onPress={() => void discard()} />}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={42}>{reviewTitle(cards.length, term ?? 'your schedule')}</H1>
          <T size={13} weight="500" color={c.muted} style={{ marginTop: 8, lineHeight: 18 }}>
            {source ? `${source} · ` : ''}“{plan.request_text}”
          </T>
        </View>

        {stale ? <InlineMessage parts={[{ hot: 'Out of date.' }, ` ${staleLine(ai)}`]} /> : null}

        <View style={{ marginTop: 14, marginHorizontal: 16, gap: 8 }}>
          {cards.map((card, i) => {
            const t = times.get(card.id);
            return (
              <Animated.View
                key={card.id}
                entering={reduce ? undefined : FadeInDown.delay(i * 80).duration(450)}
                style={{
                  borderRadius: 18,
                  backgroundColor: c.surf,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  gap: 12,
                  opacity: card.enabled ? 1 : 0.5,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        height: 22,
                        paddingHorizontal: 8,
                        borderRadius: 11,
                        backgroundColor: tagColor(card.tag),
                        justifyContent: 'center',
                      }}
                    >
                      <T size={11} weight="800" color={c.ink} style={{ lineHeight: 14 }}>
                        {card.tag}
                      </T>
                    </View>
                    <T size={16} weight="700" style={{ flex: 1, lineHeight: 20 }}>
                      {card.title}
                    </T>
                  </View>
                  {t && (t.from || t.to) ? (
                    <View
                      style={{
                        marginTop: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      {t.from ? (
                        <>
                          <D
                            size={15}
                            color={c.muted}
                            style={{ textDecorationLine: 'line-through' }}
                            accessibilityLabel={`was ${t.from}`}
                          >
                            {t.from}
                          </D>
                          <ArrowIcon color={c.muted} />
                        </>
                      ) : null}
                      {t.to ? <D size={15}>{t.to}</D> : null}
                    </View>
                  ) : null}
                  {card.note ? (
                    <T
                      size={13}
                      weight="500"
                      color={c.muted}
                      style={{ marginTop: 4, lineHeight: 18 }}
                    >
                      {card.note}
                    </T>
                  ) : null}
                </View>
                <Switch
                  accessibilityLabel={`Include: ${card.title}`}
                  value={card.enabled}
                  onValueChange={(v) => void toggleChange(card.id, v)}
                  trackColor={{ false: c.line, true: c.acc }}
                  disabled={stale}
                  style={{ alignSelf: 'center' }}
                />
              </Animated.View>
            );
          })}
        </View>

        <View
          style={{
            marginTop: 12,
            marginHorizontal: 16,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: c.surf2,
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <T size={14} weight="700">
            What this does to your week
          </T>
          {impact.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginVertical: 8 }}>
              {impact.map((row) => (
                <View key={row.label} style={{ width: '33.33%', paddingRight: 8 }}>
                  <T size={12} weight="600" color={c.muted}>
                    {row.label}
                  </T>
                  <D size={17}>
                    <D size={17} color={c.muted}>
                      {row.before}
                    </D>
                    {` to ${row.after}`}
                  </D>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ height: 8 }} />
          )}
          <View style={{ gap: 4 }}>
            {(plan.checks ?? []).map((ck, i) => (
              <CheckLine key={`${ck.id}-${i}`} ok={ck.passed} text={ck.detail} />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 12, paddingHorizontal: 20 }}>
          <FieldLabel>Ask for changes</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <TextInput
              testID="plan-reply"
              accessibilityLabel="Ask for changes"
              placeholder="Make it 7:30 instead"
              placeholderTextColor={c.muted}
              value={reply}
              onChangeText={setReply}
              onSubmitEditing={() => void sendReply()}
              returnKeyType="send"
              editable={!stale}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: c.line,
                backgroundColor: c.surf,
                paddingHorizontal: 16,
                fontSize: 17,
                fontWeight: '600',
                color: c.text,
              }}
            />
            <View style={{ justifyContent: 'center' }}>
              <SendButton
                testID="reply-send"
                label={`Send reply to ${ai}`}
                busy={replying}
                disabled={stale || !reply.trim()}
                onPress={() => void sendReply()}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Math.max(24, insets.bottom),
          borderRadius: 18,
          backgroundColor: c.bg, // solid so iOS can draw the shadow; a disabled button still dims
          shadowColor: c.acc,
          shadowOpacity: 0.3,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        {stale ? (
          <Button
            testID="redo"
            kind="primary"
            label="Redo plan with the new week"
            busy={busy}
            onPress={() => void redo()}
          />
        ) : (
          <Button
            testID="approve"
            kind="primary"
            label={approveLabel(enabled)}
            disabled={enabled === 0 || busy}
            busy={busy}
            onPress={() => void approve()}
          />
        )}
      </View>
    </Page>
  );
}
