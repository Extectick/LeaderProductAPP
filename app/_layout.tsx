// app/_layout.tsx
import { Slot, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';

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
    console.error('[GlobalError] JS', isFatal ? 'Fatal' : 'Non-fatal', error?.stack || String(error));
    defaultHandler && defaultHandler(error, isFatal);
  });
} catch {}

function InnerLayout() {
  const { isChecking } = useAuthRedirect();
  if (isChecking) return null; // Splash останется видимым
  return <Slot />;
}

export default function RootLayout() {
  const Root = GestureHandlerRootView ?? View;

  const [appIsReady, setAppIsReady] = useState(false);
  const [hasLayout, setHasLayout] = useState(false);

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

  useEffect(() => {
    if (appIsReady && hasLayout && Platform.OS !== 'web') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady, hasLayout]);

  const onLayoutRootView = useCallback(() => {
    setHasLayout(true);
  }, []);

  return (
    <Root style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
            {/* ⬇️ ВАЖНО: используем наш гейт вместо <Slot /> */}
            <InnerLayout />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </Root>
  );
}
