import { useContext, useEffect, useMemo } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';
import { AuthContext, isValidProfile } from '@/context/AuthContext';

const ROUTES = {
  AUTH: '/(auth)/AuthScreen',
  PROFILE: '/ProfileSelectionScreen',
  HOME: '/home',
} as const;

type Gate = 'guest' | 'needsProfile' | 'ready';

export function useAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
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

    // gate === 'ready' — не трогаем текущий маршрут (сохраняем страницу при перезагрузке)
  }, [isLoading, gate, router, pathname]);

  // Показываем, можно ли уже рендерить детей
  return { isChecking: isLoading };
}
