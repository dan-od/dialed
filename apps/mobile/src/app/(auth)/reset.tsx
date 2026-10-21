import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { TokensOut } from '@dialed/contracts';
import * as Linking from 'expo-linking';
import { useApp } from '../../AppProvider';
import { useAuthCall } from '../../auth/useAuthCall';
import { FEATURES } from '../../config';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { BackLink, FormScroll, H1, Header, Page, Sub } from '../../ui/Chrome';
import { Field } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { useToast } from '../../ui/Toast';

/**
 * "New password" (NAT-07). D-35: not in the approved prototype v8; prototyped in v9 "New screens to approve"
 * and awaiting the owner's approval, so it only renders with the d35Screens feature flag.
 * The token arrives in the URL fragment (dialed://reset#token=…) and never reaches a server log.
 */
export default function ResetPassword() {
  const router = useRouter();
  const toast = useToast();
  const url = Linking.useLinkingURL();
  const { api, signIn } = useApp();
  const token = useMemo(
    () => (url ? (/#token=([A-Za-z0-9_-]{20,200})$/.exec(url)?.[1] ?? null) : null),
    [url],
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [expired, setExpired] = useState(false);
  const { busy, run } = useAuthCall();

  if (!FEATURES.d35Screens) return <Redirect href="/signin" />;

  async function save() {
    if (password.length < 8) {
      haptic.warning();
      setError('Use 8 or more characters.');
      return;
    }
    let isExpired = false;
    const t = await run(
      () =>
        api.request<TokensOut>(
          'POST',
          '/v1/auth/password/reset',
          { token, password },
          { auth: false },
        ),
      (e) => {
        if (e.code === 'code_expired' || e.code === 'bad_request') {
          isExpired = e.code === 'code_expired';
          if (!isExpired)
            setError(
              String(
                (e.details?.fields as Record<string, string> | undefined)?.password ??
                  'Use 8 or more characters.',
              ),
            );
          return true;
        }
        return false;
      },
    );
    if (isExpired) {
      haptic.warning();
      setExpired(true);
      return;
    }
    if (t) {
      haptic.success();
      await signIn(t);
      toast('Password changed. You’re signed in.');
    }
  }

  if (expired || (url && !token)) {
    return (
      <Page>
        <Header left={<BackLink label="Sign in" onPress={() => router.replace('/signin')} />} />
        <FormScroll>
          <View style={{ paddingHorizontal: 20 }}>
            <H1 size={56}>That link expired</H1>
            <Sub>Reset links work for 30 minutes and only once.</Sub>
          </View>
          <Notice stamp="Expired" text="Send a new link from Sign in and use the newest email." />
          <View style={{ paddingHorizontal: 20, marginTop: 18, gap: 8 }}>
            <Button label="Back to sign in" onPress={() => router.replace('/signin')} />
          </View>
        </FormScroll>
      </Page>
    );
  }

  return (
    <Page>
      <Header left={<BackLink label="Cancel" onPress={() => router.replace('/signin')} />} />
      <FormScroll>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={56}>Pick a new password</H1>
          <Sub>You’ll be signed out on your other devices.</Sub>
          <View style={{ marginTop: 22 }}>
            <Field
              label="New password"
              password
              value={password}
              onChangeText={setPassword}
              error={error}
              helper="8 or more characters. Not the same as your old one."
              textContentType="newPassword"
              autoComplete="new-password"
              onSubmitEditing={save}
            />
          </View>
        </View>
        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <Button label="Save and sign in" busy={busy} disabled={!token} onPress={save} />
        </View>
      </FormScroll>
    </Page>
  );
}
