import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { fonts, useTheme } from '../theme/theme';
import { T } from './Text';

/** Stamp notice: tilted Anton stamp + one plain sentence + optional action. Replaces boxed alerts. */
export function Notice({
  stamp,
  text,
  action,
  kind = 'warn',
}: {
  stamp: string;
  text: string;
  action?: { label: string; onPress: () => void };
  kind?: 'warn' | 'err' | 'quiet';
}) {
  const { c } = useTheme();
  const bg = kind === 'err' ? c.err : kind === 'quiet' ? c.surf2 : c.warn;
  const fg = kind === 'quiet' ? c.text : c.ink;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ marginTop: 14, marginHorizontal: 20, alignItems: 'flex-start', gap: 7 }}
    >
      <View
        style={{
          transform: [{ rotate: '-2deg' }],
          backgroundColor: bg,
          borderRadius: 6,
          paddingTop: 5,
          paddingBottom: 4,
          paddingHorizontal: 9,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: 15,
            letterSpacing: 0.4,
            lineHeight: 17,
            color: fg,
          }}
        >
          {stamp}
        </Text>
      </View>
      <T size={14} weight="600" style={{ lineHeight: 20, maxWidth: 268 }}>
        {text}
      </T>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={{
            height: 40,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: c.acc,
            justifyContent: 'center',
          }}
        >
          <Text
            style={{ fontFamily: fonts.display, fontSize: 17, letterSpacing: 0.3, color: c.ink }}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
