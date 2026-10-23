import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../../AppProvider';
import { AuthNotices } from '../../auth/AuthNotices';
import { useAuthCall } from '../../auth/useAuthCall';
import { validateAuth } from '../../auth/validate';
import { APP_NAME } from '../../config';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { BackLink, FormScroll, H1, Header, Page, Sub } from '../../ui/Chrome';
import { Field } from '../../ui/Field';
import { InlineMessage } from '../../ui/Inline';
import { useToast } from '../../ui/Toast';

export default function Forgot() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ email?: string }>();
  const { api, online } = useApp();
  const [email, setEmail] = useState(params.email ?? '');
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const { busy, notice, run } = useAuthCall();

  async function send(again = false) {
    const errs = validateAuth('forgot', { email, password: '' });
    setError(errs.email);
    if (errs.email) {
      haptic.warning();
      return;
    }
    const ok = await run(() =>
      api.request(
        'POST',
        '/v1/auth/password/forgot',
        { email: email.trim().toLowerCase() },
        { auth: false },
      ),
    );
    if (ok === undefined) return;
    if (again) toast('Sent again. It can take a minute.');
    else haptic.success();
    setSent(true);
  }

  return (
    <Page>
      <Header left={<BackLink label="Sign in" onPress={() => router.back()} />} />
      <FormScroll>
        <View style={{ paddingHorizontal: 20 }}>
          {/* Copy: the reset link lasts 30 minutes (SECURITY.md), so "an hour" in the prototype is corrected. */}
          <H1 size={56}>Reset your password</H1>
          <Sub>We’ll email a link. It works for 30 minutes.</Sub>
        </View>
        {sent ? (
          <>
            <InlineMessage
              parts={[
                'Sent to ',
                { b: email.trim() },
                `. The link opens ${APP_NAME} on this phone so you can pick a new password.`,
              ]}
            />
            <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 8 }}>
              <Button label="Back to sign in" onPress={() => router.back()} />
              <Button
                kind="secondary"
                label="Didn’t get it? Send again"
                busy={busy}
                onPress={() => send(true)}
              />
            </View>
          </>
        ) : (
          <>
            <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={error}
                textContentType="emailAddress"
                autoComplete="email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={() => send()}
              />
            </View>
            <AuthNotices
              notice={online ? notice : { kind: 'offline' }}
              offlineVerb="send the link"
            />
            <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
              <Button
                label="Send reset link"
                busy={busy}
                disabled={!online}
                onPress={() => send()}
              />
            </View>
          </>
        )}
      </FormScroll>
    </Page>
  );
}
