import { weekStartOf } from '@dialed/schedule';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import {
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { haptic } from '../../../../lib/haptics';
import { BackLink, Header, Page } from '../../../../ui/Chrome';
import { DisplayTitle } from '../../../../ui/DisplayTitle';
import { T } from '../../../../ui/Text';
import { CARD_GAP, CARD_W, DayCard, Tiles } from '../../../../week/Cards';
import { cardsModel } from '../../../../week/model';
import { Seg } from '../../../../week/Seg';
import { ThemeButton } from '../../../../week/ThemeButton';
import { useSchedule } from '../../../../week/useSchedule';

const STEP = CARD_W + CARD_GAP;

/** Day cards (Flow 03): pushed from a lane, scrolled to that day; snaps one card at a time. */
export default function CardsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ start?: string; day?: string }>();
  const { data, now, c, isLight } = useSchedule();
  const start =
    params.start && /^\d{4}-\d{2}-\d{2}$/.test(params.start)
      ? weekStartOf(params.start)
      : weekStartOf(now.date);
  const day = Math.min(6, Math.max(0, Number(params.day ?? 0) || 0));
  const m = useMemo(
    () => (data ? cardsModel(data.schedule, start, now, { isLight }) : null),
    [data, start, now, isLight],
  );
  const rail = useRef<ScrollViewInstance>(null);
  const index = useRef(day);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/week', params: { start } });

  const onSnap = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / STEP);
    if (i !== index.current) {
      index.current = i;
      haptic.selection(); // selection on each card snap (Flow 03)
    }
  };
  const go = (delta: number) => {
    const i = Math.min(6, Math.max(0, index.current + delta));
    index.current = i;
    rail.current?.scrollTo({ x: i * STEP, animated: true });
  };

  return (
    <Page>
      <Header
        left={<BackLink label={m?.label ?? 'Week'} onPress={back} />}
        right={<ThemeButton />}
      />
      {m ? (
        <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 110 }}>
          <View style={{ paddingHorizontal: 20 }}>
            <DisplayTitle size={64} color={c.hero}>
              {m.title}
            </DisplayTitle>
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <T size={15} weight="600" color={c.muted}>
                Swipe through your days
              </T>
              <Seg value="cards" onChange={back} />
            </View>
          </View>
          <ScrollView
            ref={rail}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={STEP}
            decelerationRate="fast"
            contentOffset={{ x: day * STEP, y: 0 }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 14,
              paddingBottom: 4,
              gap: CARD_GAP,
            }}
            onMomentumScrollEnd={onSnap}
            accessibilityLabel="Days, scroll sideways"
            accessibilityRole="adjustable"
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          >
            {m.cards.map((card, i) => (
              <DayCard key={card.date} card={card} delay={Math.abs(i - day) * 60} />
            ))}
          </ScrollView>
          <Tiles tiles={m.tiles} />
        </ScrollView>
      ) : null}
    </Page>
  );
}
