import { apiClient } from '@/utils/apiClient';
import type { SelectedWarehouse } from './useWarehouseSelection';

export type StockMetrics = { inStock: number; available: number | null; reserved: number; myReserved?: number; availableForManager?: number | null; availabilityReason?: string };
export type IncomingCost = { price: number; currency: string; source: 'RECEIPT_PRICE'; updatedAt: string | null };
export type StockProduct = StockMetrics & { guid: string; name: string; code: string | null; baseUnit: { name: string; symbol: string | null } | null;
  imageThumbUrl?: string | null; imagePreviewUrl?: string | null; imageHash?: string | null;
  images?: Array<{ id: string; fileGuid: string; thumbUrl: string; previewUrl: string; isMain?: boolean }>; updatedAt: string | null; incomingCost?: IncomingCost | null };
export type StockDetail = StockMetrics & { id: string; warehouse: { guid: string; name: string };
  seriesGuid?: string; seriesNumber?: string | null; expiresAt?: string | null; productionDate?: string | null; updatedAt?: string | null };
export type StockMovement = { id: string; direction: 'receipt' | 'expense'; operationKind: string;
  document: { type: string; typeName: string; guid: string; number: string; date: string }; movementAt: string;
  warehouse: { guid: string; name: string }; characteristic: string; quantity: number;
  baseDocuments: StockMovement['document'][]; counterparty: string; writeOffArticles: string[];
  price: number | null; amount: number | null; currency: string; costBasis: 'VAT_INCLUDED';
  costStatus: 'CALCULATED' | 'PRELIMINARY' | 'UNAVAILABLE' | 'DOCUMENT'; costReason: string };
export type StockPage<T> = { items: T[]; offset: number; nextOffset: number; hasMore: boolean; nextCursor?: string | null; snapshotAt?: string; incomingCost?: IncomingCost | null };
export type StockFilters = { warehouses: SelectedWarehouse[]; organizations: Array<{ guid: string; name: string }> };
export type StockQuery = { search?: string; warehouseGuid?: string; warehouseGuids?: string; organizationGuid?: string; bySeries?: string; groupByWarehouse?: string; direction?: 'receipt' | 'expense' };
export class StockRequestError extends Error { constructor(public status: number, history = false) {
  super(status === 403 ? 'Нет доступа к остаткам' : status === 404 ? 'Нужно обновить API остатков' : history
    ? status === 400 ? 'Обновите историю: потяните список вниз.' : 'Не удалось загрузить историю из 1С. Потяните вниз для повторной загрузки.'
    : 'Не удалось обновить остатки. Повторите попытку.');
} }
export async function stockRequest<T>(path: string, query: StockQuery & { offset?: number; cursor?: string }, signal: AbortSignal): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  const response = await apiClient<void, T>(`/stock-balances/${path}?${params}`, { signal, networkRetryCount: 0 });
  if (!response.ok || !response.data) throw new StockRequestError(response.status ?? 0, path.endsWith('/movements'));
  return response.data;
}

export function mergeStockPage<T extends { guid?: string; id?: string }>(previous: T[], next: T[]) {
  const result = new Map(previous.map(item => [item.id ?? item.guid, item]));
  next.forEach(item => result.set(item.id ?? item.guid, item));
  return [...result.values()];
}
