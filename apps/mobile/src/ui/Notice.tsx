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
  inline,
}: {
  stamp: string;
  text: string;
  action?: { label: string; onPress: () => void };
  kind?: 'warn' | 'err' | 'quiet';
  /** Inside a sheet (`.note.in-sheet`): no page margins. */
  inline?: boolean;
}) {
  const { c } = useTheme();
  const bg = kind === 'err' ? c.err : kind === 'quiet' ? c.surf2 : c.stamp;
  const fg = kind === 'quiet' ? c.text : c.ink;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        marginTop: inline ? 0 : 14,
        marginHorizontal: inline ? 0 : 20,
        alignItems: 'flex-start',
        gap: 7,
      }}
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
          hitSlop={{ top: 2, bottom: 2 }} // 40 pt button → 44 pt target
          style={{
            height: 40,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: kind === 'quiet' ? c.surf : c.acc,
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: 17,
              letterSpacing: 0.3,
              color: kind === 'quiet' ? c.text : c.ink,
            }}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
