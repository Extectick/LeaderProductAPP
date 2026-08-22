import { apiClient } from '@/utils/apiClient';
import { API_ENDPOINTS } from '@/utils/apiEndpoints';
import type { CatalogChangesPage, CatalogManifest, CatalogSnapshotPage } from '../model/catalog.types';

const CATALOG_TIMEOUT_MS = 30_000;

function queryString(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const value = query.toString();
  return value ? `?${value}` : '';
}

export async function fetchCatalogManifest(signal?: AbortSignal) {
  const response = await apiClient<void, CatalogManifest>(API_ENDPOINTS.CATALOG.MANIFEST, {
    signal,
    timeoutMs: CATALOG_TIMEOUT_MS,
  });
  if (!response.ok || !response.data) throw new Error(response.message || 'Не удалось получить версию каталога');
  return response.data;
}

export async function fetchCatalogSnapshotPage(params: {
  cursor?: string | null;
  limit?: number;
  snapshotRevision?: string;
  epoch?: string;
}, signal?: AbortSignal) {
  const path = `${API_ENDPOINTS.CATALOG.SNAPSHOT}${queryString(params)}`;
  const response = await apiClient<void, CatalogSnapshotPage>(path, { signal, timeoutMs: CATALOG_TIMEOUT_MS });
  if (!response.ok || !response.data) throw new Error(response.message || 'Не удалось загрузить каталог');
  return response.data;
}

export async function fetchCatalogChangesPage(params: {
  afterRevision: string;
  limit?: number;
  epoch: string;
}, signal?: AbortSignal) {
  const path = `${API_ENDPOINTS.CATALOG.CHANGES}${queryString(params)}`;
  const response = await apiClient<void, CatalogChangesPage>(path, { signal, timeoutMs: CATALOG_TIMEOUT_MS });
  if (!response.ok || !response.data) {
    const error = new Error(response.message || 'Не удалось обновить каталог') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.data;
}
