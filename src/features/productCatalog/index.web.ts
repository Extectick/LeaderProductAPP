import type { CatalogSearchResult } from './model/catalog.types';

// The persistent catalog is intentionally native-only. Web keeps using the
// existing server search and must not bundle expo-sqlite's WASM worker.
export async function searchCatalogProducts(
  _search: string,
  _limit: number,
  _offset: number
): Promise<CatalogSearchResult | null> {
  return null;
}

export async function syncProductCatalog() {
  return false;
}

export function scheduleProductCatalogSync() {
  // No-op on web: server search remains the source of truth.
}
