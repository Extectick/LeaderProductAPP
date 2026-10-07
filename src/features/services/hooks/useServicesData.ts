import { useCallback, useEffect, useMemo, useState } from 'react';
import { SERVICE_CATALOG } from '@/src/features/services/config/serviceCatalog';
import { mergeRemoteServices, mergeServices } from '@/src/features/services/lib/mergeServices';
import {
  getServicesAccessCacheVersion,
  readCachedServices,
  writeCachedServices,
} from '@/src/features/services/storage/servicesAccessCache';
import { getServicesForUser, type ServiceAccessItem } from '@/utils/servicesService';
import { getServerStatus, subscribeServerStatus } from '@/src/shared/network/serverStatus';

type ServicesSnapshot = {
  services: ServiceAccessItem[] | null;
  loading: boolean;
  error: string | null;
};

const CATALOG_BASE = mergeServices(SERVICE_CATALOG, null);

let state: ServicesSnapshot = {
  services: null,
  loading: true,
  error: null,
};
let inFlight: { version: number; promise: Promise<void> } | null = null;
let observedCacheVersion = getServicesAccessCacheVersion();
const listeners = new Set<(snapshot: ServicesSnapshot) => void>();

function emit() {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // ignore listener errors
    }
  });
}

function setState(next: Partial<ServicesSnapshot>) {
  state = {
    ...state,
    ...next,
  };
  emit();
}

function subscribe(listener: (snapshot: ServicesSnapshot) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getInitialSnapshotForRender() {
  if (observedCacheVersion !== getServicesAccessCacheVersion()) {
    return { services: null, loading: true, error: null };
  }
  // An empty snapshot is not authoritative on a newly mounted catalog until
  // the access list has been refreshed. Rendering it as final for one frame
  // caused the recurring "no services" flash before every successful load.
  if (state.services === null && !state.loading) {
    return {
      services: null,
      loading: true,
      error: null,
    };
  }
  return state;
}

async function loadServicesInternal(force = false) {
  const version = getServicesAccessCacheVersion();
  if (inFlight?.version === version) return inFlight.promise;
  const isCurrent = () => version === getServicesAccessCacheVersion();

  const task = Promise.resolve().then(async () => {
    const currentCacheVersion = getServicesAccessCacheVersion();
    if (currentCacheVersion !== observedCacheVersion) {
      observedCacheVersion = currentCacheVersion;
      setState({ services: null, error: null });
    }

    const fallbackServices = state.services;
    setState({ loading: fallbackServices === null, error: null, services: fallbackServices });

    const cachedFallback = fallbackServices === null || force ? await readCachedServices() : null;
    if (!isCurrent()) return;
    const fallback = fallbackServices ?? (cachedFallback !== null ? mergeRemoteServices(CATALOG_BASE, cachedFallback) : null);
    // Hydrate authorized services before any network wait, including cold starts.
    if (fallback !== null) setState({ services: fallback, loading: false, error: null });

    try {
      if (!getServerStatus().isReachable) {
        setState({ loading: false, error: fallback === null ? 'Список сервисов ещё не сохранён. Подключитесь к интернету для первого входа.' : null });
        return;
      }
      const remote = await getServicesForUser();
      if (!isCurrent()) return;
      const merged = mergeRemoteServices(CATALOG_BASE, remote);
      await writeCachedServices(remote);
      if (!isCurrent()) return;
      setState({
        services: merged,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      if (!isCurrent()) return;
      const message = error?.message || 'Не удалось загрузить сервисы';
      setState({
        services: fallback,
        loading: false,
        // На офлайне продолжаем работать с последним серверным списком без error-экрана.
        error: fallback !== null ? null : message,
      });
    } finally {
      if (inFlight?.version === version) inFlight = null;
    }
  });

  inFlight = { version, promise: task };
  return task;
}

export function useServicesData() {
  const [snapshot, setSnapshot] = useState<ServicesSnapshot>(() => getInitialSnapshotForRender());

  useEffect(() => subscribe(setSnapshot), []);

  useEffect(() => {
    void loadServicesInternal(false);
    let wasReachable = getServerStatus().isReachable;
    return subscribeServerStatus(({ isReachable }) => {
      const restored = isReachable && !wasReachable;
      wasReachable = isReachable;
      if (restored) void loadServicesInternal(true);
    });
  }, []);

  const loadServices = useCallback(async (force = true) => {
    await loadServicesInternal(force);
  }, []);

  return useMemo(
    () => ({
      services: snapshot.services,
      error: snapshot.error,
      loading: snapshot.loading,
      loadServices,
    }),
    [snapshot, loadServices]
  );
}
