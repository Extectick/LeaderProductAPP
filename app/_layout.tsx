// app/_layout.tsx
import '@/utils/logbox';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { useStartupOtaUpdate } from '@/hooks/useStartupOtaUpdate';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { TrackingProvider } from '@/context/TrackingContext';
import { NotificationViewportProvider } from '@/context/NotificationViewportContext';
import { NotificationHost } from '@/components/NotificationHost';
import UpdateGate from '@/components/UpdateGate';
import StartupSplash from '@/components/StartupSplash';
import StartupLogoLoader from '@/components/StartupLogoLoader';
import { OtaUpdateStatusProvider } from '@/src/shared/ota/OtaUpdateStatusContext';
import { registerOtaBackgroundPrefetchTask } from '@/src/shared/ota/registerOtaBackgroundTask';
import { initPushNotifications } from '@/utils/pushNotifications';
import { captureException, initMonitoring, installGlobalJsErrorHandler } from '@/src/shared/monitoring';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

enableScreens();

const nativeBottomSheetProvider = Platform.OS === 'web'
  ? null
  : require('@gorhom/bottom-sheet').BottomSheetModalProvider;
const hideReactStartupLoader = Platform.OS === 'android' && !__DEV__;

function EmptyStartupSurface() {
  return <StartupLogoLoader />;
}

function InnerLayout() {
  const { isChecking } = useAuthRedirect();
  useTelegramBackButton();
  if (isChecking) {
    if (hideReactStartupLoader) {
      return <EmptyStartupSurface />;
    }
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
  const MaybeBottomSheetProvider = Platform.OS === 'web' ? React.Fragment : nativeBottomSheetProvider;
  const paperTheme = useMemo(() => ({
    ...MD3LightTheme,
    roundness: 16,
    colors: {
      ...MD3LightTheme.colors,
      primary: '#2563EB',
      secondary: '#0F172A',
      surface: '#FFFFFF',
      surfaceVariant: '#F8FAFC',
      background: '#F8FAFC',
      error: '#DC2626',
    },
  }), []);

  const [preloadReady, setPreloadReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [minSplashReady, setMinSplashReady] = useState(hideReactStartupLoader);
  const otaUpdate = useStartupOtaUpdate(preloadReady);

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
    if (hideReactStartupLoader) return;
    const timer = setTimeout(() => {
      setMinSplashReady(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const appIsReady = useMemo(
    () => preloadReady && otaUpdate.ready && updateReady && minSplashReady,
    [minSplashReady, otaUpdate.ready, preloadReady, updateReady]
  );

  useEffect(() => {
    if (!appIsReady) return;
    void registerOtaBackgroundPrefetchTask().catch((error) => {
      captureException(error, { where: 'RootLayout:registerOtaBackgroundPrefetchTask' });
      console.warn('[ota] background prefetch registration failed', error);
    });
  }, [appIsReady]);

  const startupSplash = useMemo(() => {
    if (!preloadReady) {
      return {
        statusText: 'Инициализация сервисов',
        hintText: 'Подключаем уведомления и системные модули.',
        progress: null,
      };
    }
    if (!otaUpdate.ready) {
      return {
        statusText: otaUpdate.statusText,
        hintText: otaUpdate.hintText,
        progress: otaUpdate.progress,
      };
    }
    if (!updateReady) {
      return {
        statusText: 'Проверка обновлений',
        hintText: 'Проверяем актуальность версии приложения.',
        progress: null,
      };
    }
    if (!minSplashReady) {
      return {
        statusText: 'Подготовка интерфейса',
        hintText: 'Формируем стартовый экран.',
        progress: null,
      };
    }
    return {
      statusText: 'Запуск приложения',
      hintText: 'Подготавливаем рабочее пространство.',
      progress: null,
    };
  }, [minSplashReady, otaUpdate.hintText, otaUpdate.progress, otaUpdate.ready, otaUpdate.statusText, preloadReady, updateReady]);

  // Надёжно прячем splash как только инициализация завершена
  useEffect(() => {
    if (Platform.OS !== 'web' && appIsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady]);

  return (
    <Root style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <MaybeBottomSheetProvider>
            <ThemeProvider>
              <AuthProvider>
                <TrackingProvider>
                  <NotificationViewportProvider>
                    <OtaUpdateStatusProvider enabled={appIsReady}>
                      <NotificationHost>
                        <UpdateGate
                          onStartupDone={handleStartupDone}
                          showCheckingOverlay={false}
                        >
                          <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
                          {appIsReady ? (
                            <InnerLayout />
                          ) : hideReactStartupLoader ? (
                            <EmptyStartupSurface />
                          ) : (
                            <StartupSplash
                              statusText={startupSplash.statusText}
                              hintText={startupSplash.hintText}
                              progress={startupSplash.progress}
                            />
                          )}
                        </UpdateGate>
                      </NotificationHost>
                    </OtaUpdateStatusProvider>
                  </NotificationViewportProvider>
                </TrackingProvider>
              </AuthProvider>
            </ThemeProvider>
          </MaybeBottomSheetProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </Root>
  );
}
