// app/_layout.tsx
import '@/utils/logbox';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { TrackingProvider } from '@/context/TrackingContext';
import { NotificationHost } from '@/components/NotificationHost';
import UpdateGate from '@/components/UpdateGate';
import StartupSplash from '@/components/StartupSplash';
import { initPushNotifications } from '@/utils/pushNotifications';

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

  const [preloadReady, setPreloadReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // preload...
        await initPushNotifications();
      } catch (e) {
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
                  onStartupDone={() => {
                    setUpdateReady(true);
                  }}
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
