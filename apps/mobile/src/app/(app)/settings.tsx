import { termFor } from '@dialed/schedule';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import { ApiError } from '../../api/errors';
import { APP_NAME } from '../../config';
import { haptic } from '../../lib/haptics';
import { notifValue } from '../../settings/model';
import { SetCap, SetGroup, SetRow } from '../../settings/ui';
import { BackLink, Dialog, H1, Header, Page } from '../../ui/Chrome';
import { Button } from '../../ui/Button';
import { OfflineLine } from '../../ui/Inline';
import { Spinner } from '../../ui/Spinner';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { ToastAwareScroll } from '../../ui/ToastAwareScroll';
import { useSchedule } from '../../week/useSchedule';

/**
 * Settings (Flow 09, prototype `settings`): each row shows its current value. AI assistant (Flows 06/07) and
 * Delete account (Flow 01 re-auth) join when those flows are built, so no row leads to a dead end.
 */
export default function SettingsScreen() {
  const { c, data, session, prefs, online, api, signOut, sync, now } = useSchedule();
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const user = session.status === 'signedIn' ? session.user : null;
  const cats = (data?.schedule.categories ?? []).filter((x) => !x.deleted_at);
  const terms = data?.schedule.terms ?? [];
  const term =
    termFor(now.date, terms) ??
    terms
      .filter((t) => !t.deleted_at && !t.is_draft && t.starts_on > now.date)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ??
    null;
  const name = data?.profile?.display_name || user?.display_name || '';

  const exportData = async () => {
    if (exporting) return;
    setExporting(true);
    const file = new File(Paths.cache, 'dialed-export.zip');
    try {
      const bytes = await api.download('/v1/account/export');
      if (file.exists) file.delete();
      file.create();
      file.write(new Uint8Array(bytes));
      const r = await Share.share({ url: file.uri });
      if (r.action === Share.sharedAction)
        toast('Export ready: dialed-export.json and dialed.ics.');
    } catch (e) {
      toast(
        e instanceof ApiError && e.status === 429
          ? e.message
          : 'Couldn’t export. Check your connection and try again.',
      );
    } finally {
      if (file.exists) file.delete();
      setExporting(false);
    }
  };

  return (
    <Page>
      <Header left={<BackLink label="Day" onPress={() => router.back()} />} />
      <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={64}>Settings</H1>
        </View>
        <SetGroup>
          <SetRow
            testID="set-cats"
            label="Categories"
            value={String(cats.length)}
            chevron
            onPress={() => router.push('/categories')}
          />
          <SetRow
            testID="set-notif"
            label="Notifications"
            value={notifValue(prefs)}
            chevron
            onPress={() => router.push('/notifications')}
          />
          <SetRow
            testID="set-terms"
            label="Terms and dates"
            value={term?.name ?? 'None'}
            chevron
            last
            onPress={() => router.push({ pathname: '/terms', params: { from: 'settings' } })}
          />
        </SetGroup>
        <SetCap>Account</SetCap>
        <SetGroup>
          <SetRow label={name} small={user?.email ?? ''} />
          <SetRow
            testID="set-export"
            label="Export my data"
            value={
              exporting ? (
                <View accessibilityLabel="Exporting">
                  <Spinner color={c.muted} />
                </View>
              ) : (
                'JSON + calendar'
              )
            }
            disabled={!online}
            onPress={() => void exportData()}
          />
          <SetRow testID="set-signout" label="Sign out" last onPress={() => setConfirm(true)} />
        </SetGroup>
        {!online ? (
          <View style={{ marginHorizontal: 20, marginTop: 12 }}>
            <OfflineLine inSheet pending={sync.pending} text="Connect to export." />
          </View>
        ) : null}
        <T
          size={12}
          weight="500"
          color={c.muted}
          style={{ textAlign: 'center', marginTop: 16, paddingHorizontal: 20 }}
        >
          {`${APP_NAME} ${Constants.expoConfig?.version ?? ''}`}
        </T>
      </ToastAwareScroll>
      <Dialog
        visible={confirm}
        title="Sign out?"
        body="Your routines stay in your account. Reminders stop on this phone until you sign back in."
      >
        <Button
          kind="secondary"
          label="Cancel"
          style={{ marginTop: 6 }}
          onPress={() => setConfirm(false)}
        />
        <Button
          kind="destructive"
          label="Sign out"
          onPress={async () => {
            haptic.warning();
            setConfirm(false);
            await signOut();
          }}
        />
      </Dialog>
    </Page>
  );
}
