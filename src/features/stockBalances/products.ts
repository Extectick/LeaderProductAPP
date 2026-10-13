import { apiClient } from '@/utils/apiClient';

export type StockMetrics = { inStock: number; available: number; reserved: number; shipping: number; clientReserved: number; managerReserved: number };
export type StockProduct = StockMetrics & { guid: string; name: string; code: string | null; baseUnit: { name: string; symbol: string | null } | null;
  imageThumbUrl?: string | null; imageHash?: string | null; updatedAt: string | null };
export type StockDetail = StockMetrics & { id: string; warehouse: { guid: string; name: string }; organization: { guid: string; name: string } | null;
  seriesNumber: string | null; expiresAt: string | null; productionDate: string | null; updatedAt: string | null };
export type StockPage<T> = { items: T[]; offset: number; nextOffset: number; hasMore: boolean };
export type StockFilters = { warehouses: Array<{ guid: string; name: string }>; organizations: Array<{ guid: string; name: string }> };
export type StockQuery = { search?: string; warehouseGuid?: string; warehouseGuids?: string; organizationGuid?: string };
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
