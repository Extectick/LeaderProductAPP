import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React from 'react';

import type { HomeDashboardData } from '@/src/entities/home/types';
import {
  createInitialHomeDashboard,
  fetchHomeDashboardBundle,
} from '@/utils/homeDashboardService';
import type { ServiceAccessItem } from '@/utils/servicesService';

const CACHE_KEY = 'home_dashboard_cache_v2';
const AUTO_REFRESH_MS = 30_000;

type DashboardSnapshot = {
  updatedAt: string;
  dashboard: HomeDashboardData;
  services: ServiceAccessItem[];
};

function normalizeServices(raw: unknown): ServiceAccessItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Partial<ServiceAccessItem>;
      return {
        id: Number(source.id || 0),
        key: String(source.key || ''),
        name: String(source.name || ''),
        kind: source.kind === 'LOCAL' ? 'LOCAL' : 'CLOUD',
        route: source.route ?? null,
        icon: source.icon ?? null,
        description: source.description ?? null,
        gradientStart: source.gradientStart ?? null,
        gradientEnd: source.gradientEnd ?? null,
        visible: source.visible !== false,
        enabled: source.enabled !== false,
      } satisfies ServiceAccessItem;
    })
    .filter((item): item is ServiceAccessItem => Boolean(item && item.key));
}

function parseSnapshot(raw: string | null): DashboardSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DashboardSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.dashboard || typeof parsed.dashboard !== 'object') return null;
    const services = normalizeServices(parsed.services);
    return {
      ...parsed,
      services,
    };
  } catch {
    return null;
  }
}

export function useHomeDashboardData() {
  const requestIdRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const inFlightRef = React.useRef(false);
  const initialLoadingRef = React.useRef(true);

  const [dashboard, setDashboard] = React.useState<HomeDashboardData>(createInitialHomeDashboard);
  const [services, setServices] = React.useState<ServiceAccessItem[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [cacheHydrated, setCacheHydrated] = React.useState(false);

  React.useEffect(() => {
    initialLoadingRef.current = initialLoading;
  }, [initialLoading]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (cancelled) return;
      const snapshot = parseSnapshot(raw);
      if (snapshot) {
        setDashboard(snapshot.dashboard);
        setServices(snapshot.services);
        setInitialLoading(false);
      }
      setCacheHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlightRef.current) return;
    const silent = Boolean(opts?.silent);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    inFlightRef.current = true;

    if (!silent) setRefreshing(true);
    try {
      const result = await fetchHomeDashboardBundle();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setDashboard(result.dashboard);
      setServices(result.services);
      setInitialLoading(false);

      void AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          updatedAt: new Date().toISOString(),
          dashboard: result.dashboard,
          services: result.services,
        } as DashboardSnapshot)
      );
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (initialLoadingRef.current) {
        setInitialLoading(false);
      }
    } finally {
      inFlightRef.current = false;
      if (!silent && mountedRef.current) setRefreshing(false);
    }
  }, []);

  const onRefresh = React.useCallback(async () => {
    await load({ silent: false });
  }, [load]);

  useFocusEffect(
    React.useCallback(() => {
      if (!cacheHydrated) return () => {};

      void load({ silent: !initialLoadingRef.current });
      const timer = setInterval(() => {
        void load({ silent: true });
      }, AUTO_REFRESH_MS);

      return () => {
        clearInterval(timer);
        requestIdRef.current += 1;
      };
    }, [cacheHydrated, load])
  );

  return {
    dashboard,
    services,
    refreshing,
    initialLoading,
    onRefresh,
    reload: load,
  };
}
