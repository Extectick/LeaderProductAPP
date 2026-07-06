import { useCallback, useEffect, useMemo, useState } from 'react';
import { SERVICE_CATALOG } from '@/src/features/services/config/serviceCatalog';
import { mergeRemoteServices, mergeServices } from '@/src/features/services/lib/mergeServices';
import {
  getServicesAccessCacheVersion,
  readCachedServices,
  writeCachedServices,
} from '@/src/features/services/storage/servicesAccessCache';
import { getServicesForUser, type ServiceAccessItem } from '@/utils/servicesService';

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
let inFlight: Promise<void> | null = null;
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

async function loadServicesInternal(force = false) {
  if (inFlight) return inFlight;

  const task = (async () => {
    const currentCacheVersion = getServicesAccessCacheVersion();
    if (currentCacheVersion !== observedCacheVersion) {
      observedCacheVersion = currentCacheVersion;
      setState({ services: null, error: null });
    }

    const fallbackServices = state.services?.length ? state.services : null;
    setState({ loading: true, error: null, services: fallbackServices });

    const cachedFallback = !fallbackServices || force ? await readCachedServices() : null;

    try {
      const remote = await getServicesForUser();
      const merged = mergeRemoteServices(CATALOG_BASE, remote);
      await writeCachedServices(remote);
      setState({
        services: merged,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error?.message || 'Не удалось загрузить сервисы';
      const fallback = fallbackServices || (cachedFallback?.length ? mergeRemoteServices(CATALOG_BASE, cachedFallback) : null);
      setState({
        services: fallback,
        loading: false,
        // На офлайне продолжаем работать с последним серверным списком без error-экрана.
        error: fallback?.length ? null : message,
      });
    } finally {
      inFlight = null;
    }
  })();

  inFlight = task;
  return task;
}

export function useServicesData() {
  const [snapshot, setSnapshot] = useState<ServicesSnapshot>(state);

  useEffect(() => subscribe(setSnapshot), []);

  useEffect(() => {
    void loadServicesInternal(false);
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
