import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { normalizeRoutePath } from '@/src/shared/lib/routePath';
import { getProfileGate } from '@/utils/profileGate';
import { isMaxMiniAppLaunch } from '@/utils/maxAuthService';
import { isTelegramMiniAppLaunch } from '@/utils/telegramAuthService';
import { acceptStartupHelpNotification, helpPushNavigationTarget, readStartupHelpNotification, type StartupHelpNotification } from '@/utils/pushNotifications';

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

export function useAuthRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ticketId?: string; messageId?: string; eventId?: string}>();
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is required');

  const { isLoading, isAuthenticated, profile } = auth;
  const [startup, setStartup] = useState<StartupHelpNotification | null | undefined>(undefined);
  const [startupHandled, setStartupHandled] = useState(false);
  const requestedStartup = useRef<string | null>(null);
  useEffect(() => {
    let current = true;
    void readStartupHelpNotification().then(intent => { if (current) setStartup(intent); }, () => { if (current) setStartup(null); });
    return () => { current = false; };
  }, []);

  const gate: Gate = useMemo(() => {
    if (!isAuthenticated) return 'guest';
    const state = getProfileGate(profile);
    if (state === 'pending') return 'pending';
    if (state === 'blocked') return 'blocked';
    if (state === 'none') return 'needsProfile';
    return 'ready';
  }, [isAuthenticated, profile]);

  const startupEligible = !isLoading && gate === 'ready' && Boolean(startup) && !startupHandled
    && Number.isSafeInteger(profile?.id) && Number(profile?.id) > 0
    && (startup!.target.recipientUserId === undefined || startup!.target.recipientUserId === profile?.id);
  useEffect(() => {
    if (!startupEligible || !startup) return;
    const target = helpPushNavigationTarget(startup.target);
    const routeCommitted = normalizeRoutePath(pathname) === target.pathname
      && String(params.ticketId || '') === target.params.ticketId
      && String(params.messageId || '') === (target.params.messageId || '')
      && String(params.eventId || '') === (target.params.eventId || '');
    if (routeCommitted) {
      if (acceptStartupHelpNotification(startup, Number(profile?.id))) setStartupHandled(true);
      return;
    }
    const key = `${profile?.id}:${target.params.ticketId}:${target.params.messageId || ''}:${target.params.eventId || ''}`;
    if (requestedStartup.current === key) return;
    requestedStartup.current = key;
    try { router.replace(target as Href); }
    catch { requestedStartup.current = null; setStartup(null); }
  }, [startupEligible, startup, profile?.id, pathname, params.ticketId, params.messageId, params.eventId, router]);

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

  // Keep the existing startup surface until the notification destination commits.
  // RootRedirect/MainLayout must not briefly paint home or replay this navigation.
  return { isChecking: isLoading, startupNavigationPending: startup === undefined || startupEligible };
}
