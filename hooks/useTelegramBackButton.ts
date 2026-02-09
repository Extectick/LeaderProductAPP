import { backButton } from '@tma.js/sdk';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { isTelegramMiniAppLaunch, prepareTelegramWebApp } from '@/utils/telegramAuthService';

const ROOT_PATHS = new Set([
  '/',
  '/home',
  '/services',
  '/tasks',
  '/profile',
  '/admin',
  '/AuthScreen',
  '/telegram',
  '/ProfileSelectionScreen',
  '/ProfilePendingScreen',
  '/ProfileBlockedScreen',
]);

function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  const strippedGroups = pathname.replace(/\/\([^/]+\)/g, '');
  const normalized = strippedGroups.length > 1 && strippedGroups.endsWith('/')
    ? strippedGroups.slice(0, -1)
    : strippedGroups || '/';
  if (normalized === '/index') return '/';
  if (normalized.endsWith('/index')) {
    const withoutIndex = normalized.slice(0, -'/index'.length);
    return withoutIndex || '/';
  }
  return normalized;
}

function resolveFallbackPath(pathname: string): Href | null {
  const path = normalizePath(pathname);

  if (path === '/services/appeals') return '/services';
  if (path.startsWith('/services/appeals/')) return '/services/appeals';

  if (path === '/services/qrcodes') return '/services';
  if (path.startsWith('/services/qrcodes/')) return '/services/qrcodes';

  if (path === '/services/tracking') return '/services';
  if (path.startsWith('/services/tracking/')) return '/services/tracking';

  if (path.startsWith('/services/')) return '/services';

  if (path.startsWith('/admin/')) return '/admin';
  if (path === '/admin') return '/home';

  if (path.startsWith('/profile/')) return '/profile';

  return null;
}

function safeBackButtonCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    // Telegram SDK may throw when environment is not ready.
    return undefined;
  }
}

function hasTelegramWebAppObject() {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any)?.Telegram?.WebApp);
}

function getNativeTelegramWebApp(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any)?.Telegram?.WebApp || null;
}

function getNativeTelegramWebView(): any | null {
  if (typeof window === 'undefined') return null;
  return (window as any)?.Telegram?.WebView || null;
}

export function useTelegramBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const guardPathRef = useRef<string | null>(null);

  const path = useMemo(() => normalizePath(pathname), [pathname]);
  const inMiniApp = Platform.OS === 'web' && (isTelegramMiniAppLaunch() || hasTelegramWebAppObject());
  const fallbackPath = useMemo(() => resolveFallbackPath(path), [path]);
  const isRootPath = ROOT_PATHS.has(path);
  const shouldShowBackButton = inMiniApp && !isRootPath;
  const needsWebBackGuard = inMiniApp && Boolean(fallbackPath);

  const handleBackPress = useCallback(() => {
    if (fallbackPath) {
      router.replace(fallbackPath);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  }, [fallbackPath, router]);

  useEffect(() => {
    if (!inMiniApp) return;

    prepareTelegramWebApp();
    safeBackButtonCall(() => backButton.mount());
    const nativeTg = getNativeTelegramWebApp();
    const nativeWebView = getNativeTelegramWebView();
    const nativeBack = nativeTg?.BackButton;
    try {
      nativeBack?.show?.();
    } catch {}

    const unsubscribe = safeBackButtonCall(() => backButton.onClick(handleBackPress));
    let nativeUnsubscribeEvent: (() => void) | null = null;
    let nativeUnsubscribeEventSnake: (() => void) | null = null;
    let nativeUnsubscribeBack: (() => void) | null = null;
    let nativeUnsubscribeWebViewEvent: (() => void) | null = null;
    let nativeUnsubscribeWebViewEventSnake: (() => void) | null = null;
    try {
      nativeBack?.onClick?.(handleBackPress);
      nativeUnsubscribeBack = () => {
        try {
          nativeBack?.offClick?.(handleBackPress);
        } catch {}
      };
    } catch {}
    try {
      nativeTg?.onEvent?.('backButtonClicked', handleBackPress);
      nativeUnsubscribeEvent = () => {
        try {
          nativeTg?.offEvent?.('backButtonClicked', handleBackPress);
        } catch {}
      };
    } catch {}
    try {
      nativeTg?.onEvent?.('back_button_pressed', handleBackPress);
      nativeUnsubscribeEventSnake = () => {
        try {
          nativeTg?.offEvent?.('back_button_pressed', handleBackPress);
        } catch {}
      };
    } catch {}
    try {
      nativeWebView?.onEvent?.('backButtonClicked', handleBackPress);
      nativeUnsubscribeWebViewEvent = () => {
        try {
          nativeWebView?.offEvent?.('backButtonClicked', handleBackPress);
        } catch {}
      };
    } catch {}
    try {
      nativeWebView?.onEvent?.('back_button_pressed', handleBackPress);
      nativeUnsubscribeWebViewEventSnake = () => {
        try {
          nativeWebView?.offEvent?.('back_button_pressed', handleBackPress);
        } catch {}
      };
    } catch {}

    return () => {
      if (unsubscribe) unsubscribe();
      if (nativeUnsubscribeBack) nativeUnsubscribeBack();
      if (nativeUnsubscribeEvent) nativeUnsubscribeEvent();
      if (nativeUnsubscribeEventSnake) nativeUnsubscribeEventSnake();
      if (nativeUnsubscribeWebViewEvent) nativeUnsubscribeWebViewEvent();
      if (nativeUnsubscribeWebViewEventSnake) nativeUnsubscribeWebViewEventSnake();
      try {
        nativeBack?.hide?.();
      } catch {}
      safeBackButtonCall(() => backButton.hide());
      safeBackButtonCall(() => backButton.unmount());
    };
  }, [handleBackPress, inMiniApp]);

  useEffect(() => {
    if (!inMiniApp) return;
    const nativeTg = getNativeTelegramWebApp();
    const nativeBack = nativeTg?.BackButton;
    safeBackButtonCall(() => {
      if (shouldShowBackButton) {
        backButton.show();
        try {
          nativeBack?.show?.();
        } catch {}
        try {
          nativeTg?.enableClosingConfirmation?.();
        } catch {}
      } else {
        backButton.hide();
        try {
          nativeBack?.hide?.();
        } catch {}
        try {
          nativeTg?.disableClosingConfirmation?.();
        } catch {}
      }
    });
  }, [inMiniApp, shouldShowBackButton]);

  useEffect(() => {
    if (!needsWebBackGuard) return;
    if (typeof window === 'undefined') return;
    if (!fallbackPath) return;
    if (guardPathRef.current === path) return;
    guardPathRef.current = path;

    const guardState = { ...(window.history.state || {}), __lpTgBackGuard: path };
    try {
      window.history.pushState(guardState, '', window.location.href);
    } catch {}

    const onPopState = () => {
      const currentPath = normalizePath(String(window.location.pathname || path));
      const target = resolveFallbackPath(currentPath) || fallbackPath;
      if (!target) return;
      router.replace(target);
      try {
        const nextState = { ...(window.history.state || {}), __lpTgBackGuard: currentPath };
        window.history.pushState(nextState, '', window.location.href);
      } catch {}
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (guardPathRef.current === path) {
        guardPathRef.current = null;
      }
    };
  }, [fallbackPath, needsWebBackGuard, path, router]);
}
