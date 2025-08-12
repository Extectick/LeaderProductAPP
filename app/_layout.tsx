// app/_layout.tsx
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { Slot } from 'expo-router';
import React from 'react';
import { StatusBar } from 'react-native';
import 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';

enableScreens();

function InnerLayout() {
  useAuthRedirect(); // проверка авторизации и профиля
  return <Slot />;   // рендер вложенных маршрутов
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <InnerLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}
