// Native modules that have no JS fallback in Jest.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
// Reanimated 4 Jest setup (docs: Testing with Jest) — resolver in package.json "jest", then setUpTests().
require('react-native-reanimated').setUpTests();
