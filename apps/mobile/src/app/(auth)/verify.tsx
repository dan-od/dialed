import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';
import type { TokensOut } from '@dialed/contracts';
import { useApp } from '../../AppProvider';
import { ApiError } from '../../api/errors';
import { AuthNotices } from '../../auth/AuthNotices';
import { useAuthCall } from '../../auth/useAuthCall';
import { firstName } from '../../auth/validate';
import { haptic } from '../../lib/haptics';
import { readPending } from '../../session/storage';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { BackLink, FormScroll, H1, Header, Page } from '../../ui/Chrome';
import { Field } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

const RESEND_COOLDOWN = 60;

export default function Verify() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ email?: string }>();
  const { api, signIn, online } = useApp();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const { busy, notice, run } = useAuthCall();
  const input = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (!email) void readPending().then((p) => p && setEmail(p.email)); // reopened after an app kill
  }, [email]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function check(value: string) {
    setError(undefined);
    let failed: ApiError | null = null;
    const tokens = await run(
      () =>
        api.request<TokensOut>(
          'POST',
          '/v1/auth/verify',
          { email, code: value, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          { auth: false },
        ),
      (e) => {
        if (e.code === 'code_invalid' || e.code === 'code_expired' || e.code === 'bad_request') {
          failed = e;
          return true;
        }
        return false;
      },
    );
    if (failed) {
      haptic.warning();
      setError(
        (failed as ApiError).code === 'code_expired'
          ? 'That code expired. Send a new one.'
          : 'That code doesn’t match. Check the newest email from Dialed.',
      );
      setCode('');
      input.current?.focus();
      return;
    }
    if (tokens) {
      haptic.success();
      await signIn(tokens);
      toast(`Welcome, ${firstName(tokens.user.display_name)}. Let's set up your week.`);
    }
  }

  function onChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void check(digits);
  }

  async function resend() {
    setCode('');
    const ok = await run(() =>
      api.request('POST', '/v1/auth/resend', { email, purpose: 'verify' }, { auth: false }),
    );
    if (ok !== undefined) {
      setCooldown(RESEND_COOLDOWN);
      toast(`New code sent to ${email || 'your email'}.`);
    }
  }

  const mmss = `${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, '0')}`;
  return (
    <Page>
      <Header left={<BackLink label="Sign up" onPress={() => router.back()} />} />
      <FormScroll>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={60}>Check your inbox</H1>
          <T size={15} weight="500" color={c.muted} style={{ marginTop: 8, lineHeight: 20 }}>
            {'We sent a 6-digit code to '}
            <T size={15} weight="700">
              {email || 'your email'}
            </T>
            .
          </T>
          <View style={{ gap: 14, marginTop: 22 }}>
            <Field
              ref={input}
              testID="verify-code"
              label="Code"
              code
              value={code}
              onChangeText={onChange}
              error={error}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              editable={!busy}
            />
            {busy ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Spinner color={c.muted} />
                <T size={13} weight="600" color={c.muted}>
                  Checking
                </T>
              </View>
            ) : null}
          </View>
        </View>
        <AuthNotices
          notice={online ? notice : { kind: 'offline' }}
          email={email}
          offlineVerb="make an account"
        />
        <View style={{ paddingHorizontal: 20, marginTop: 22, gap: 8 }}>
          <Button
            kind="secondary"
            label={cooldown > 0 ? `Send again in ${mmss}` : 'Send a new code'}
            disabled={cooldown > 0 || !online}
            onPress={resend}
          />
          <Button kind="link" label="Wrong email? Change it" onPress={() => router.back()} />
        </View>
      </FormScroll>
    </Page>
  );
}
