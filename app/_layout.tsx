// app/_layout.tsx
import { Slot } from 'expo-router';
import React from 'react';
import { Platform, StatusBar, View } from 'react-native';
import { enableScreens } from 'react-native-screens';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';

let GestureHandlerRootView: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RNGH = require('react-native-gesture-handler');
  GestureHandlerRootView = RNGH.GestureHandlerRootView;
}

enableScreens();

export default function RootLayout() {
  const Root = GestureHandlerRootView ?? View;
  return (
    <Root style={{ flex: 1 }}>
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
