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
import { NotificationViewportProvider } from '@/context/NotificationViewportContext';
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
  if (isChecking) {
    return (
      <StartupSplash
        statusText="Проверка авторизации"
        hintText="Проверяем сессию и загружаем доступные разделы."
      />
    );
  }
  return <Slot />;
}

export default function RootLayout() {
  const Root = Platform.OS === 'web' ? View : GestureHandlerRootView;

  const [preloadReady, setPreloadReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [minSplashReady, setMinSplashReady] = useState(false);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinSplashReady(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const appIsReady = useMemo(
    () => preloadReady && updateReady && minSplashReady,
    [minSplashReady, preloadReady, updateReady]
  );

  const startupSplash = useMemo(() => {
    if (!preloadReady) {
      return {
        statusText: 'Инициализация сервисов',
        hintText: 'Подключаем уведомления и системные модули.',
      };
    }
    if (!updateReady) {
      return {
        statusText: 'Проверка обновлений',
        hintText: 'Проверяем актуальность версии приложения.',
      };
    }
    if (!minSplashReady) {
      return {
        statusText: 'Подготовка интерфейса',
        hintText: 'Формируем стартовый экран.',
      };
    }
    return {
      statusText: 'Запуск приложения',
      hintText: 'Подготавливаем рабочее пространство.',
    };
  }, [minSplashReady, preloadReady, updateReady]);

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
              <NotificationViewportProvider>
                <NotificationHost>
                  <UpdateGate
                    onStartupDone={handleStartupDone}
                    showCheckingOverlay={false}
                  >
                    <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
                    {appIsReady ? (
                      <InnerLayout />
                    ) : (
                      <StartupSplash
                        statusText={startupSplash.statusText}
                        hintText={startupSplash.hintText}
                      />
                    )}
                  </UpdateGate>
                </NotificationHost>
              </NotificationViewportProvider>
            </TrackingProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </Root>
  );
}
