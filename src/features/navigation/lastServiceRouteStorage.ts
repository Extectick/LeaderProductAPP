import AsyncStorage from '@react-native-async-storage/async-storage';
import { INSTALLED_SERVICE_ROUTES } from '../services/lib/serviceAvailability';

const LAST_SERVICE_ROUTE_STORAGE_KEY = 'last_service_route_v1';
const WEB_LAST_SERVICE_ROUTE_KEY = 'last_service_route_web_v1';
const memoryCache = new Map<string, string>();
const inflightReads = new Map<string, Promise<string | null>>();
const clearedKeys = new Set<string>();
const revisions = new Map<string, number>();
const installedServiceRoots = new Set(Object.values(INSTALLED_SERVICE_ROUTES).filter(route => route.startsWith('/services/')));

function invalidateReads(key: string) {
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  inflightReads.delete(key);
}

function hasUserId(userId?: number | string | null): boolean {
  return userId !== null && userId !== undefined && String(userId).trim().length > 0;
}

export function getLastServiceRouteStorageKey(userId?: number | string | null): string {
  const normalized = userId === null || userId === undefined ? '' : String(userId).trim();
  return normalized ? `${LAST_SERVICE_ROUTE_STORAGE_KEY}:${normalized}` : LAST_SERVICE_ROUTE_STORAGE_KEY;
}

export function resolveServiceRootRoute(path: string | null | undefined): string | null {
  const clean = String(path || '')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .replace(/\/\([^/]+\)/g, '')
    .replace(/\/+/g, '/');
  if (!clean) return null;

  const parts = clean.split('/').filter(Boolean);
  if (parts[0] !== 'services' || !parts[1]) {
    return null;
  }

  const route = `/services/${parts[1]}`;
  return installedServiceRoots.has(route) ? route : null;
}

export async function getLastServiceRoute(userId?: number | string | null): Promise<string | null> {
  const key = getLastServiceRouteStorageKey(userId);
  if (clearedKeys.has(key) || (hasUserId(userId) && clearedKeys.has(LAST_SERVICE_ROUTE_STORAGE_KEY))) {
    return null;
  }
  const cached = memoryCache.get(key);
  if (cached) {
    return cached;
  }
  const fallbackCached = hasUserId(userId) ? memoryCache.get(LAST_SERVICE_ROUTE_STORAGE_KEY) : null;
  if (fallbackCached) {
    memoryCache.set(key, fallbackCached);
    return fallbackCached;
  }

  const inflight = inflightReads.get(key);
  if (inflight) {
    return inflight;
  }

  const revision = revisions.get(key) ?? 0;
  const fallbackRevision = revisions.get(LAST_SERVICE_ROUTE_STORAGE_KEY) ?? 0;
  const readIsCurrent = () => (revisions.get(key) ?? 0) === revision
    && (revisions.get(LAST_SERVICE_ROUTE_STORAGE_KEY) ?? 0) === fallbackRevision;
  const read = AsyncStorage.getItem(key)
    .then(async (stored) => {
      if (!readIsCurrent()) return null;
      const route = resolveServiceRootRoute(stored) || (
        hasUserId(userId)
          ? resolveServiceRootRoute(await AsyncStorage.getItem(LAST_SERVICE_ROUTE_STORAGE_KEY))
          : null
      );
      // A recovery action or a newer navigation owns the route now.
      if (!readIsCurrent()) return null;
      if (route) memoryCache.set(key, route);
      return route;
    })
    .catch(() => {
      return null;
    })
    .finally(() => {
      if (inflightReads.get(key) === read) inflightReads.delete(key);
    });

  inflightReads.set(key, read);
  return read;
}

export function getCachedLastServiceRoute(userId?: number | string | null): string | null {
  const key = getLastServiceRouteStorageKey(userId);
  if (clearedKeys.has(key) || (hasUserId(userId) && clearedKeys.has(LAST_SERVICE_ROUTE_STORAGE_KEY))) {
    return null;
  }
  const route = memoryCache.get(key) ?? (
    hasUserId(userId) ? memoryCache.get(LAST_SERVICE_ROUTE_STORAGE_KEY) ?? null : null
  );
  return route;
}

export function getWebCachedLastServiceRoute(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const sessionValue = window.sessionStorage.getItem(WEB_LAST_SERVICE_ROUTE_KEY);
    const localValue = window.localStorage.getItem(WEB_LAST_SERVICE_ROUTE_KEY);
    const route = resolveServiceRootRoute(sessionValue) || resolveServiceRootRoute(localValue);
    return route;
  } catch {
    return null;
  }
}

export function saveWebCachedLastServiceRoute(path: string | null | undefined): void {
  const route = resolveServiceRootRoute(path);
  if (!route || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(WEB_LAST_SERVICE_ROUTE_KEY, route);
    window.localStorage.setItem(WEB_LAST_SERVICE_ROUTE_KEY, route);
  } catch {}
}

export function clearWebCachedLastServiceRoute(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(WEB_LAST_SERVICE_ROUTE_KEY);
    window.localStorage.removeItem(WEB_LAST_SERVICE_ROUTE_KEY);
  } catch {}
}

export async function hydrateLastServiceRoute(userId?: number | string | null): Promise<string | null> {
  try {
    return await getLastServiceRoute(userId);
  } catch {
    return null;
  }
}

export async function saveLastServiceRoute(
  userId: number | string | null | undefined,
  path: string | null | undefined
): Promise<void> {
  const route = resolveServiceRootRoute(path);
  if (!route) return;

  const key = getLastServiceRouteStorageKey(userId);
  invalidateReads(key);
  if (key !== LAST_SERVICE_ROUTE_STORAGE_KEY) invalidateReads(LAST_SERVICE_ROUTE_STORAGE_KEY);
  clearedKeys.delete(key);
  clearedKeys.delete(LAST_SERVICE_ROUTE_STORAGE_KEY);
  memoryCache.set(key, route);
  memoryCache.set(LAST_SERVICE_ROUTE_STORAGE_KEY, route);
  saveWebCachedLastServiceRoute(route);
  try {
    await AsyncStorage.multiSet([
      [key, route],
      [LAST_SERVICE_ROUTE_STORAGE_KEY, route],
    ]);
  } catch {}
}

export async function clearLastServiceRoute(userId?: number | string | null): Promise<void> {
  const key = getLastServiceRouteStorageKey(userId);
  invalidateReads(key);
  if (key !== LAST_SERVICE_ROUTE_STORAGE_KEY) invalidateReads(LAST_SERVICE_ROUTE_STORAGE_KEY);
  clearedKeys.add(key);
  clearedKeys.add(LAST_SERVICE_ROUTE_STORAGE_KEY);
  memoryCache.delete(key);
  memoryCache.delete(LAST_SERVICE_ROUTE_STORAGE_KEY);
  inflightReads.delete(key);
  inflightReads.delete(LAST_SERVICE_ROUTE_STORAGE_KEY);
  clearWebCachedLastServiceRoute();
  try {
    await AsyncStorage.multiRemove([key, LAST_SERVICE_ROUTE_STORAGE_KEY]);
  } catch {}
}
