import { useState, useCallback, useEffect } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import type { Mutation, ProviderId } from '@dialed/contracts';
import { randomUUID } from 'expo-crypto';
import { aiMode, aiName, aiProvider, setAiConfig, API_BASE_URL, FEATURES } from '../../config';
import { notifyAiNameChanged } from '../../plan/useAiName';
import { useApp } from '../../AppProvider';
import { useTheme } from '../../theme/theme';
import { BackLink, Header, Page } from '../../ui/Chrome';
import { Button } from '../../ui/Button';
import { haptic } from '../../lib/haptics';
import { SetCap, SetGroup, SetRow } from '../../settings/ui';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { ToastAwareScroll } from '../../ui/ToastAwareScroll';

type Mode = 'server' | 'own';
type Provider = 'anthropic' | 'openai' | 'gemini' | 'compatible';

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  gemini: 'Gemini',
  compatible: 'Custom',
};

const KEY_PREFIX = 'ai.key.';

async function readKey(provider: Provider): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(`${KEY_PREFIX}${provider}`)) ?? '';
  } catch {
    return '';
  }
}

async function writeKey(provider: Provider, key: string): Promise<void> {
  if (key) {
    await SecureStore.setItemAsync(`${KEY_PREFIX}${provider}`, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(`${KEY_PREFIX}${provider}`).catch(() => {});
  }
}

interface Connector {
  client_id: string;
  client_name: string;
  redirect_host: string;
  connected_at: string;
}

export default function AiAssistant() {
  const { api, data, planApi } = useApp();
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();

  // Connector state
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loadingConnectors, setLoadingConnectors] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const mcpUrl = API_BASE_URL.replace(/^http:\/\/localhost:\d+/, 'https://api.okoro.me') + '/mcp';

  const refreshConnectors = useCallback(async () => {
    setLoadingConnectors(true);
    try {
      const r = await api.request<{ connectors: Connector[] }>('GET', '/v1/connector');
      setConnectors(r.connectors);
    } catch {
      // offline or not available
    } finally {
      setLoadingConnectors(false);
    }
  }, [api]);

  useEffect(() => {
    if (FEATURES.d35Screens) void refreshConnectors(); // eslint-disable-line react-hooks/set-state-in-effect -- fetch on mount
  }, [refreshConnectors]);

  const copyUrl = async () => {
    await Clipboard.setStringAsync(mcpUrl);
    toast('Copied the connector URL.');
    haptic.success();
  };

  const disconnect = async (clientId: string) => {
    try {
      await api.request('DELETE', `/v1/connector/${encodeURIComponent(clientId)}`);
      haptic.success();
      toast('Disconnected. No AI app can see your schedule now.');
      void refreshConnectors();
    } catch {
      toast("Couldn't disconnect. Check your connection.");
    }
  };

  const disconnectAll = async () => {
    try {
      await api.request('DELETE', '/v1/connector');
      haptic.success();
      toast('Disconnected. No AI app can see your schedule now.');
      setConnectors([]);
    } catch {
      toast("Couldn't disconnect. Check your connection.");
    }
  };

  const sendTestDraft = async () => {
    if (sendingTest) return;
    setSendingTest(true);
    try {
      await api.request('POST', '/v1/connector/test-draft');
      haptic.success();
      toast('Test draft sent. Check your notifications.');
    } catch {
      toast("Couldn't send a test. Check your connection.");
    } finally {
      setSendingTest(false);
    }
  };

  const profile = data?.profile;
  const [mode, setMode] = useState<Mode>(aiMode());
  const [provider, setProvider] = useState<Provider>(aiProvider() as Provider);
  const [key, setKey] = useState('');
  const [url, setUrl] = useState('');
  const [model, setModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);

  useEffect(() => {
    void readKey(provider).then(setKey);
  }, [provider]);

  const saveChoice = useCallback(
    async (m: Mode, p: Provider) => {
      setAiConfig(m, p, p === 'compatible' ? model : undefined);
      notifyAiNameChanged();
      if (!profile) return;
      const mut: Mutation = {
        client_mutation_id: randomUUID(),
        entity: 'profile',
        op: 'upsert',
        base_version: profile.version,
        fields: { ai_mode: m === 'own' ? 'own' : 'server', ai_provider: p },
      };
      try {
        await api.request('POST', '/v1/sync/push', { mutations: [mut] });
      } catch {
        // offline: saved locally via setAiConfig, syncs later
      }
    },
    [profile, api, model],
  );

  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === 'server') {
      setProvider('anthropic');
      void saveChoice('server', 'anthropic');
    }
  };

  const switchProvider = (p: Provider) => {
    setProvider(p);
    setTestResult(null);
    void readKey(p).then(setKey);
    void saveChoice('own', p);
  };

  const testKey = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    await writeKey(provider, key);
    if (provider === 'compatible' && url) {
      await SecureStore.setItemAsync(`${KEY_PREFIX}${provider}.url`, url, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    try {
      const result = await planApi.testKey(
        provider === 'compatible' ? 'custom' : (provider as ProviderId),
        { provider_key: key || undefined, provider_base_url: url || undefined },
      );
      setTestResult(result);
      if (result.ok) haptic.success();
      else haptic.warning();
    } catch {
      setTestResult({ ok: false, message: 'Couldn’t test the key. Check your connection.' });
      haptic.warning();
    } finally {
      setTesting(false);
    }
  };

  return (
    <Page>
      <Header left={<BackLink label="Settings" onPress={() => router.back()} />} />
      <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <T accessibilityRole="header" size={28} weight="700">
            AI assistant
          </T>
        </View>

        <SetGroup>
          <SetRow
            testID="ai-server"
            label="Dialed server"
            a11yLabel="Dialed server: Claude, on the Dialed server’s key. Nothing to set up."
            right={mode === 'server' ? <Dot color={c.acc} /> : null}
            onPress={() => switchMode('server')}
          />
          <SetRow
            testID="ai-byo"
            label="Bring your own"
            a11yLabel="Bring your own key"
            right={mode === 'own' ? <Dot color={c.acc} /> : null}
            last
            onPress={() => switchMode('own')}
          />
        </SetGroup>

        {mode === 'server' ? (
          <View style={{ marginHorizontal: 20, marginTop: 12 }}>
            <T size={14} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
              Claude, on the Dialed server’s key. Nothing to set up.
            </T>
          </View>
        ) : (
          <>
            <SetCap>Provider</SetCap>
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginHorizontal: 20,
                marginTop: 10,
                flexWrap: 'wrap',
              }}
            >
              {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityLabel={PROVIDER_LABELS[p]}
                  accessibilityState={{ selected: provider === p }}
                  onPress={() => switchProvider(p)}
                  style={({ pressed }) => ({
                    height: 36,
                    paddingHorizontal: 16,
                    borderRadius: 18,
                    backgroundColor: provider === p ? c.acc : c.surf,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <T
                    size={14}
                    weight="700"
                    color={provider === p ? (isLight ? '#fff' : c.ink) : c.text}
                  >
                    {PROVIDER_LABELS[p]}
                  </T>
                </Pressable>
              ))}
            </View>

            {provider === 'compatible' ? (
              <View style={{ marginHorizontal: 20, marginTop: 14, gap: 10 }}>
                <TextInput
                  accessibilityLabel="Server URL"
                  placeholder="https://api.example.com/v1"
                  placeholderTextColor={c.muted}
                  value={url}
                  onChangeText={setUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    height: 48,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: c.line,
                    backgroundColor: c.surf,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    color: c.text,
                  }}
                />
                <TextInput
                  accessibilityLabel="Model name"
                  placeholder="Model name"
                  placeholderTextColor={c.muted}
                  value={model}
                  onChangeText={setModel}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    height: 48,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: c.line,
                    backgroundColor: c.surf,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    color: c.text,
                  }}
                />
              </View>
            ) : null}

            <View style={{ marginHorizontal: 20, marginTop: 14, gap: 10 }}>
              <TextInput
                accessibilityLabel="API key"
                placeholder="Paste your API key"
                placeholderTextColor={c.muted}
                value={key}
                onChangeText={(v) => {
                  setKey(v);
                  setTestResult(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={{
                  height: 48,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: c.line,
                  backgroundColor: c.surf,
                  paddingHorizontal: 14,
                  fontSize: 15,
                  color: c.text,
                }}
              />
              <Button
                kind="secondary"
                label="Test"
                busy={testing}
                disabled={!key}
                onPress={() => void testKey()}
                style={{ width: 80 }}
              />
              {testResult ? (
                <View style={{ gap: 4 }}>
                  <T size={13} weight="600" color={testResult.ok ? c.acc : c.err}>
                    {testResult.ok
                      ? 'Key works. Stored in the iPhone Keychain. Sent with each plan request, never saved on the Dialed server.'
                      : (testResult.message ?? 'Key was refused.')}
                  </T>
                </View>
              ) : null}
            </View>
          </>
        )}

        {FEATURES.d35Screens ? (
          <>
            <SetCap>Plan from your AI app</SetCap>
            {connectors.length === 0 ? (
              <View style={{ marginHorizontal: 20, marginTop: 8, gap: 10 }}>
                <T size={14} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
                  Plan in the AI app you already use, then approve here. Works with any assistant
                  that supports MCP connectors: Claude, ChatGPT, Gemini, Cursor and more.
                </T>
                <View style={{ gap: 6, marginTop: 4 }}>
                  <T size={13} weight="600" color={c.text}>
                    1. In your AI app, add a custom connector
                  </T>
                  <T size={13} weight="600" color={c.text}>
                    2. Paste this URL
                  </T>
                </View>
                <SetGroup>
                  <SetRow
                    testID="connector-url"
                    label={mcpUrl}
                    a11yLabel="Copy connector URL"
                    onPress={() => void copyUrl()}
                    value="Copy"
                    last
                  />
                </SetGroup>
                <T size={13} weight="600" color={c.text}>
                  3. Sign in with your Dialed account
                </T>
                <Button
                  kind="secondary"
                  label="I've added it"
                  onPress={() => void refreshConnectors()}
                  style={{ marginTop: 6 }}
                />
                {loadingConnectors ? null : connectors.length === 0 ? null : null}
              </View>
            ) : (
              <View style={{ marginHorizontal: 20, marginTop: 8, gap: 8 }}>
                <SetGroup inset={false}>
                  {connectors.map((conn, i) => (
                    <SetRow
                      key={conn.client_id}
                      testID={`connector-${i}`}
                      label={conn.client_name}
                      small={`${conn.redirect_host} connected`}
                      a11yLabel={`${conn.client_name} connected via ${conn.redirect_host}. Reads your schedule, sends drafts. Nothing changes until you approve here.`}
                      last={i === connectors.length - 1}
                      onPress={() => void disconnect(conn.client_id)}
                      value="Disconnect"
                    />
                  ))}
                </SetGroup>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Button
                    kind="secondary"
                    label="Send a test draft from chat"
                    busy={sendingTest}
                    onPress={() => void sendTestDraft()}
                    style={{ flex: 1 }}
                  />
                </View>
                <Button
                  kind="secondary"
                  label="Connect another app"
                  onPress={() => void copyUrl()}
                  style={{ marginTop: 2 }}
                />
                {connectors.length > 1 ? (
                  <Button
                    kind="destructive"
                    label="Disconnect all"
                    onPress={() => void disconnectAll()}
                    style={{ marginTop: 2 }}
                  />
                ) : null}
              </View>
            )}
          </>
        ) : null}

        <SetCap>How it works</SetCap>
        <View style={{ marginHorizontal: 20, marginTop: 8, gap: 8 }}>
          <T size={14} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
            {aiName()} reads your schedule and the planning guide, then drafts changes. Nothing
            moves until you approve.
          </T>
          <T size={14} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
            Every AI follows the same rules: no overlap, no past-date edits, and your limits always
            apply.
          </T>
        </View>
      </ToastAwareScroll>
    </Page>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
}
