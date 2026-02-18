// app/_layout.tsx
import '@/utils/logbox';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { TrackingProvider } from '@/context/TrackingContext';
import { NotificationHost } from '@/components/NotificationHost';
import UpdateGate from '@/components/UpdateGate';
import StartupSplash from '@/components/StartupSplash';
import { initPushNotifications } from '@/utils/pushNotifications';
import { captureException, initMonitoring, installGlobalJsErrorHandler } from '@/src/shared/monitoring';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

enableScreens();

function InnerLayout() {
  const { isChecking } = useAuthRedirect();
  useTelegramBackButton();
  if (isChecking) return null;
  return <Slot />;
}

export default function RootLayout() {
  const Root = Platform.OS === 'web' ? View : GestureHandlerRootView;

  const [preloadReady, setPreloadReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    initMonitoring();
    installGlobalJsErrorHandler();
  }, []);

  const handleStartupDone = useCallback(() => {
    setUpdateReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // preload...
        await initPushNotifications();
      } catch (e) {
        captureException(e, { where: 'RootLayout:initPushNotifications' });
        console.warn('App init error:', e);
      } finally {
        if (!cancelled) {
          setPreloadReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const appIsReady = useMemo(() => preloadReady && updateReady, [preloadReady, updateReady]);

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
              <NotificationHost>
                <UpdateGate
                  onStartupDone={handleStartupDone}
                  showCheckingOverlay={false}
                >
                  <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
                  {appIsReady ? <InnerLayout /> : <StartupSplash />}
                </UpdateGate>
              </NotificationHost>
            </TrackingProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </Root>
  );
}
