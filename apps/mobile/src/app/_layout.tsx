import { Anton_400Regular, useFonts } from '@expo-google-fonts/anton';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../AppProvider';
import { useTheme } from '../theme/theme';
import { LaunchSplash } from '../ui/LaunchSplash';
import { ToastHost, ToastProvider } from '../ui/Toast';

void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { session } = useApp();
  const { c, isLight } = useTheme();
  const [splashDone, setSplashDone] = useState(false);
  const onDone = useCallback(() => setSplashDone(true), []);
  useEffect(() => {
    void SplashScreen.hideAsync(); // native splash (flat orange + mark) hands over to the animated one
  }, []);
  const signedIn = session.status === 'signedIn';
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={!splashDone ? 'dark' : isLight ? 'dark' : 'light'} />
      {session.status !== 'loading' ? (
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'none',
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      ) : null}
      <ToastHost />
      {!splashDone || session.status === 'loading' ? <LaunchSplash onDone={onDone} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Anton_400Regular });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AppProvider>
          <RootStack />
        </AppProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
