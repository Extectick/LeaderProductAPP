import type { SQLiteDatabase } from 'expo-sqlite';
import { API_BASE_URL } from '@/utils/config';
import { withSQLiteWriteTransaction } from '@/src/shared/storage/sqliteWriteQueue';
export const ORDER_API_SCOPE = API_BASE_URL;
export async function legacyOrderApiScope(db: SQLiteDatabase) {
  return (await db.getFirstAsync<{ value: string }>("SELECT value FROM catalog_meta WHERE key='offlineDraftLegacyApiScope'"))?.value ?? ORDER_API_SCOPE;
}
export function localOrderApiScope(order: any, legacyScope: string) {
  return typeof order?._deviceApiBaseUrl === 'string' ? order._deviceApiBaseUrl : legacyScope;
}
export async function initializeOrderApiScope(db: SQLiteDatabase) {
  if (await db.getFirstAsync("SELECT value FROM catalog_meta WHERE key='offlineDraftApiScopeInitialized'")) return;
  const storage = (await import('@react-native-async-storage/async-storage')).default;
  const legacyScope = await storage.getItem('orderOutboxLegacyApiBaseUrl') || await storage.getItem('authApiBaseUrl') || ORDER_API_SCOPE;
  await withSQLiteWriteTransaction(db, async tx => {
    if (await tx.getFirstAsync("SELECT value FROM catalog_meta WHERE key='offlineDraftApiScopeInitialized'")) return;
    await tx.runAsync("INSERT INTO catalog_meta(key,value) VALUES ('offlineDraftLegacyApiScope',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", legacyScope);
    await tx.runAsync("INSERT INTO catalog_meta(key,value) VALUES ('offlineDraftApiScopeInitialized','1')");
  });
}
