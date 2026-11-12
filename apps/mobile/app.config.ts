import type { ExpoConfig } from 'expo/config';

// APP_NAME is the single source for the product name (D-11). Bundle ID chosen by the owner on 2026-10-21
// (CLIENT_QUESTIONS #7). The App Group is fixed (D-77): the widget's Info.plist names the same group.
const APP_NAME = process.env.APP_NAME ?? 'Dialed';
const BUNDLE_ID = process.env.DIALED_BUNDLE_ID ?? 'me.okoro.dialed';
const TEAM_TIER = process.env.APPLE_TEAM_TIER ?? 'personal';
const APP_GROUP = 'group.me.okoro.dialed';
// Baked in at build time: expo-constants evaluates this file in the Xcode build phase, where Xcode sets
// CONFIGURATION. Release builds (standalone, JS embedded) default to the home lab, so an Xcode-GUI build that
// doesn't inherit the shell's DIALED_API_URL still works on cellular. DIALED_API_URL overrides either default.
const PROD_API_URL = 'https://dialed.okoro.me';
const API_URL =
  process.env.DIALED_API_URL ??
  (process.env.CONFIGURATION === 'Release' ? PROD_API_URL : 'http://localhost:8080');

const config: ExpoConfig = {
  name: APP_NAME,
  slug: 'dialed',
  scheme: 'dialed',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/brand/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Flow 08: the snapshot file the widgets read (modules/dialed-native SnapshotStore).
      DialedAppGroup: APP_GROUP,
      // Live Activities for work blocks (D-07); updates come at block boundaries only.
      NSSupportsLiveActivities: true,
      NSSupportsLiveActivitiesFrequentUpdates: false,
    },
    entitlements: { 'com.apple.security.application-groups': [APP_GROUP] },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#FF5A1F', image: './assets/brand/splash-mark.png', imageWidth: 132 },
    ],
    'expo-sqlite',
    // Flow 06 (D-39): iOS wakes Dialed now and then to check for a plan the server retried in the background.
    'expo-background-task',
    'expo-secure-store',
    'expo-font',
    // Flow 04 native time pickers (5-minute interval).
    '@react-native-community/datetimepicker',
    // Local reminders (Flow 04 per-block alerts). A Personal Team has no APNs entitlement (D-39, §13), so the
    // aps-environment entitlement is only added on the paid tier.
    ['expo-notifications', { enableRemoteNotifications: TEAM_TIER === 'paid' }],
    // Flow 08 widget extension (targets/widgets): WidgetKit + ActivityKit, App Group shared with the app.
    '@bacons/apple-targets',
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    appName: APP_NAME,
    // Debug: the Simulator reaches the Mac's API at localhost (ATS allows local networking). Release: home lab.
    apiBaseUrl: API_URL,
    // D-39: free Apple account → no Sign in with Apple, no APNs, no universal links.
    appleTeamTier: TEAM_TIER,
    // D-35 screens awaiting a flow-prototype approval stay behind this flag (off by default).
    features: { d35Screens: process.env.DIALED_FEATURE_D35 === 'true' },
  },
};

export default config;
