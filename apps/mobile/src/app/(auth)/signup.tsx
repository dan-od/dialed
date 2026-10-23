import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';
import { useApp } from '../../AppProvider';
import { AuthNotices, emailProblem } from '../../auth/AuthNotices';
import { useAuthCall } from '../../auth/useAuthCall';
import { validateAuth, type AuthErrors } from '../../auth/validate';
import { haptic } from '../../lib/haptics';
import { writePending } from '../../session/storage';
import { Button } from '../../ui/Button';
import { BackLink, FormScroll, H1, Header, Page, Sub } from '../../ui/Chrome';
import { Field } from '../../ui/Field';

export default function SignUp() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { api, online } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<AuthErrors>({});
  const { busy, notice, run } = useAuthCall();
  const nameRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const pwRef = useRef<TextInputInstance>(null);

  async function submit() {
    const errs = validateAuth('signup', { name, email, password });
    setErrors(errs);
    const first = (['name', 'email', 'password'] as const).find((k) => errs[k]);
    if (first) {
      haptic.warning();
      ({ name: nameRef, email: emailRef, password: pwRef })[first].current?.focus();
      return;
    }
    const clean = email.trim().toLowerCase();
    const ok = await run(
      () =>
        api.request(
          'POST',
          '/v1/auth/signup',
          { name: name.trim(), email: clean, password },
          { auth: false },
        ),
      (e) => {
        if (e.code === 'bad_request' && e.details?.fields) {
          const f = e.details.fields as Record<string, string>;
          setErrors({ name: f.name, email: f.email, password: f.password });
          haptic.warning();
          return true;
        }
        return false;
      },
    );
    if (ok !== undefined) {
      await writePending({ email: clean, name: name.trim() });
      router.push({ pathname: '/verify', params: { email: clean } });
    }
  }

  // v11: the email's own problem (taken, invite-only) sits in its error line, the fix as a link.
  const problem = emailProblem(online ? notice : null, {
    onSignIn: () => router.replace({ pathname: '/signin', params: { email: email.trim() } }),
  });
  return (
    <Page>
      <Header left={<BackLink label="Welcome" onPress={() => router.back()} />} />
      <FormScroll>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={60}>Make your account</H1>
          <Sub>Your routines and plans sync to it, so a new phone picks up where you left off.</Sub>
          <View style={{ gap: 14, marginTop: 22 }}>
            <Field
              ref={nameRef}
              testID="signup-name"
              label="Your name"
              value={name}
              onChangeText={setName}
              error={errors.name}
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
            <Field
              ref={emailRef}
              testID="signup-email"
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
              testID="signup-password"
              label="Password"
              password
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              helper="8 or more characters."
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          </View>
        </View>
        <AuthNotices
          notice={online ? notice : { kind: 'offline' }}
          offlineVerb="make an account"
          onRetry={submit}
        />
        <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 10 }}>
          <Button label="Create account" busy={busy} disabled={!online} onPress={submit} />
        </View>
      </FormScroll>
    </Page>
  );
}
