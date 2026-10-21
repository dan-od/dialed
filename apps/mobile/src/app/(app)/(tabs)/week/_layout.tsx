import { Stack } from 'expo-router';

// Week lanes and Day cards share the Week tab, so the floating nav stays (Week active) on Cards.
export default function WeekLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
