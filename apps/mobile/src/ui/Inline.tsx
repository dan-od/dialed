import { Text, View, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { T } from './Text';

// Prototype v11 messages: they live where they belong — under the field, in the row, under the title. No boxes,
// no stamps (`.inl`, `.offpill`, `.offline`).

export type Part =
  string | { b: string } | { hot: string } | { link: string; onPress: () => void; testID?: string };

/** `.inl`: 14/500 soft, key words bold (text) or red (`hot`), the fix as an orange text link; fades up 200 ms. */
export function InlineMessage({
  parts,
  inSheet,
  style,
}: {
  parts: Part[];
  inSheet?: boolean;
  style?: ViewStyle;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={
        reduce
          ? FadeIn.duration(120)
          : FadeInDown.duration(200).withInitialValues({ transform: [{ translateY: 4 }] })
      }
      accessibilityLiveRegion="polite"
      style={[
        { marginTop: inSheet ? 0 : 12, marginHorizontal: inSheet ? 0 : 20, maxWidth: 360 },
        style,
      ]}
    >
      <T size={14} weight="500" color={c.soft} style={{ lineHeight: 20 }}>
        <Parts parts={parts} />
      </T>
    </Animated.View>
  );
}

/** Nested text runs for a sentence (shared with field error lines). */
export function Parts({ parts }: { parts: Part[] }) {
  const { c } = useTheme();
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <Text key={i}>{p}</Text>
        ) : 'b' in p ? (
          <Text key={i} style={{ fontWeight: '700', color: c.text }}>
            {p.b}
          </Text>
        ) : 'hot' in p ? (
          <Text key={i} style={{ fontWeight: '700', color: c.err }}>
            {p.hot}
          </Text>
        ) : (
          <Text
            key={i}
            testID={p.testID}
            accessibilityRole="link"
            accessibilityLabel={p.link}
            onPress={p.onPress}
            suppressHighlighting={false}
            style={{ fontWeight: '700', color: c.acc2 }}
          >
            {p.link}
          </Text>
        ),
      )}
    </>
  );
}

/** `.offpill`: 28 pt, surf2, a hollow acc2 ring, "Offline" or "Offline · N to sync". */
export function OfflinePill({ pending }: { pending: number }) {
  const { c } = useTheme();
  const label = pending ? `Offline · ${pending} to sync` : 'Offline';
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: 'flex-start',
        height: 28,
        paddingLeft: 9,
        paddingRight: 11,
        borderRadius: 14,
        backgroundColor: c.surf2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 5, borderWidth: 2, borderColor: c.acc2 }} />
      <T size={12} weight="700" color={c.soft} style={{ lineHeight: 15 }} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

/** `.offline`: the pill plus one muted 13/500 sentence (the pill already says "offline"). */
export function OfflineLine({
  pending,
  text,
  inSheet,
  pill = true,
}: {
  pending: number;
  text?: string;
  inSheet?: boolean;
  pill?: boolean;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={
        reduce
          ? FadeIn.duration(120)
          : FadeInDown.duration(200).withInitialValues({ transform: [{ translateY: 4 }] })
      }
      style={{
        marginTop: inSheet ? 0 : 12,
        marginHorizontal: inSheet ? 0 : 20,
        alignItems: 'flex-start',
        gap: 6,
      }}
    >
      {pill ? <OfflinePill pending={pending} /> : null}
      {text ? (
        <T size={13} weight="500" color={c.muted} style={{ lineHeight: 18, maxWidth: 330 }}>
          {text}
        </T>
      ) : null}
    </Animated.View>
  );
}
