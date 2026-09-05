import { apiClient } from '@/utils/apiClient';
import { API_ENDPOINTS } from '@/utils/apiEndpoints';
import type { OfflineEntity } from './offlineOrdersDatabase';

const OFFLINE_SYNC_TIMEOUT_MS = 45_000;

export type OfflineManifestEntry = {
  entity: OfflineEntity;
  epoch: string;
  schemaVersion: number;
  revision: string;
  minAvailableRevision: string;
  itemCount: number;
  lastSourceUpdateAt: string | null;
  lastFullReconcileAt: string | null;
};

export type OfflineManifest = {
  enabled: boolean;
  schemaVersion: number;
  managerScope: 'authenticated-user';
  generatedAt: string;
  entities: OfflineManifestEntry[];
};

function queryString(params: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  });
  const result = query.toString();
  return result ? `?${result}` : '';
}

async function requiredResponse<T>(path: string) {
  const response = await apiClient<void, T>(path, { timeoutMs: OFFLINE_SYNC_TIMEOUT_MS });
  if (!response.ok || !response.data) {
    const error = new Error(response.message || 'Не удалось обновить офлайн-данные') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.data;
}

export function fetchOfflineManifest() {
  return requiredResponse<OfflineManifest>(API_ENDPOINTS.CLIENT_ORDERS.OFFLINE_MANIFEST);
}

export function fetchOfflineSnapshot(entity: OfflineEntity, params: { cursor?: string | null; limit: number }) {
  return requiredResponse<{
    entity: OfflineEntity;
    epoch: string;
    schemaVersion: number;
    snapshotRevision: string;
    items: any[];
    nextCursor: string | null;
    hasMore: boolean;
    lastSourceUpdateAt: string | null;
  }>(`${API_ENDPOINTS.CLIENT_ORDERS.OFFLINE_SNAPSHOT(entity)}${queryString(params)}`);
}

export function fetchOfflineChanges(entity: OfflineEntity, params: { afterRevision: string; epoch: string; limit: number }) {
  return requiredResponse<{
    entity: OfflineEntity;
    epoch: string;
    schemaVersion: number;
    fromRevision: string;
    nextRevision: string;
    currentRevision: string;
    changes: Array<{ revision: string; itemKey: string; operation: 'UPSERT' | 'DELETE'; item: any | null }>;
    hasMore: boolean;
  }>(`${API_ENDPOINTS.CLIENT_ORDERS.OFFLINE_CHANGES(entity)}${queryString(params)}`);
}
