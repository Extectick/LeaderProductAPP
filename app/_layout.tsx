// app/_layout.tsx
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { KeyboardProvider } from 'react-native-keyboard-controller';

// Сплэш контролируем вручную на native
if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

// GestureHandlerRootView — только на native
let GestureHandlerRootView: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNGH = require('react-native-gesture-handler');
  GestureHandlerRootView = RNGH.GestureHandlerRootView;
}

enableScreens();

// --- Глобальный перехват JS-ошибок: попадут в ReactNativeJS в logcat ---
try {
  // @ts-ignore
  const defaultHandler = global.ErrorUtils?.getGlobalHandler?.();
  // @ts-ignore
  global.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    console.error('[GlobalError] JS', isFatal ? 'Fatal' : 'Non-fatal', error?.stack || String(error));
    defaultHandler && defaultHandler(error, isFatal);
  });
} catch {}

export default function RootLayout() {
  const Root = GestureHandlerRootView ?? View;

  const [appIsReady, setAppIsReady] = useState(false);
  const [hasLayout, setHasLayout] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // TODO: preload (шрифты/ресурсы/сессия)
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
          <Slot />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>

</Root>
  );
}
