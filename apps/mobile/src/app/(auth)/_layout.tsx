import { Stack } from 'expo-router';

// Pages animate themselves (Design_Identity "Push page": 18 pt slide + fade), so the native transition is off.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none' }} />;
}
