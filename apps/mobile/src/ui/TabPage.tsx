import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';

/**
 * Root tab page: 120 ms fade between tabs (Flow 03) and the page's entrance plays once per visit
 * (remounted on focus). Replaces the tab navigator's own fade, which used core Animated's native driver
 * and logged "Sending `onAnimatedValueUpdate` with no listeners registered."
 */
export function TabPage({ children }: { children: ReactNode }) {
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((v) => v + 1), []));
  return (
    <Animated.View key={visit} entering={FadeIn.duration(120)} style={{ flex: 1 }}>
      {children}
    </Animated.View>
  );
}
