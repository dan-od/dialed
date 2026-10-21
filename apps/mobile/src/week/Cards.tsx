import { useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useReducedMotion,
  withDelay,
  withTiming,
  type EntryAnimationsValues,
  type LayoutAnimation,
} from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { LARGE_TEXT } from '../ui/largeText';
import { D, T } from '../ui/Text';
import type { Card, Tile } from './model';

export const CARD_W = 296;
/** Card width: 296 pt, wider with larger Dynamic Type, never wider than the screen minus a peek of the next card. */
export const cardWidth = (fontScale: number, screenW: number) =>
  Math.round(Math.min(CARD_W * Math.max(1, fontScale), screenW - 40 - 24));
export const CARD_GAP = 12;

/** Cards slide in from the right; the tapped day first, neighbours rippling out 60 ms apart. */
const cardIn =
  (delay: number, reduce: boolean) =>
  (_v: EntryAnimationsValues): LayoutAnimation => {
    'worklet';
    if (reduce)
      return {
        initialValues: { opacity: 0 },
        animations: { opacity: withTiming(1, { duration: 120 }) },
      };
    const cfg = { duration: 600, easing: Easing.bezier(0.16, 1, 0.3, 1) };
    return {
      initialValues: { opacity: 0, transform: [{ translateX: 80 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, cfg)),
        transform: [{ translateX: withDelay(delay, withTiming(0, cfg)) }],
      },
    };
  };

export function DayCard({
  card,
  delay,
  width = CARD_W,
}: {
  card: Card;
  delay: number;
  width?: number;
}) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= LARGE_TEXT;
  const fg = card.today ? c.ink : c.text;
  return (
    <Animated.View
      entering={cardIn(delay, reduce)}
      accessible
      accessibilityLabel={`${card.a11y}. ${card.rows.map((r) => `${r.time} ${r.title}, ${r.duration}`).join('. ')}`}
      style={{
        width,
        minHeight: 340,
        borderRadius: 28,
        padding: 18,
        backgroundColor: card.today ? c.acc : c.surf,
        borderWidth: 1,
        borderColor: card.today ? c.acc : c.surf2,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T weight="700" color={fg}>
          {card.label}
        </T>
        <D size={16} color={fg} style={{ lineHeight: 22 }}>
          {card.total}
        </D>
      </View>
      <D
        size={62}
        color={fg}
        style={{ lineHeight: 62, marginTop: 2, marginBottom: 8, paddingTop: 6 }}
      >
        {card.numeral}
      </D>
      {card.rows.map((r) => (
        <View
          key={r.key}
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 10,
            paddingVertical: 4,
            opacity: r.past ? 0.45 : 1,
          }}
        >
          <D
            size={16}
            color={fg}
            numberOfLines={1}
            style={{ width: 44 * fontScale, lineHeight: 20 }}
          >
            {r.time}
          </D>
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              alignSelf: 'center',
              backgroundColor: card.today ? c.ink : r.color,
            }}
          />
          {/* Large Dynamic Type: duration under the title so long words never break. */}
          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: stacked ? 'column' : 'row',
              alignItems: stacked ? 'flex-start' : 'baseline',
              gap: stacked ? 0 : 10,
            }}
          >
            <T
              size={14}
              weight={r.current ? '800' : '600'}
              color={fg}
              style={{ flex: stacked ? undefined : 1, minWidth: 0, lineHeight: 18 }}
            >
              {r.title}
            </T>
            <T size={12} weight="600" color={fg} style={{ opacity: 0.75 }}>
              {r.duration}
            </T>
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

export function Tiles({ tiles }: { tiles: Tile[] }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        marginTop: 14,
        marginHorizontal: 20,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      {tiles.map((t) => (
        <View
          key={t.label}
          accessible
          accessibilityLabel={`${t.label}, ${t.value.endsWith('x') ? `${t.value.replace('x', '')} days` : `${t.value.replace('h', '')} hours`}`}
          style={{
            flexBasis: '31%',
            flexGrow: 1,
            borderRadius: 16,
            backgroundColor: c.surf,
            paddingVertical: 6,
            paddingHorizontal: 12,
          }}
        >
          <D size={22} color={t.color} style={{ lineHeight: 26 }}>
            {t.value}
          </D>
          <T size={12} weight="600" color={c.muted} style={{ lineHeight: 16 }} numberOfLines={2}>
            {t.label}
          </T>
        </View>
      ))}
    </View>
  );
}
