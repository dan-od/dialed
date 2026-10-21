import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../../AppProvider';
import { APP_NAME } from '../../config';
import { initials } from '../../day/DayHeader';
import { haptic } from '../../lib/haptics';
import { useTheme } from '../../theme/theme';
import { Button, IconButton } from '../../ui/Button';
import { Dialog } from '../../ui/Chrome';
import { CloseIcon, Mark } from '../../ui/icons';
import { DisplayTitle } from '../../ui/DisplayTitle';
import { D, T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import Constants from 'expo-constants';

export default function AccountSheet() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { session, data, signOut } = useApp();
  const [confirm, setConfirm] = useState(false);
  const user = session.status === 'signedIn' ? session.user : null;
  const name = data?.profile?.display_name || user?.display_name || '';
  const today = new Date().toISOString().slice(0, 10);
  const term = data?.schedule.terms.find(
    (t) => !t.is_draft && !t.deleted_at && t.starts_on <= today && today <= t.ends_on,
  );
  const rows: [string, string][] = [
    ['Signed in with', 'Email'],
    ['Routine', term?.name ?? 'Not set up'],
    ['Reminders', 'Not set up'],
  ];
  return (
    <View
      style={{
        paddingTop: 22,
        paddingHorizontal: 20,
        paddingBottom: 28,
        gap: 14,
        backgroundColor: c.sheetSurf,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <DisplayTitle size={32} line={1} color={c.text}>
          Account
        </DisplayTitle>
        <IconButton label="Close" onPress={() => router.back()}>
          <CloseIcon color={c.text} />
        </IconButton>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: c.acc,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <D size={22} color={c.ink} style={{ lineHeight: 28 }}>
            {initials(name)}
          </D>
        </View>
        <View style={{ flex: 1 }}>
          <T size={17} weight="700">
            {name}
          </T>
          <T size={14} color={c.muted}>
            {user?.email ?? ''}
          </T>
        </View>
      </View>
      <View>
        {rows.map(([k, v], i) => (
          <View
            key={k}
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: i < rows.length - 1 ? 1 : 0,
              borderBottomColor: c.line,
            }}
          >
            <T weight="600" style={{ flex: 1 }}>
              {k}
            </T>
            <T weight="600" color={c.muted}>
              {v}
            </T>
          </View>
        ))}
      </View>
      <Button label="Settings" onPress={() => toast('Settings arrive with Flow 09.')} />
      <Button label="Sign out" kind="secondary" fg={c.err} onPress={() => setConfirm(true)} />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          opacity: 0.8,
        }}
      >
        <Mark color={c.muted} size={18} />
        <T size={12} weight="600" color={c.muted}>
          {`${APP_NAME} ${Constants.expoConfig?.version ?? ''}`}
        </T>
      </View>
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
            router.back();
            await signOut();
          }}
        />
      </Dialog>
    </View>
  );
}
