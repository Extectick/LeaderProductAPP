import { API_ENDPOINTS } from './apiEndpoints';
import { apiClient } from './apiClient';
import type {
  StockBalancesChildrenResponse,
  StockBalancesMeta,
  StockBalancesTreeResponse,
  StockHierarchy,
} from '@/src/features/stockBalances/types';

export async function getStockBalancesMeta(): Promise<StockBalancesMeta> {
  const res = await apiClient<void, StockBalancesMeta>(API_ENDPOINTS.STOCK_BALANCES.META);
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось загрузить метаданные остатков');
  return res.data;
}

export async function getStockBalancesTree(params: {
  hierarchy: StockHierarchy;
  organizationGuid?: string;
  search?: string;
  offset?: number;
  limit?: number;
  compact?: boolean;
}): Promise<StockBalancesTreeResponse> {
  const query = new URLSearchParams();
  query.set('hierarchy', params.hierarchy);
  if (params.organizationGuid) query.set('organizationGuid', params.organizationGuid);
  if (params.search) query.set('search', params.search);
  if (params.offset != null) query.set('offset', String(params.offset));
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.compact) query.set('compact', '1');

  const res = await apiClient<void, StockBalancesTreeResponse>(
    `${API_ENDPOINTS.STOCK_BALANCES.TREE}?${query.toString()}`
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось загрузить дерево остатков');
  return res.data;
}

export async function getStockBalancesChildren(params: {
  hierarchy: StockHierarchy;
  level: 'root' | 'group';
  nodeGuid: string;
  rootGuid?: string;
  organizationGuid?: string;
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<StockBalancesChildrenResponse> {
  const query = new URLSearchParams();
  query.set('hierarchy', params.hierarchy);
  query.set('level', params.level);
  query.set('nodeGuid', params.nodeGuid);
  if (params.rootGuid) query.set('rootGuid', params.rootGuid);
  if (params.organizationGuid) query.set('organizationGuid', params.organizationGuid);
  if (params.search) query.set('search', params.search);
  if (params.offset != null) query.set('offset', String(params.offset));
  if (params.limit != null) query.set('limit', String(params.limit));

  const res = await apiClient<void, StockBalancesChildrenResponse>(
    `${API_ENDPOINTS.STOCK_BALANCES.CHILDREN}?${query.toString()}`
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось загрузить дочерние элементы остатков');
  return res.data;
}
