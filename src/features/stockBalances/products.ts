import { apiClient } from '@/utils/apiClient';
import type { SelectedWarehouse } from './useWarehouseSelection';

export type StockMetrics = { inStock: number; available: number | null; reserved: number; myReserved?: number; availableForManager?: number | null; availabilityReason?: string };
export type StockProduct = StockMetrics & { guid: string; name: string; code: string | null; baseUnit: { name: string; symbol: string | null } | null;
  imageThumbUrl?: string | null; imagePreviewUrl?: string | null; imageHash?: string | null;
  images?: Array<{ id: string; fileGuid: string; thumbUrl: string; previewUrl: string; isMain?: boolean }>; updatedAt: string | null };
export type StockDetail = StockMetrics & { id: string; warehouse: { guid: string; name: string };
  seriesGuid?: string; seriesNumber?: string | null; expiresAt?: string | null; productionDate?: string | null; updatedAt?: string | null };
export type StockPage<T> = { items: T[]; offset: number; nextOffset: number; hasMore: boolean };
export type StockFilters = { warehouses: SelectedWarehouse[]; organizations: Array<{ guid: string; name: string }> };
export type StockQuery = { search?: string; warehouseGuid?: string; warehouseGuids?: string; organizationGuid?: string; bySeries?: string; groupByWarehouse?: string };
export class StockRequestError extends Error { constructor(public status: number) { super(status === 403 ? 'Нет доступа к остаткам' : status === 404 ? 'Нужно обновить API остатков' : 'Не удалось обновить остатки. Повторите попытку.'); } }
export async function stockRequest<T>(path: string, query: StockQuery & { offset?: number }, signal: AbortSignal): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  const response = await apiClient<void, T>(`/stock-balances/${path}?${params}`, { signal, networkRetryCount: 0 });
  if (!response.ok || !response.data) throw new StockRequestError(response.status ?? 0);
  return response.data;
}

export function mergeStockPage<T extends { guid?: string; id?: string }>(previous: T[], next: T[]) {
  const result = new Map(previous.map(item => [item.id ?? item.guid, item]));
  next.forEach(item => result.set(item.id ?? item.guid, item));
  return [...result.values()];
}
