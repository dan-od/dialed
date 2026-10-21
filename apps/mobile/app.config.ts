import type { ExpoConfig } from 'expo/config';

// APP_NAME is the single source for the product name (D-11). Bundle ID stays a placeholder until the owner
// picks one (CLIENT_QUESTIONS #7); underscores aren't valid in bundle IDs, hence "replace-owner".
const APP_NAME = process.env.APP_NAME ?? 'Dialed';
const BUNDLE_ID = process.env.DIALED_BUNDLE_ID ?? 'com.replace-owner.dialed';

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
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: '#FF5A1F', image: './assets/brand/splash-mark.png', imageWidth: 132 },
    ],
    'expo-sqlite',
    'expo-secure-store',
    'expo-font',
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    appName: APP_NAME,
    // Simulator reaches the Mac's API at localhost (ATS allows local networking in dev builds).
    apiBaseUrl: process.env.DIALED_API_URL ?? 'http://localhost:8080',
    // D-39: free Apple account → no Sign in with Apple, no APNs, no universal links.
    appleTeamTier: process.env.APPLE_TEAM_TIER ?? 'personal',
    // D-35 screens awaiting a flow-prototype approval stay behind this flag (off by default).
    features: { d35Screens: process.env.DIALED_FEATURE_D35 === 'true' },
  },
};

export default config;
