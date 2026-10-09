// app/_layout.tsx
import '@/utils/logbox';
import { Slot, useSegments, ErrorBoundary as RouterErrorBoundary, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { AuthProvider, AuthContext } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { useStartupOtaUpdate } from '@/hooks/useStartupOtaUpdate';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { TrackingProvider } from '@/context/TrackingContextV2';
import { NotificationViewportProvider } from '@/context/NotificationViewportContext';
import { NotificationHost } from '@/components/NotificationHost';
import UpdateGate from '@/components/UpdateGate';
import StartupLogoLoader from '@/components/StartupLogoLoader';
import { OtaUpdateStatusProvider } from '@/src/shared/ota/OtaUpdateStatusContext';
import { registerOtaBackgroundPrefetchTask } from '@/src/shared/ota/registerOtaBackgroundTask';
import { initPushNotifications } from '@/utils/pushNotifications';
import { captureException, setMonitoringScreen, setMonitoringUser } from '@/src/shared/monitoring';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

enableScreens();

export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => { captureException(props.error, { source: 'router_error_boundary' }); }, [props.error]);
  return <RouterErrorBoundary {...props} />;
}

const nativeBottomSheetProvider = Platform.OS === 'web'
  ? null
  : require('@gorhom/bottom-sheet').BottomSheetModalProvider;

function InnerLayout() {
  const auth = useContext(AuthContext);
  const profile = auth?.profile;
  const segments = useSegments();
  const route = segments.join('/');
  useEffect(() => { if (!auth?.isLoading) void setMonitoringUser(profile?.id); }, [profile?.id, auth?.isLoading]);
  useEffect(() => { setMonitoringScreen(route); }, [route]);
  const { isChecking } = useAuthRedirect();
  useTelegramBackButton();
  if (isChecking) {
    return <StartupLogoLoader />;
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

  const otaUpdate = useStartupOtaUpdate(true);

  useEffect(() => {
    // Notification setup must not hold startup while waiting on native tasks.
    void initPushNotifications().catch((e) => {
      captureException(e, { where: 'RootLayout:initPushNotifications' });
      console.warn('App init error:', e);
    });
  }, []);

  // Binary-update checks run over the mounted app. A mandatory result opens
  // its blocking modal; a slow/offline check must not keep the logo on screen.
  const appIsReady = otaUpdate.ready;

  useEffect(() => {
    if (!appIsReady) return;
    void registerOtaBackgroundPrefetchTask().catch((error) => {
      captureException(error, { where: 'RootLayout:registerOtaBackgroundPrefetchTask' });
      console.warn('[ota] background prefetch registration failed', error);
    });
  }, [appIsReady]);

  // Hand over once the matching React surface is laid out, so progress is visible
  // while initialization continues instead of being covered by the static logo.
  const handleRootLayout = useCallback(() => {
    if (Platform.OS !== 'web') {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

  return (
    <Root style={{ flex: 1 }} onLayout={handleRootLayout}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <MaybeBottomSheetProvider>
            <ThemeProvider>
              <AuthProvider>
                <TrackingProvider>
                  <NotificationViewportProvider>
                    <OtaUpdateStatusProvider enabled={appIsReady}>
                      <NotificationHost>
                        <UpdateGate>
                          <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
                          {appIsReady ? (
                            <InnerLayout />
                          ) : (
                            <StartupLogoLoader stage={otaUpdate.phase === 'applying' ? 'applying' : 'logo'} />
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
