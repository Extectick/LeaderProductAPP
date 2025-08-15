// app/_layout.tsx
import { Slot } from 'expo-router';
import React from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';

// ВАЖНО: не импортируем 'react-native-gesture-handler' статически на web.
// Подключаем его только на native через require:
let GestureHandlerRootView: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNGH = require('react-native-gesture-handler');
  GestureHandlerRootView = RNGH.GestureHandlerRootView;
}

enableScreens();

function InnerLayout() {
  useAuthRedirect(); // проверка авторизации и профиля
  return <Slot />;   // рендер вложенных маршрутов
}

export default function RootLayout() {
  // На web — обычный View; на native — GestureHandlerRootView
  const Root = GestureHandlerRootView ?? View;

  return (
    <Root style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
          <InnerLayout />
        </AuthProvider>
      </ThemeProvider>
    </Root>
  );
}
