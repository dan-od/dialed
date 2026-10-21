import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, aiName } from '../../config';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { H1, Page } from '../../ui/Chrome';
import { LOGO_D, LOGO_SLOT, Mark, Wordmark } from '../../ui/icons';
import { heroIn } from '../../ui/motion';
import { T } from '../../ui/Text';

export default function Welcome() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const legal = (path: string) =>
    void WebBrowser.openBrowserAsync(`${API_BASE_URL}/${path}`).catch(() => {});
  return (
    <Page>
      <Svg
        pointerEvents="none"
        width={380}
        height={380}
        viewBox="0 0 256 256"
        style={{ position: 'absolute', right: -96, top: 64 }}
      >
        <Path fill={c.surf2} fillRule="evenodd" d={`${LOGO_D} ${LOGO_SLOT}`} />
      </Svg>
      <View
        style={{
          paddingTop: Math.max(insets.top, Math.min(58, height * 0.06)),
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Mark color={c.acc} size={30} />
        <Wordmark color={c.text} height={20} />
      </View>
      <View
        style={{
          marginTop: 'auto',
          paddingHorizontal: 20,
          paddingBottom: Math.max(30, insets.bottom + 6),
          gap: 10,
        }}
      >
        <Animated.View entering={heroIn(reduce)} style={{ marginBottom: 4 }}>
          <H1 size={Math.min(76, height * 0.082)} upper>
            Your week, dialed in.
          </H1>
        </Animated.View>
        <T size={15} weight="500" color={c.muted} style={{ lineHeight: 20, marginBottom: 14 }}>
          {`Routines that repeat, a day that tells you what's next, and ${aiName()} to draft the changes. Nothing moves until you approve it.`}
        </T>
        {/* "Continue with Apple" (prototype) is hidden: D-39 Personal Team build, BACKEND_SETUP §13. */}
        <Button label="Sign up with email" onPress={() => router.push('/signup')} />
        <Button label="I have an account" kind="secondary" onPress={() => router.push('/signin')} />
        <T
          size={12}
          weight="500"
          color={c.muted}
          style={{ textAlign: 'center', marginTop: 4, lineHeight: 17 }}
        >
          {'By continuing you agree to the '}
          <T
            size={12}
            weight="700"
            color={c.acc2}
            accessibilityRole="link"
            onPress={() => legal('terms')}
          >
            Terms
          </T>
          {' and '}
          <T
            size={12}
            weight="700"
            color={c.acc2}
            accessibilityRole="link"
            onPress={() => legal('privacy')}
          >
            Privacy Policy
          </T>
          .
        </T>
      </View>
    </Page>
  );
}
