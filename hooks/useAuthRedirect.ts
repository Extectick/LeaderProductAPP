// hooks/useAuthRedirect.ts
import { AuthContext } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { useContext, useEffect } from 'react';

export const useAuthRedirect = () => {
  const auth = useContext(AuthContext);
  const router = useRouter();

  if (!auth) throw new Error('AuthContext is required');

  const { isLoading, isAuthenticated, profile } = auth;

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/AuthScreen');
    } else if (isAuthenticated && !profile) {
      router.replace('/ProfileSelectionScreen');
    } else if (isAuthenticated && profile) {
      router.replace('/HomeScreen');
    }
  }, [isLoading, isAuthenticated, profile]);
};
