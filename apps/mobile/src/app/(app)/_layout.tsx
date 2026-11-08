import { Stack } from 'expo-router';
import { useApp } from '../../AppProvider';
import { BlocksUiProvider } from '../../blocks/BlocksUi';
import { usePlanNotifications, usePlanReadyPolling } from '../../plan/notifications';
import { RoutinesUiProvider } from '../../routines/RoutinesUi';
import { useTheme } from '../../theme/theme';
import { useToast } from '../../ui/Toast';

export default function AppLayout() {
  const { c } = useTheme();
  const { planApi } = useApp();
  const toast = useToast();
  usePlanNotifications(planApi, toast);
  usePlanReadyPolling(planApi);
  // Native sheets (Design_Identity platform deltas): grabber, drag to dismiss, stacked over each other.
  const sheet = {
    presentation: 'formSheet',
    animation: 'slide_from_bottom',
    sheetAllowedDetents: 'fitToContents',
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    contentStyle: { backgroundColor: c.sheetSurf },
  } as const;
  // Add, Edit and Category open at the full-height (large) detent (owner review of v11, D-47) so the keyboard and
  // the time wheel never squash them; their content scrolls (SheetScroll pads the off-screen part).
  const form = { ...sheet, sheetAllowedDetents: [1.0] };
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
          {/* Flow 09: Settings pages pushed from the Account sheet; Edit category (large) with Merge over it. */}
          <Stack.Screen name="settings" options={page} />
          <Stack.Screen name="categories" options={page} />
          <Stack.Screen name="notifications" options={page} />
          {/* Flow 08: Customize (lock-screen mode, line, widget guide) is a page, not a sheet (D-81). */}
          <Stack.Screen name="customize" options={page} />
          <Stack.Screen name="category-edit" options={form} />
          <Stack.Screen name="category-merge" options={form} />
          {/* Flow 06: Plan with AI (pushed pages, deep-linkable). */}
          <Stack.Screen name="plan/index" options={page} />
          <Stack.Screen name="plan/[id]/index" options={page} />
          <Stack.Screen name="plan/[id]/drafting" options={page} />
          <Stack.Screen name="plan/[id]/question" options={page} />
          <Stack.Screen name="plan/[id]/review" options={page} />
          <Stack.Screen name="plan/[id]/error" options={page} />
          <Stack.Screen name="plan/[id]/done" options={page} />
          {/* Flow 06: AI assistant settings. */}
          <Stack.Screen name="ai-assistant" options={page} />
          {/* Flow 02: Timetable and calendar import. */}
          <Stack.Screen name="import/reading" options={page} />
          <Stack.Screen name="import/found" options={page} />
          <Stack.Screen name="import/calendars" options={page} />
        </Stack>
      </RoutinesUiProvider>
    </BlocksUiProvider>
  );
}
