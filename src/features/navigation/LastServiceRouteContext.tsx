import { AuthContext } from '@/context/AuthContext';
import { usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearLastServiceRoute as clearLastServiceRouteStorage,
  getCachedLastServiceRoute,
  getLastServiceRoute,
  getWebCachedLastServiceRoute,
  hydrateLastServiceRoute,
  resolveServiceRootRoute,
  saveLastServiceRoute,
  saveWebCachedLastServiceRoute,
} from './lastServiceRouteStorage';

type LastServiceRouteContextValue = {
  lastServiceRoute: string | null;
  ready: boolean;
  setLastServiceRouteFromPath: (path: string | null | undefined) => void;
  clearLastServiceRoute: () => void;
  resolveLastServiceRoute: () => Promise<string | null>;
};

const LastServiceRouteContext = createContext<LastServiceRouteContextValue | null>(null);

export function LastServiceRouteProvider({ children }: { children: React.ReactNode }) {
  const auth = useContext(AuthContext);
  const pathname = usePathname();
  const userId = auth?.profile?.id ?? null;
  const [lastServiceRoute, setLastServiceRoute] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const cached = getCachedLastServiceRoute(userId);
    if (cached) setLastServiceRoute(cached);
    setReady(false);

    hydrateLastServiceRoute(userId)
      .then((route) => {
        if (!mounted) return;
        setLastServiceRoute((current) => route || current || getCachedLastServiceRoute(userId));
      })
      .catch(() => {
        if (!mounted) return;
        setLastServiceRoute((current) => current || getCachedLastServiceRoute(userId));
      })
      .finally(() => {
        if (mounted) {
          setReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [userId]);

  const setLastServiceRouteFromPath = useCallback(
    (path: string | null | undefined) => {
      const route = resolveServiceRootRoute(path);
      if (!route) return;
      setLastServiceRoute(route);
      saveWebCachedLastServiceRoute(route);
      void saveLastServiceRoute(userId, route);
    },
    [userId]
  );

  useEffect(() => {
    setLastServiceRouteFromPath(pathname);
  }, [pathname, setLastServiceRouteFromPath]);

  const clearLastServiceRoute = useCallback(() => {
    setLastServiceRoute(null);
    void clearLastServiceRouteStorage(userId);
  }, [userId]);

  const resolveLastServiceRoute = useCallback(async () => {
    const webCached = getWebCachedLastServiceRoute();
    if (webCached) {
      setLastServiceRoute(webCached);
      return webCached;
    }

    const cached = getCachedLastServiceRoute(userId);
    if (cached) {
      setLastServiceRoute(cached);
      return cached;
    }

    const route = lastServiceRoute || (await getLastServiceRoute(userId));
    setLastServiceRoute(route);
    return route;
  }, [lastServiceRoute, userId]);

  const value = useMemo(
    () => ({
      lastServiceRoute,
      ready,
      setLastServiceRouteFromPath,
      clearLastServiceRoute,
      resolveLastServiceRoute,
    }),
    [clearLastServiceRoute, lastServiceRoute, ready, resolveLastServiceRoute, setLastServiceRouteFromPath]
  );

  return (
    <LastServiceRouteContext.Provider value={value}>
      {children}
    </LastServiceRouteContext.Provider>
  );
}

export function useLastServiceRoute() {
  const value = useContext(LastServiceRouteContext);
  if (!value) {
    throw new Error('useLastServiceRoute must be used within LastServiceRouteProvider');
  }
  return value;
}

export function useOptionalLastServiceRoute() {
  return useContext(LastServiceRouteContext);
}
