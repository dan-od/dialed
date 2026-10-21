import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingNav, type Tab } from '../../../day/FloatingNav';
import { NavStateProvider, useNavState } from '../../../day/navState';
import { useToast } from '../../../ui/Toast';

function Nav({ state }: { state: { index: number; routes: { name: string }[] } }) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { mini, setMini } = useNavState();
  const active = (state.routes[state.index]?.name ?? 'day') as Tab;
  return (
    <FloatingNav
      active={active}
      mini={active === 'day' && mini}
      bottom={Math.max(24, insets.bottom - 10)}
      onTab={(t) => {
        setMini(false);
        router.navigate(`/${t}`);
      }}
      onPlus={() => toast('Adding blocks arrives with the next build step.')}
      onExpand={() => setMini(false)}
    />
  );
}

export default function TabsLayout() {
  return (
    <NavStateProvider>
      <Tabs
        screenOptions={{ headerShown: false, animation: 'fade' }}
        tabBar={(p) => <Nav state={p.state} />}
      >
        <Tabs.Screen name="day" />
        <Tabs.Screen name="week" />
        <Tabs.Screen name="month" />
      </Tabs>
    </NavStateProvider>
  );
}
