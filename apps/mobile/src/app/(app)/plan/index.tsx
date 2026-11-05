import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as Network from 'expo-network';
import type { PlanSummary, ProviderId } from '@dialed/contracts';
import { termFor } from '@dialed/schedule';
import { aiMode, aiName, aiProvider } from '../../../config';
import { useApp } from '../../../AppProvider';
import { useDraft } from '../../../plan/drafts';
import { composerPlaceholder, composerSub, emptyError, planStatusLabel, planSourceLabel } from '../../../plan/copy';
import { useTheme } from '../../../theme/theme';
import { BackLink, Header, Page } from '../../../ui/Chrome';
import { Button } from '../../../ui/Button';
import { PinnedFooter } from '../../../ui/PinnedFooter';
import { Stamp } from '../../../ui/Stamp';
import { haptic } from '../../../lib/haptics';
import { T } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';
import { ToastAwareScroll } from '../../../ui/ToastAwareScroll';

const STARTERS = [
  { label: 'Move a block', prefix: 'Move ' },
  { label: 'Add to every week', prefix: 'Add ' },
  { label: 'Plan exam week', prefix: 'Plan exam week: ' },
  { label: 'Free up a day', prefix: 'Free up ' },
];

const CHAR_WARN = 3500;

export default function PlanComposer() {
  const { planApi, data, store, online } = useApp();
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { text, update, clear } = useDraft(store);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<PlanSummary[]>([]);

  const term = data?.schedule
    ? termFor(new Date().toISOString().slice(0, 10), data.schedule.terms ?? [])
    : null;
  const termName = term?.name ?? 'your schedule';
  const ai = aiName();

  useEffect(() => {
    void planApi.list(10).then((r) => setRecent(r.plans)).catch(() => {});
  }, [planApi]);

  const send = useCallback(async () => {
    if (sending) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setError(emptyError());
      haptic.warning();
      return;
    }
    setError('');
    setSending(true);

    const mode = aiMode();
    const provider = aiProvider();
    let byoKey: string | undefined;
    let byoUrl: string | undefined;
    if (mode === 'own') {
      try {
        byoKey = (await SecureStore.getItemAsync(`ai.key.${provider}`)) ?? undefined;
        if (provider === 'compatible') {
          byoUrl = (await SecureStore.getItemAsync('ai.key.compatible.url')) ?? undefined;
        }
      } catch { /* Keychain unavailable */ }
    }

    try {
      const plan = await planApi.create(
        {
          request_text: trimmed,
          provider_mode: mode === 'own' ? 'byo' : 'server',
          provider: mode === 'own'
            ? (provider === 'compatible' ? 'custom' : provider) as ProviderId
            : undefined,
          idempotency_key: randomUUID(),
        },
        byoKey ? { provider_key: byoKey, provider_base_url: byoUrl } : undefined,
      );
      clear();
      router.push({ pathname: '/plan/[id]/drafting', params: { id: plan.id } });
    } catch {
      toast('Couldn’t start the plan. Try again.');
    } finally {
      setSending(false);
    }
  }, [text, sending, planApi, router, toast, clear]);

  const tapStarter = (prefix: string) => {
    update(prefix);
    setError('');
  };

  const tapRecent = (p: PlanSummary) => {
    if (p.status === 'ready' || p.status === 'stale') {
      router.push({ pathname: '/plan/[id]/review', params: { id: p.id } });
    } else {
      router.push({ pathname: '/plan/[id]', params: { id: p.id } });
    }
  };

  return (
    <Page>
      <Header left={<BackLink label="Day" onPress={() => router.back()} />} />
      <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8, paddingBottom: 160 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <T accessibilityRole="header" size={28} weight="700">Plan it</T>
          <T size={14} weight="500" color={c.muted} style={{ marginTop: 6, lineHeight: 20 }}>
            {composerSub()}
          </T>
        </View>

        {!online ? (
          <View style={{ marginHorizontal: 20, marginTop: 12 }}>
            <Stamp
              text={`You’re offline. ${ai} needs the server, so sending waits. Your text is kept.`}
              kind="info"
            />
          </View>
        ) : null}

        <View style={{ marginHorizontal: 20, marginTop: 16 }}>
          <TextInput
            accessibilityLabel={composerPlaceholder()}
            placeholder={composerPlaceholder()}
            placeholderTextColor={c.muted}
            value={text}
            onChangeText={(v) => { update(v); setError(''); }}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            style={{
              minHeight: 120,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: error ? c.err : c.line,
              backgroundColor: c.surf,
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 14,
              fontSize: 16,
              color: c.text,
              lineHeight: 22,
            }}
          />
          {text.length >= CHAR_WARN ? (
            <T size={12} weight="600" color={text.length > 4000 ? c.err : c.muted} style={{ marginTop: 4, textAlign: 'right' }}>
              {text.length.toLocaleString()}
            </T>
          ) : null}
          {error ? (
            <T size={13} weight="600" color={c.err} style={{ marginTop: 6 }}>{error}</T>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 20, marginTop: 12, flexWrap: 'wrap' }}>
          {STARTERS.map((s) => (
            <Pressable
              key={s.label}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              onPress={() => tapStarter(s.prefix)}
              style={({ pressed }) => ({
                height: 34,
                paddingHorizontal: 14,
                borderRadius: 17,
                backgroundColor: c.surf2,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <T size={13} weight="600" color={c.text}>{s.label}</T>
            </Pressable>
          ))}
        </View>

        <T size={12} weight="600" color={c.muted} style={{ marginHorizontal: 20, marginTop: 16 }}>
          Plans against {termName}
        </T>

        {recent.length > 0 ? (
          <View style={{ marginTop: 12, gap: 1 }}>
            <T
              size={11}
              weight="700"
              color={c.muted}
              style={{ textTransform: 'uppercase', letterSpacing: 0.4, marginHorizontal: 20, marginBottom: 8 }}
            >
              Recent
            </T>
            {recent.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${p.request_text}, ${planStatusLabel(p as never)}`}
                onPress={() => tapRecent(p)}
                style={({ pressed }) => ({
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  backgroundColor: pressed ? c.surf : 'transparent',
                })}
              >
                <T size={14} weight="600" numberOfLines={1}>{p.request_text}</T>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                  <T size={12} weight="500" color={c.muted}>
                    {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </T>
                  {p.source === 'mcp' && p.client_name ? (
                    <T size={12} weight="500" color={c.acc2}>From {p.client_name} chat</T>
                  ) : (
                    <T size={12} weight="500" color={c.muted}>{planStatusLabel(p as never)}</T>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ToastAwareScroll>

      <PinnedFooter>
        <Button
          kind="primary"
          label="Send"
          busy={sending}
          disabled={!online}
          onPress={() => void send()}
        />
      </PinnedFooter>
    </Page>
  );
}
