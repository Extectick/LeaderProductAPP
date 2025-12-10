import { useContext, useEffect, useMemo } from 'react';
import { useRouter, type Href } from 'expo-router';
import { AuthContext, isValidProfile } from '@/context/AuthContext';

const ROUTES = {
  AUTH: '/(auth)/AuthScreen',
  PROFILE: '/ProfileSelectionScreen',
  HOME: '/home',
} as const;

type Gate = 'guest' | 'needsProfile' | 'ready';

export function useAuthRedirect() {
  const router = useRouter();
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');

  const { isLoading, isAuthenticated, profile } = auth;

  // Это хук и он всегда вызывается – порядок стабилен
  const gate: Gate = useMemo(() => {
    if (!isAuthenticated) return 'guest';
    return isValidProfile(profile) ? 'ready' : 'needsProfile';
  }, [isAuthenticated, profile]);

  // Тоже хук – всегда вызывается; логика внутри условия
  useEffect(() => {
    if (isLoading) return;

    const href: Href =
      gate === 'guest'
        ? (ROUTES.AUTH as Href)
        : gate === 'needsProfile'
        ? (ROUTES.PROFILE as Href)
        : (ROUTES.HOME as Href);

    router.replace(href);
  }, [isLoading, gate, router]);

  // Показываем, можно ли уже рендерить детей
  return { isChecking: isLoading };
}
