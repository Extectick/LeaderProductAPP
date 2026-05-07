import { Alert } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  type AdminModerationState,
  type AdminUsersListItem,
  type Department,
  getAdminUsersPage,
  getDepartments,
  getRoles,
  type RoleItem,
} from '@/utils/userService';

export type UsersFilterState = {
  moderation: 'all' | AdminModerationState;
  online: 'all' | 'online' | 'offline';
  sortBy: 'lastSeenAt' | 'name' | 'status';
  sortDir: 'asc' | 'desc';
};

export function useUsersData(active: boolean) {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<AdminUsersListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<UsersFilterState>({
    moderation: 'all',
    online: 'all',
    sortBy: 'lastSeenAt',
    sortDir: 'desc',
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadRefs = useCallback(async () => {
    const [r, d] = await Promise.all([getRoles(), getDepartments()]);
    setRoles(r);
    setDepartments(d);
  }, []);

  const loadData = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const res = await getAdminUsersPage({
        search,
        page: 1,
        limit,
        moderationState: filters.moderation,
        online: filters.online,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      });
      const nextItems = res.items || [];
      setItems(nextItems);
      setTotal(res.meta?.total || 0);
      setPage(1);
      setHasNextPage(Boolean(res.meta?.hasNext));
      setSelectedId((prev) => {
        if (!nextItems.length) return null;
        if (!prev || !nextItems.some((x) => x.id === prev)) return nextItems[0].id;
        return prev;
      });
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }, [active, filters.moderation, filters.online, filters.sortBy, filters.sortDir, limit, search]);

  const loadMore = useCallback(async () => {
    if (!active || loading || loadingMore || !hasNextPage) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await getAdminUsersPage({
        search,
        page: nextPage,
        limit,
        moderationState: filters.moderation,
        online: filters.online,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      });
      const appendedItems = res.items || [];
      setItems((prev) => {
        if (!appendedItems.length) return prev;
        const seen = new Set(prev.map((item) => item.id));
        const uniqueNext = appendedItems.filter((item) => !seen.has(item.id));
        return uniqueNext.length ? [...prev, ...uniqueNext] : prev;
      });
      setTotal(res.meta?.total || 0);
      setPage(res.meta?.page || nextPage);
      setHasNextPage(Boolean(res.meta?.hasNext));
      setSelectedId((prev) => prev ?? appendedItems[0]?.id ?? null);
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить пользователей');
    } finally {
      setLoadingMore(false);
    }
  }, [
    active,
    filters.moderation,
    filters.online,
    filters.sortBy,
    filters.sortDir,
    hasNextPage,
    limit,
    loading,
    loadingMore,
    page,
    search,
  ]);

  useEffect(() => {
    if (!active) return;
    void loadRefs();
  }, [active, loadRefs]);

  useEffect(() => {
    if (!active) return;
    void loadData();
  }, [active, loadData]);

  return {
    roles,
    departments,
    items,
    total,
    hasNextPage,
    search,
    setSearch,
    loading,
    loadingMore,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    loadData,
    loadMore,
  };
}
