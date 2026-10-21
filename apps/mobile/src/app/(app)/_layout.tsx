import { Stack } from 'expo-router';
import { useTheme } from '../../theme/theme';

export default function AppLayout() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Screen name="(tabs)" />
      {/* Account: native sheet from the Day avatar (Flow 01, Design_Identity platform deltas). */}
      <Stack.Screen
        name="account"
        options={{
          presentation: 'formSheet',
          animation: 'slide_from_bottom',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          contentStyle: { backgroundColor: c.sheetSurf },
        }}
      />
    </Stack>
  );
}
