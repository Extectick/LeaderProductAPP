import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeServiceItem } from '@/src/features/services/lib/mergeServices';
import type { ServiceAccessItem } from '@/utils/servicesService';

const CACHE_KEY = 'services_access_cache_v2';
let cacheVersion = 0;

export async function readCachedServices(): Promise<ServiceAccessItem[] | null> {
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

export async function writeCachedServices(services: ServiceAccessItem[]) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(services));
  } catch {
    // ignore cache write errors
  }
}

export async function clearServicesAccessCache() {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore cache cleanup errors
  } finally {
    cacheVersion += 1;
  }
}

export function getServicesAccessCacheVersion() {
  return cacheVersion;
}
