// app/_layout.tsx
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';

// Не скрывать сплэш автоматически — сделаем это вручную, когда всё готово
if (Platform.OS !== 'web') {
  // на web SplashScreen ничего не делает, но на всякий случай ограничим
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

let GestureHandlerRootView: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNGH = require('react-native-gesture-handler');
  GestureHandlerRootView = RNGH.GestureHandlerRootView;
}

enableScreens();

export default function RootLayout() {
  const Root = GestureHandlerRootView ?? View;

  const [appIsReady, setAppIsReady] = useState(false);
  const [hasLayout, setHasLayout] = useState(false); // <- флаг, что корень уже отрисован

  useEffect(() => {
    (async () => {
      try {
        // TODO: инициализация:
        // await Font.loadAsync({ ... });
        // await restoreSession();
        // await warmup();
      } catch (e) {
        console.warn('App init error:', e);
      } finally {
        setAppIsReady(true);
      }
    })();
  }, []);

  // Вызываем hideAsync, когда ОБА условия стали истинными
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
      <ThemeProvider>
        <AuthProvider>
          <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
          {/* ВАЖНО: всегда рендерим Slot на первом рендере */}
          <Slot />
        </AuthProvider>
      </ThemeProvider>
    </Root>
  );
}
