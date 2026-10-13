import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/utils/config';
import type { StockPage } from './products';

type Entry = { key: string; page: StockPage<unknown>; savedAt: number };
let writes: Promise<unknown> = Promise.resolve();
const storageKey = (userId: string) => `stock-products-v2:${API_BASE_URL}:${userId}`;
async function read(userId: string): Promise<Entry[]> {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(value) ? value.filter(e => e && typeof e.key === 'string' && Array.isArray(e.page?.items)
      && Date.now() - e.savedAt < 7 * 86400000).slice(0, 8) : [];
  } catch { return []; }
}
export async function readStockCache<T>(userId: string, key: string): Promise<StockPage<T> | null> {
  return (await read(userId)).find(e => e.key === key)?.page as StockPage<T> ?? null;
}
export function writeStockCache<T>(userId: string, key: string, page: StockPage<T>) {
  writes = writes.catch(() => undefined).then(async () => {
    const items = page.items.slice(0, 300);
    const bounded = { ...page, items, nextOffset: page.items.length > 300 ? 300 : page.nextOffset, hasMore: page.hasMore || page.items.length > 300 };
    const entries = [{ key, page: bounded, savedAt: Date.now() }, ...(await read(userId)).filter(e => e.key !== key)].slice(0, 8);
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(entries));
  }).catch(() => undefined);
  return writes;
}
export function clearStockCache(userId: string) {
  writes = writes.catch(() => undefined).then(() => AsyncStorage.removeItem(storageKey(userId))).catch(() => undefined);
  return writes;
}
