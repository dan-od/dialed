import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { haptic } from '../lib/haptics';
import { fonts, useTheme } from '../theme/theme';
import { T } from '../ui/Text';
import type { FitModel } from './fit';

/**
 * Prototype v11 `.fit` strip: the surrounding day (top row, category colours), your block (bottom row, orange),
 * "Free X to Y", and on a clash the overlap hatched red across both rows, "Overlaps … by N min", the next free
 * slot of the same length dashed (tap = move there) and "Keep both".
 */
export function FitStrip({
  m,
  onShift,
  onKeep,
}: {
  m: FitModel;
  onShift: (start: number) => void;
  onKeep: () => void;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  if (!m.show) return null;
  const pct = (n: number) => `${n}%` as const;
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        {m.head.kind === 'free' ? (
          <T size={13} weight="600" color={c.muted} accessibilityLiveRegion="polite">
            {m.head.text}
          </T>
        ) : (
          <T
            size={13}
            weight="700"
            color={c.err}
            style={{ flex: 1 }}
            accessibilityLiveRegion="polite"
          >
            {m.head.kind === 'clash' ? (
              <>
                {`Overlaps ${m.head.title} by `}
                <Text style={{ fontFamily: fonts.display, fontSize: 16, fontWeight: 'normal' }}>
                  {`${m.head.minutes} min`}
                </Text>
              </>
            ) : (
              `Sharing time with ${m.head.title}`
            )}
          </T>
        )}
        {m.head.kind !== 'free' ? (
          <Pressable
            testID="ov-keep"
            accessibilityRole="button"
            accessibilityLabel={m.head.kind === 'clash' ? 'Keep both' : 'Undo keep both'}
            accessibilityState={{ selected: m.head.kind === 'sharing' }}
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
            onPress={() => {
              haptic.selection();
              onKeep();
            }}
          >
            <T size={13} weight="700" color={c.acc2}>
              {m.head.kind === 'clash' ? 'Keep both' : 'Undo'}
            </T>
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          height: 66,
          borderRadius: 14,
          backgroundColor: c.track,
          overflow: 'hidden',
        }}
      >
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={m.a11y}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
        />
        {m.hatch ? (
          <Animated.View
            entering={reduce ? undefined : FadeIn.duration(200)}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: pct(m.hatch.left),
              width: pct(m.hatch.width),
              borderLeftWidth: 1.5,
              borderRightWidth: 1.5,
              borderColor: c.err,
            }}
          >
            <Svg width="100%" height="100%">
              <Defs>
                <Pattern
                  id="hatch"
                  width={8}
                  height={8}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <Rect x={0} y={0} width={3} height={8} fill={c.err} fillOpacity={0.38} />
                </Pattern>
              </Defs>
              <Rect x={0} y={0} width="100%" height="100%" fill="url(#hatch)" />
            </Svg>
          </Animated.View>
        ) : null}
        {m.segs.map((s) => (
          <View
            key={s.key}
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={{
              position: 'absolute',
              top: 7,
              height: 24,
              left: pct(s.left),
              width: pct(s.width),
              borderRadius: 7,
              backgroundColor: s.color,
              opacity: s.quiet ? 0.45 : 1,
              justifyContent: 'center',
              paddingHorizontal: 7,
              overflow: 'hidden',
            }}
          >
            <T size={11} weight="700" color={c.ink} numberOfLines={1} style={{ lineHeight: 14 }}>
              {s.title}
            </T>
          </View>
        ))}
        {m.slot ? (
          <Pressable
            testID="ov-shift"
            accessibilityRole="button"
            accessibilityLabel={`Move to ${m.slot.label}`}
            hitSlop={{ top: 10, bottom: 10 }}
            onPress={() => {
              haptic.selection();
              onShift(m.slot!.start);
            }}
            style={{
              position: 'absolute',
              top: 35,
              height: 24,
              left: pct(m.slot.left),
              width: pct(m.slot.width),
              borderRadius: 7,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: c.acc2,
              backgroundColor: `${c.acc}14`,
              justifyContent: 'center',
              paddingHorizontal: 6,
              zIndex: 2,
            }}
          >
            <T size={11} weight="800" color={c.acc2} numberOfLines={1} style={{ lineHeight: 14 }}>
              {m.slot.label}
            </T>
          </Pressable>
        ) : null}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: 35,
            height: 24,
            left: pct(m.me.left),
            width: pct(m.me.width),
            borderRadius: 7,
            backgroundColor: c.acc,
            borderWidth: m.me.bad ? 2 : 0,
            borderColor: c.err,
            justifyContent: 'center',
            paddingHorizontal: 7,
            overflow: 'hidden',
            zIndex: 3,
          }}
        >
          <T size={11} weight="800" color={c.ink} numberOfLines={1} style={{ lineHeight: 14 }}>
            {m.me.label}
          </T>
        </View>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 15 }}
      >
        {m.ticks.map((t, i) => (
          <T
            key={t.m}
            size={11}
            weight="600"
            color={c.muted}
            numberOfLines={1}
            style={{
              position: 'absolute',
              lineHeight: 15,
              width: 48,
              ...(i === 0
                ? { left: 0, textAlign: 'left' }
                : i === m.ticks.length - 1 && t.left >= 99.5
                  ? { right: 0, textAlign: 'right' }
                  : { left: pct(t.left), marginLeft: -24, textAlign: 'center' }),
            }}
          >
            {t.label}
          </T>
        ))}
      </View>
      {m.caption ? (
        <T size={12} weight="600" color={c.muted}>
          {m.caption}
        </T>
      ) : null}
    </View>
  );
}
