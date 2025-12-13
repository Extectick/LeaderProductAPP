// app/_layout.tsx
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { TrackingProvider } from '@/context/TrackingContext';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

let GestureHandlerRootView: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  const RNGH = require('react-native-gesture-handler');
  GestureHandlerRootView = RNGH.GestureHandlerRootView;
}

enableScreens();

try {
  // @ts-ignore
  const defaultHandler = global.ErrorUtils?.getGlobalHandler?.();
  // @ts-ignore
  global.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    console.error(
      '[GlobalError] JS',
      isFatal ? 'Fatal' : 'Non-fatal',
      error?.stack || String(error)
    );
    defaultHandler && defaultHandler(error, isFatal);
  });
} catch {}

function InnerLayout() {
  const { isChecking } = useAuthRedirect();
  if (isChecking) return null;
  return <Slot />;
}

export default function RootLayout() {
  const Root = GestureHandlerRootView ?? View;

  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // preload...
      } catch (e) {
        console.warn('App init error:', e);
      } finally {
        setAppIsReady(true);
      }
    })();
  }, []);

  // Надёжно прячем splash как только инициализация завершена
  useEffect(() => {
    if (Platform.OS !== 'web' && appIsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady]);

  return (
    <Root style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <TrackingProvider>
              <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
              <InnerLayout />
            </TrackingProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </Root>
  );
}
