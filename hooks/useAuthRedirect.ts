import { useContext, useEffect, useMemo } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { getProfileGate } from '@/utils/profileGate';

const ROUTES = {
  AUTH: '/(auth)/AuthScreen',
  PROFILE: '/ProfileSelectionScreen',
  PENDING: '/(auth)/ProfilePendingScreen',
  BLOCKED: '/(auth)/ProfileBlockedScreen',
  HOME: '/home',
} as const;

type Gate = 'guest' | 'needsProfile' | 'pending' | 'blocked' | 'ready';

export function useAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');

  const { isLoading, isAuthenticated, profile } = auth;

  // Это хук и он всегда вызывается – порядок стабилен
  const gate: Gate = useMemo(() => {
    if (!isAuthenticated) return 'guest';
    const state = getProfileGate(profile);
    if (state === 'pending') return 'pending';
    if (state === 'blocked') return 'blocked';
    if (state === 'none') return 'needsProfile';
    return 'ready';
  }, [isAuthenticated, profile]);

  // Тоже хук – всегда вызывается; логика внутри условия
  useEffect(() => {
    if (isLoading) return;

    // Если пользователь не авторизован, держим его в auth-стеке
    if (gate === 'guest') {
      if (!pathname || !pathname.startsWith('/(auth)')) {
        router.replace(ROUTES.AUTH as Href);
      }
      return;
    }

    // Если нужен профиль — отправляем только на экран профиля
    if (gate === 'needsProfile') {
      if (pathname !== ROUTES.PROFILE) {
        router.replace(ROUTES.PROFILE as Href);
      }
      return;
    }

    if (gate === 'pending') {
      if (pathname !== ROUTES.PENDING) {
        router.replace(ROUTES.PENDING as Href);
      }
      return;
    }

    if (gate === 'blocked') {
      if (pathname !== ROUTES.BLOCKED) {
        router.replace(ROUTES.BLOCKED as Href);
      }
      return;
    }

    // gate === 'ready' — не трогаем текущий маршрут (сохраняем страницу при перезагрузке)
  }, [isLoading, gate, router, pathname]);

  // Показываем, можно ли уже рендерить детей
  return { isChecking: isLoading };
}
