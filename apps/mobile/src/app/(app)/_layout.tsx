import { Stack } from 'expo-router';
import { BlocksUiProvider } from '../../blocks/BlocksUi';
import { useTheme } from '../../theme/theme';

export default function AppLayout() {
  const { c } = useTheme();
  // Native sheets (Design_Identity platform deltas): grabber, drag to dismiss, stacked over each other.
  const sheet = {
    presentation: 'formSheet',
    animation: 'slide_from_bottom',
    sheetAllowedDetents: 'fitToContents',
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    contentStyle: { backgroundColor: c.sheetSurf },
  } as const;
  // Form sheets keep one tall detent (prototype: up to 768 of 824 pt, the Day still visible above) so the
  // keyboard never resizes them under the finger; their content scrolls (SheetScroll pads the off-screen part).
  const form = { ...sheet, sheetAllowedDetents: [0.93] };
  return (
    <BlocksUiProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="(tabs)" />
        {/* Account: native sheet from the Day avatar (Flow 01, Design_Identity platform deltas). */}
        <Stack.Screen name="account" options={sheet} />
        {/* Flow 04: Add, Edit, and the sheets stacked over them. */}
        <Stack.Screen name="add" options={form} />
        <Stack.Screen name="edit" options={form} />
        <Stack.Screen name="category" options={form} />
        <Stack.Screen name="nudge" options={sheet} />
        <Stack.Screen name="reminders-help" options={sheet} />
      </Stack>
    </BlocksUiProvider>
  );
}
