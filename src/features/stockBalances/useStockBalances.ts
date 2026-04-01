import React from 'react';
import type {
  StockBalancesMeta,
  StockBalancesTreeResponse,
  StockHierarchy,
  StockLeafRow,
  StockSecondLevelGroup,
} from './types';
import {
  getStockBalancesChildren,
  getStockBalancesMeta,
  getStockBalancesTree,
} from '@/utils/stockBalancesService';

const ROOT_PAGE_SIZE = 20;
const ROOT_CHILDREN_PAGE_SIZE = 40;
const GROUP_LEAVES_PAGE_SIZE = 80;

type ChildrenPageState = {
  items: StockSecondLevelGroup[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

type LeavesPageState = {
  items: StockLeafRow[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

function mergeById<T extends { id: string }>(current: T[], next: T[]) {
  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const item of next) {
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }
  return merged;
}

export function useStockBalances(options?: { compact?: boolean }) {
  const compact = options?.compact ?? false;
  const initializedRef = React.useRef(false);
  const loadMoreRef = React.useRef(false);
  const [meta, setMeta] = React.useState<StockBalancesMeta | null>(null);
  const [tree, setTree] = React.useState<StockBalancesTreeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hierarchy, setHierarchy] = React.useState<StockHierarchy>('warehouse-product');
  const [organizationGuid, setOrganizationGuid] = React.useState('');
  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  const [childrenByRootGuid, setChildrenByRootGuid] = React.useState<Record<string, ChildrenPageState>>({});
  const [leavesByGroupKey, setLeavesByGroupKey] = React.useState<Record<string, LeavesPageState>>({});
  const [loadingNodeIds, setLoadingNodeIds] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      setSearch(searchInput.trim());
    }, 320);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const resetLazyData = React.useCallback(() => {
    setChildrenByRootGuid({});
    setLeavesByGroupKey({});
    setLoadingNodeIds({});
  }, []);

  const load = React.useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      try {
        if (mode === 'refresh') {
          setRefreshing(true);
        } else if (loadMoreRef.current && offset > 0) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const [metaData, treeData] = await Promise.all([
          getStockBalancesMeta(),
          getStockBalancesTree({
            hierarchy,
            organizationGuid: organizationGuid || undefined,
            search: search || undefined,
            offset,
            limit: ROOT_PAGE_SIZE,
            compact,
          }),
        ]);

        setMeta(metaData);
        setTree((prev) => {
          if (!loadMoreRef.current || offset === 0 || !prev) {
            return treeData;
          }

          return {
            ...treeData,
            roots: mergeById(prev.roots, treeData.roots),
          };
        });

        if (!initializedRef.current) {
          initializedRef.current = true;
          setHierarchy(metaData.defaultHierarchy);
        }
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить остатки');
      } finally {
        loadMoreRef.current = false;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [compact, hierarchy, offset, organizationGuid, search]
  );

  React.useEffect(() => {
    void load('initial');
  }, [load]);

  React.useEffect(() => {
    resetLazyData();
  }, [compact, hierarchy, organizationGuid, search, resetLazyData]);

  const canLoadMore = !!tree && tree.roots.length < tree.totalRoots;

  const loadRootChildren = React.useCallback(
    async (rootGuid: string, options?: { reset?: boolean }) => {
      const reset = options?.reset ?? false;
      const state = childrenByRootGuid[rootGuid];
      const key = `root:${rootGuid}`;

      if (loadingNodeIds[key]) return;
      if (!reset && state && !state.hasMore && state.items.length > 0) return;

      const offsetToLoad = reset ? 0 : state?.nextOffset ?? 0;

      setLoadingNodeIds((prev) => ({ ...prev, [key]: true }));
      try {
        const response = await getStockBalancesChildren({
          hierarchy,
          level: 'root',
          nodeGuid: rootGuid,
          organizationGuid: organizationGuid || undefined,
          search: search || undefined,
          offset: offsetToLoad,
          limit: ROOT_CHILDREN_PAGE_SIZE,
        });

        if (response.level === 'root') {
          setChildrenByRootGuid((prev) => {
            const previous = reset ? undefined : prev[rootGuid];
            const items = previous ? mergeById(previous.items, response.children) : response.children;
            return {
              ...prev,
              [rootGuid]: {
                items,
                total: response.totalChildren,
                hasMore: response.hasMore,
                nextOffset: response.offset + response.children.length,
              },
            };
          });
        }
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить дочерние группы');
      } finally {
        setLoadingNodeIds((prev) => ({ ...prev, [key]: false }));
      }
    },
    [childrenByRootGuid, hierarchy, loadingNodeIds, organizationGuid, search]
  );

  const loadMoreRootChildren = React.useCallback(
    async (rootGuid: string) => {
      await loadRootChildren(rootGuid);
    },
    [loadRootChildren]
  );

  const loadGroupLeaves = React.useCallback(
    async (rootGuid: string, groupGuid: string, options?: { reset?: boolean }) => {
      const reset = options?.reset ?? false;
      const key = `${rootGuid}:${groupGuid}`;
      const state = leavesByGroupKey[key];
      const loadingKey = `group:${key}`;

      if (loadingNodeIds[loadingKey]) return;
      if (!reset && state && !state.hasMore && state.items.length > 0) return;

      const offsetToLoad = reset ? 0 : state?.nextOffset ?? 0;

      setLoadingNodeIds((prev) => ({ ...prev, [loadingKey]: true }));
      try {
        const response = await getStockBalancesChildren({
          hierarchy,
          level: 'group',
          rootGuid,
          nodeGuid: groupGuid,
          organizationGuid: organizationGuid || undefined,
          search: search || undefined,
          offset: offsetToLoad,
          limit: GROUP_LEAVES_PAGE_SIZE,
        });

        if (response.level === 'group') {
          setLeavesByGroupKey((prev) => {
            const previous = reset ? undefined : prev[key];
            const items = previous ? mergeById(previous.items, response.leaves) : response.leaves;
            return {
              ...prev,
              [key]: {
                items,
                total: response.totalLeaves,
                hasMore: response.hasMore,
                nextOffset: response.offset + response.leaves.length,
              },
            };
          });
        }
      } catch (e: any) {
        setError(e?.message || 'Не удалось загрузить строки остатков');
      } finally {
        setLoadingNodeIds((prev) => ({ ...prev, [loadingKey]: false }));
      }
    },
    [hierarchy, leavesByGroupKey, loadingNodeIds, organizationGuid, search]
  );

  const loadMoreGroupLeaves = React.useCallback(
    async (rootGuid: string, groupGuid: string) => {
      await loadGroupLeaves(rootGuid, groupGuid);
    },
    [loadGroupLeaves]
  );

  return {
    meta,
    tree,
    loading,
    loadingMore,
    refreshing,
    error,
    hierarchy,
    setHierarchy: (value: StockHierarchy) => {
      setOffset(0);
      setHierarchy(value);
    },
    organizationGuid,
    setOrganizationGuid: (value: string) => {
      setOffset(0);
      setOrganizationGuid(value);
    },
    searchInput,
    setSearchInput,
    childrenByRootGuid,
    leavesByGroupKey,
    loadingNodeIds,
    loadRootChildren,
    loadMoreRootChildren,
    loadGroupLeaves,
    loadMoreGroupLeaves,
    refresh: () => {
      resetLazyData();
      return load('refresh');
    },
    loadMore: () => {
      if (!tree || loading || refreshing || loadingMore || !canLoadMore) return;
      loadMoreRef.current = true;
      setOffset(tree.roots.length);
    },
    canLoadMore,
  };
}
