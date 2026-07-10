import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { AuthContext } from '@/context/AuthContext';
import StartupLogoLoader from '@/components/StartupLogoLoader';
import { normalizeRoutePath } from '@/src/shared/lib/routePath';
import { getProfileGate } from '@/utils/profileGate';
import { getMaxStartAppealId, isMaxMiniAppLaunch } from '@/utils/maxAuthService';
import { getTelegramStartAppealId, isTelegramMiniAppLaunch } from '@/utils/telegramAuthService';

export default function RootRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = React.useContext(AuthContext);
  const lastRedirectRef = useRef('');

  useEffect(() => {
    if (!auth) return;
    if (auth.isLoading) return;

    const gateState = getProfileGate(auth.profile);
    const startAppealId = getTelegramStartAppealId() || getMaxStartAppealId();
    const target = !auth.isAuthenticated
      ? isMaxMiniAppLaunch()
        ? '/(auth)/max'
        : isTelegramMiniAppLaunch()
        ? '/(auth)/telegram'
        : '/(auth)/AuthScreen'
      : gateState === 'active'
      ? startAppealId
        ? `/(main)/services/appeals/${startAppealId}`
        : Platform.OS === 'web'
        ? '/home'
        : '/services'
      : gateState === 'pending'
      ? '/(auth)/ProfilePendingScreen'
      : gateState === 'blocked'
      ? '/(auth)/ProfileBlockedScreen'
      : '/ProfileSelectionScreen';

    const currentPath = normalizeRoutePath(pathname);
    const targetPath = normalizeRoutePath(target);
    if (currentPath === targetPath) {
      lastRedirectRef.current = '';
      return;
    }
    if (lastRedirectRef.current === targetPath) return;
    lastRedirectRef.current = targetPath;
    router.replace(target as any);
  }, [auth, pathname, router]);

  return <StartupLogoLoader />;
}
