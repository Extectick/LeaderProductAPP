import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SERVICE_CATALOG } from '@/src/features/services/config/serviceCatalog';
import { mergeServices, normalizeServiceItem } from '@/src/features/services/lib/mergeServices';
import { getServicesForUser, type ServiceAccessItem } from '@/utils/servicesService';

type ServicesSnapshot = {
  services: ServiceAccessItem[] | null;
  loading: boolean;
  error: string | null;
};

const CACHE_KEY = 'services_access_cache_v2';
const CATALOG_BASE = mergeServices(SERVICE_CATALOG, null);

let state: ServicesSnapshot = {
  services: CATALOG_BASE,
  loading: true,
  error: null,
};
let inFlight: Promise<void> | null = null;
let initialized = false;
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

async function readCachedServices(): Promise<ServiceAccessItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed
      .map((item) => normalizeServiceItem(item))
      .filter((item): item is ServiceAccessItem => item !== null);
    return normalized.length ? normalized : null;
  } catch {
    return null;
  }
}

async function writeCachedServices(services: ServiceAccessItem[]) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(services));
  } catch {
    // ignore cache write errors
  }
}

async function loadServicesInternal(force = false) {
  if (inFlight && !force) return inFlight;

  const task = (async () => {
    const fallbackServices = state.services?.length ? state.services : CATALOG_BASE;
    setState({ loading: true, error: null, services: fallbackServices });

    if (!initialized || force) {
      const cached = await readCachedServices();
      if (cached?.length) {
        setState({
          services: mergeServices(CATALOG_BASE, cached),
          loading: true,
          error: null,
        });
      }
      initialized = true;
    }

    try {
      const remote = await getServicesForUser();
      const merged = mergeServices(CATALOG_BASE, remote);
      await writeCachedServices(remote);
      setState({
        services: merged,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      const message = error?.message || 'Не удалось загрузить сервисы';
      const fallback = state.services?.length ? state.services : CATALOG_BASE;
      setState({
        services: fallback,
        loading: false,
        // На офлайне продолжаем работать с fallback-списком без error-экрана.
        error: fallback.length ? null : message,
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
