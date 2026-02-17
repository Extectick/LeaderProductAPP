import { useContext, useEffect, useMemo } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { getProfileGate } from '@/utils/profileGate';
import { isMaxMiniAppLaunch } from '@/utils/maxAuthService';
import { isTelegramMiniAppLaunch } from '@/utils/telegramAuthService';

const ROUTES = {
  AUTH: '/(auth)/AuthScreen',
  TELEGRAM: '/(auth)/telegram',
  MAX: '/(auth)/max',
  PROFILE: '/ProfileSelectionScreen',
  PENDING: '/(auth)/ProfilePendingScreen',
  BLOCKED: '/(auth)/ProfileBlockedScreen',
  HOME: '/home',
} as const;

type Gate = 'guest' | 'needsProfile' | 'pending' | 'blocked' | 'ready';

function normalizeRoutePath(path: string | null | undefined): string {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  const noGroups = raw.replace(/\/\([^/]+\)/g, '');
  const compact = noGroups.replace(/\/+/g, '/');
  if (compact.length > 1 && compact.endsWith('/')) return compact.slice(0, -1);
  return compact || '/';
}

export function useAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');

  const { isLoading, isAuthenticated, profile } = auth;

  const gate: Gate = useMemo(() => {
    if (!isAuthenticated) return 'guest';
    const state = getProfileGate(profile);
    if (state === 'pending') return 'pending';
    if (state === 'blocked') return 'blocked';
    if (state === 'none') return 'needsProfile';
    return 'ready';
  }, [isAuthenticated, profile]);

  useEffect(() => {
    if (isLoading) return;
    const currentPath = normalizeRoutePath(pathname);

    if (gate === 'guest') {
      const guestTarget = isMaxMiniAppLaunch()
        ? ROUTES.MAX
        : isTelegramMiniAppLaunch()
        ? ROUTES.TELEGRAM
        : ROUTES.AUTH;
      const targetPath = normalizeRoutePath(guestTarget);
      const authPaths = new Set([
        normalizeRoutePath(ROUTES.AUTH),
        normalizeRoutePath(ROUTES.TELEGRAM),
        normalizeRoutePath(ROUTES.MAX),
      ]);
      const inAuthStack = authPaths.has(currentPath);

      if (!inAuthStack || currentPath !== targetPath) {
        router.replace(guestTarget as Href);
      }
      return;
    }

    if (gate === 'needsProfile') {
      if (currentPath !== normalizeRoutePath(ROUTES.PROFILE)) {
        router.replace(ROUTES.PROFILE as Href);
      }
      return;
    }

    if (gate === 'pending') {
      if (currentPath !== normalizeRoutePath(ROUTES.PENDING)) {
        router.replace(ROUTES.PENDING as Href);
      }
      return;
    }

    if (gate === 'blocked') {
      if (currentPath !== normalizeRoutePath(ROUTES.BLOCKED)) {
        router.replace(ROUTES.BLOCKED as Href);
      }
      return;
    }

    // gate === 'ready'
  }, [isLoading, gate, router, pathname]);

  return { isChecking: isLoading };
}
