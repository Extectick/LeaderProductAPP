// app/index.tsx
import ThemedLoader from '@/components/ui/ThemedLoader';
import { useAuthGate } from '@/hooks/useAuthRedirect';
import { Redirect, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

const ROUTES = {
  AUTH: '/(auth)/AuthScreen',
  PROFILE: '/ProfileSelectionScreen', // поменяй, если он в группе
  HOME: '/home',
} as const;

function Loader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export default function Index() {
  const { isLoading, isAuthenticated, hasValidProfile } = useAuthGate();

  // Гость — отправляем на авторизацию, не ждём загрузки
  if (!isAuthenticated) return <Redirect href={ROUTES.AUTH as Href} />;

  // Авторизован, но что-то ещё догружается (например профиль) — краткий лоадер
  if (isLoading) return <ThemedLoader  />;

  // Профиль не завершён — на выбор профиля
  if (!hasValidProfile) return <Redirect href={ROUTES.PROFILE as Href} />;

  // Полностью готов — в home
  return <Redirect href={ROUTES.HOME as Href} />;
}
