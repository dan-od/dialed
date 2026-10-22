import { Stack } from 'expo-router';
import { BlocksUiProvider } from '../../blocks/BlocksUi';
import { RoutinesUiProvider } from '../../routines/RoutinesUi';
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
  const page = { animation: 'slide_from_right', contentStyle: { backgroundColor: c.bg } } as const;
  return (
    <BlocksUiProvider>
      <RoutinesUiProvider>
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
          {/* Flow 05: pages pushed from Month (320 ms slide), editor sheets over the editor. */}
          <Stack.Screen name="routines" options={page} />
          <Stack.Screen name="routine/[id]" options={page} />
          <Stack.Screen name="terms" options={page} />
          <Stack.Screen name="routine-save" options={sheet} />
          <Stack.Screen name="routine-copy" options={sheet} />
          <Stack.Screen name="name-term" options={sheet} />
        </Stack>
      </RoutinesUiProvider>
    </BlocksUiProvider>
  );
}
