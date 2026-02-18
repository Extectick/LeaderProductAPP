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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
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
        page,
        limit,
        moderationState: filters.moderation,
        online: filters.online,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      });
      const nextItems = res.items || [];
      setItems(nextItems);
      setTotal(res.meta?.total || 0);
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
  }, [active, filters.moderation, filters.online, filters.sortBy, filters.sortDir, limit, page, search]);

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
    page,
    setPage,
    limit,
    search,
    setSearch,
    loading,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    loadData,
  };
}
