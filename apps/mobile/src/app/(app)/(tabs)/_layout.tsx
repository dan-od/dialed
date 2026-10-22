import { resolveDay } from '@dialed/schedule';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../AppProvider';
import { newAddDraft, useBlocksUi } from '../../../blocks/BlocksUi';
import { now } from '../../../clock/clock';
import { FloatingNav, type Tab } from '../../../day/FloatingNav';
import { NavStateProvider, useNavState } from '../../../day/navState';
import { useToastAnchor } from '../../../ui/Toast';

function Nav({ state }: { state: { index: number; routes: { name: string }[] } }) {
  const router = useRouter();
  const { data } = useApp();
  const ui = useBlocksUi();
  const insets = useSafeAreaInsets();
  const { mini, setMini } = useNavState();
  const active = (state.routes[state.index]?.name ?? 'day') as Tab;
  const navBottom = Math.max(24, insets.bottom - 10);
  useToastAnchor(navBottom + 54); // toasts sit above the floating nav, never over it
  return (
    <FloatingNav
      active={active}
      mini={active === 'day' && mini}
      bottom={navBottom}
      onTab={(t) => {
        setMini(false);
        router.navigate(`/${t}`);
      }}
      onPlus={() => {
        if (!data) return;
        const tz = data.profile?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const t = now(tz); // the Day's clock (dev clock aware)
        ui.flash(null);
        ui.setAdd(newAddDraft(t.date, t.minute, resolveDay(t.date, data.schedule).blocks));
        router.push('/add');
      }}
      onExpand={() => setMini(false)}
    />
  );
}

export default function TabsLayout() {
  return (
    <NavStateProvider>
      <Tabs
        screenOptions={{ headerShown: false, animation: 'none' }}
        tabBar={(p) => <Nav state={p.state} />}
      >
        <Tabs.Screen name="day" />
        <Tabs.Screen name="week" />
        <Tabs.Screen name="month" />
      </Tabs>
    </NavStateProvider>
  );
}
