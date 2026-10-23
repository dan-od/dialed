import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInputInstance } from 'react-native';
import type { TokensOut } from '@dialed/contracts';
import { useApp } from '../../AppProvider';
import { AuthNotices, emailProblem } from '../../auth/AuthNotices';
import { useAuthCall } from '../../auth/useAuthCall';
import { firstName, validateAuth, type AuthErrors } from '../../auth/validate';
import { haptic } from '../../lib/haptics';
import { writePending } from '../../session/storage';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { BackLink, FormScroll, H1, Header, Page } from '../../ui/Chrome';
import { Field } from '../../ui/Field';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

export default function SignIn() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ email?: string }>();
  const { api, signIn, online } = useApp();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<AuthErrors>({});
  const { busy, notice, setNotice, run } = useAuthCall();
  const emailRef = useRef<TextInputInstance>(null);
  const pwRef = useRef<TextInputInstance>(null);

  async function submit() {
    const errs = validateAuth('signin', { email, password });
    setErrors(errs);
    if (errs.email || errs.password) {
      haptic.warning();
      (errs.email ? emailRef : pwRef).current?.focus();
      return;
    }
    const clean = email.trim().toLowerCase();
    let outcome: 'wrong' | 'none' | 'verify' | null = null;
    const tokens = await run(
      () =>
        api.request<TokensOut>(
          'POST',
          '/v1/auth/login',
          { email: clean, password, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          { auth: false },
        ),
      (e) => {
        if (e.code === 'bad_credentials') {
          outcome = 'wrong';
          return true;
        }
        if (e.code === 'forbidden' && e.details?.verify_required) {
          outcome = 'verify';
          return true;
        }
        return false;
      },
    );
    if (outcome === 'wrong') {
      // "No account" vs "wrong password" (rate-limited check endpoint, SECURITY.md).
      const exists = await api
        .request<{ exists: boolean }>(
          'POST',
          '/v1/auth/login/check',
          { email: clean },
          { auth: false },
        )
        .catch(() => ({ exists: true }));
      haptic.warning();
      if (exists.exists) {
        setErrors({ password: 'That password doesn’t match. Try again, or reset it.' });
        pwRef.current?.focus();
      } else setNotice({ kind: 'none' });
      return;
    }
    if (outcome === 'verify') {
      await writePending({ email: clean, name: '' });
      router.push({ pathname: '/verify', params: { email: clean } });
      return;
    }
    if (tokens) {
      haptic.success();
      await signIn(tokens);
      toast(`Welcome back, ${firstName(tokens.user.display_name)}.`);
    }
  }

  // v11: no account for this email shows in its error line, with Make an account.
  const problem = emailProblem(online ? notice : null, {
    onSignUp: () => router.replace({ pathname: '/signup', params: { email: email.trim() } }),
  });
  return (
    <Page>
      <Header left={<BackLink label="Welcome" onPress={() => router.back()} />} />
      <FormScroll>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={60}>Welcome back</H1>
          {/* "Sign in with Apple" + "or with email" hidden on the Personal Team build (D-39). */}
          <View style={{ gap: 14, marginTop: 22 }}>
            <Field
              ref={emailRef}
              testID="signin-email"
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={errors.email ?? problem?.text}
              errorLink={errors.email ? undefined : problem?.link}
              textContentType="emailAddress"
              autoComplete="email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => pwRef.current?.focus()}
            />
            <Field
              ref={pwRef}
              testID="signin-password"
              label="Password"
              password
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/forgot', params: { email: email.trim() } })}
              style={{ alignSelf: 'flex-start', height: 44, justifyContent: 'center' }}
            >
              <T size={14} weight="700" color={c.acc2}>
                Forgot password?
              </T>
            </Pressable>
          </View>
        </View>
        <AuthNotices
          notice={online ? notice : { kind: 'offline' }}
          offlineVerb="sign in"
          onRetry={submit}
        />
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Button label="Sign in" busy={busy} disabled={!online} onPress={submit} />
        </View>
      </FormScroll>
    </Page>
  );
}
