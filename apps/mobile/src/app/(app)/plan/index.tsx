import { useCallback, useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { PlanSummary, ProviderId } from '@dialed/contracts';
import { aiMode, aiName, aiProvider } from '../../../config';
import { useApp } from '../../../AppProvider';
import { useDraft } from '../../../plan/drafts';
import { composerPlaceholder, composerSub, emptyError, planStatusLabel } from '../../../plan/copy';
import { useTermName } from '../../../plan/useTermName';
import { Chip, FieldLabel, ListRow, SendButton } from '../../../plan/ui';
import { useTheme } from '../../../theme/theme';
import { BackLink, H1, Header, Page, Sub } from '../../../ui/Chrome';
import { OfflineLine } from '../../../ui/Inline';
import { haptic } from '../../../lib/haptics';
import { D, T } from '../../../ui/Text';
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
  const { planApi, store, online } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { text, update, clear } = useDraft(store);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<PlanSummary[]>([]);

  const term = useTermName();
  const ai = aiName();

  useEffect(() => {
    void planApi
      .list(10)
      .then((r) => setRecent(r.plans))
      .catch(() => {});
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
      } catch {
        /* Keychain unavailable */
      }
    }

    try {
      const plan = await planApi.create(
        {
          request_text: trimmed,
          provider_mode: mode === 'own' ? 'byo' : 'server',
          provider:
            mode === 'own'
              ? ((provider === 'compatible' ? 'custom' : provider) as ProviderId)
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
      <Header left={<BackLink label="Back" onPress={() => router.back()} />} />
      <ToastAwareScroll
        base={40}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={56}>Plan it</H1>
          <Sub>{composerSub()}</Sub>
        </View>

        {!online ? (
          <OfflineLine
            pending={0}
            text={`${ai} needs your server, so sending waits until you reconnect. Your text stays here.`}
          />
        ) : null}

        <View
          style={{
            marginTop: 16,
            marginHorizontal: 20,
            borderRadius: 22,
            backgroundColor: c.surf,
            borderWidth: 1.5,
            borderColor: error ? c.err : c.acc,
            padding: 14,
          }}
        >
          <FieldLabel>{composerPlaceholder()}</FieldLabel>
          <TextInput
            testID="plan-text"
            accessibilityLabel={composerPlaceholder()}
            value={text}
            onChangeText={(v) => {
              update(v);
              setError('');
            }}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            style={{
              marginTop: 6,
              minHeight: 5 * 24,
              padding: 0,
              fontSize: 17,
              fontWeight: '500',
              lineHeight: 24,
              color: c.text,
            }}
          />
          {text.length >= CHAR_WARN ? (
            <T
              size={12}
              weight="600"
              color={text.length > 4000 ? c.err : c.muted}
              style={{ marginTop: 4, textAlign: 'right' }}
            >
              {text.length.toLocaleString()}
            </T>
          ) : null}
          {error ? (
            <T
              size={13}
              weight="600"
              color={c.err}
              style={{ marginTop: 6 }}
              accessibilityRole="alert"
            >
              {error}
            </T>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 8,
              gap: 8,
            }}
          >
            <T size={12} weight="600" color={c.muted} style={{ flex: 1 }} numberOfLines={1}>
              {term ? `Plans against your ${term}` : 'Plans against your schedule'}
            </T>
            <SendButton
              testID="plan-send"
              label={`Send to ${ai}`}
              busy={sending}
              disabled={!online}
              onPress={() => void send()}
            />
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginHorizontal: 20,
            marginTop: 12,
          }}
        >
          {STARTERS.map((s, i) => (
            <Chip
              key={s.label}
              testID={`starter-${i}`}
              label={s.label}
              onPress={() => tapStarter(s.prefix)}
            />
          ))}
        </View>

        {recent.length > 0 ? (
          <View style={{ marginTop: 22, paddingHorizontal: 20 }}>
            <T size={16} weight="700" accessibilityRole="header">
              Recent plans
            </T>
            {recent.map((p) => {
              const status =
                p.source === 'mcp' && p.client_name
                  ? `From ${p.client_name}`
                  : planStatusLabel(p as never);
              return (
                <ListRow key={p.id} onPress={() => tapRecent(p)}>
                  <D size={16} color={c.muted} style={{ width: 52 }}>
                    {shortDate(p.created_at)}
                  </D>
                  <T size={14} weight="500" style={{ flex: 1 }} numberOfLines={2}>
                    {p.request_text}
                  </T>
                  {status ? (
                    <T size={12} weight="700" color={p.status === 'approved' ? c.ok : c.muted}>
                      {status}
                    </T>
                  ) : null}
                </ListRow>
              );
            })}
          </View>
        ) : null}
      </ToastAwareScroll>
    </Page>
  );
}

/** "Nov 12" from an ISO timestamp; never "Invalid Date". */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
