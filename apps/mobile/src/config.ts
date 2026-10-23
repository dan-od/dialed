import Constants from 'expo-constants';

interface Extra {
  appName?: string;
  apiBaseUrl?: string;
  appleTeamTier?: 'personal' | 'paid';
  features?: { d35Screens?: boolean };
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** Every user-facing product name reads this (D-11). */
export const APP_NAME = extra.appName ?? 'Dialed';
export const API_BASE_URL = extra.apiBaseUrl ?? 'http://localhost:8080';
export const APPLE_TEAM_TIER = extra.appleTeamTier ?? 'personal';
/** Sign in with Apple needs the paid program (D-39 / BACKEND_SETUP §13). */
export const APPLE_SIGN_IN_ENABLED = APPLE_TEAM_TIER === 'paid';
/** D-35 surfaces awaiting flow-prototype approval (New password, Name your term, …). Off until approved. */
// EXPO_PUBLIC_* is inlined by Metro when it bundles (dev server or release export); Constants.expoConfig is baked into
// bare builds at build time, so it can't be switched by restarting Metro.
export const FEATURES = {
  d35Screens: process.env.EXPO_PUBLIC_FEATURE_D35 === 'true' || extra.features?.d35Screens === true,
};

/** The chosen AI's display name (D-05). Settings (Flow 06/09) will make this dynamic. */
export const aiName = () => 'Claude';
