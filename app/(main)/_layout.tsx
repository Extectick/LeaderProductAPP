import { AuthContext } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import React, { useContext, useEffect } from 'react';

export default function LayoutWithAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const auth = useContext(AuthContext);

  if (!auth) throw new Error('AuthContext is required');

  const { isLoading, isAuthenticated, profile } = auth;

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace('/(auth)/AuthScreen');
      } else if (isAuthenticated && !profile) {
        router.replace('/(main)/ProfileSelectionScreen');
      }
    }
  }, [isLoading, isAuthenticated, profile, router]);

  if (isLoading) {
    return null; // или <LoadingIndicator />
  }

  if (!isAuthenticated || !profile) {
    // Пока редирект идёт - не рендерим детей
    return null;
  }

  return <>{children}</>;
}
