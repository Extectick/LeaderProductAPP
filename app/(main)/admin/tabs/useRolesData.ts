import { Alert } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPermissionGroups,
  getPermissions,
  getRoles,
  type PermissionGroupItem,
  type PermissionItem,
  type RoleItem,
} from '@/utils/userService';
import { getRoleDisplayName } from '@/utils/rbacLabels';

const CORE_GROUP: PermissionGroupItem = {
  id: 0,
  key: 'core',
  displayName: 'Основные',
  description: 'Базовые права пользователя и общесистемные действия.',
  isSystem: true,
  sortOrder: 10,
  serviceId: null,
  service: null,
};

export function useRolesData(active: boolean) {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [groups, setGroups] = useState<PermissionGroupItem[]>([]);

  const sortedRoles = useMemo(
    () =>
      [...roles].sort((a, b) =>
        getRoleDisplayName(a).localeCompare(getRoleDisplayName(b), 'ru', { sensitivity: 'base' })
      ),
    [roles]
  );

  const sortedGroups = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const ao = Number(a.sortOrder ?? 500);
        const bo = Number(b.sortOrder ?? 500);
        if (ao !== bo) return ao - bo;
        return (a.displayName || a.key).localeCompare(b.displayName || b.key, 'ru', {
          sensitivity: 'base',
        });
      }),
    [groups]
  );

  const rolesById = useMemo(() => new Map(sortedRoles.map((r) => [r.id, r])), [sortedRoles]);
  const childrenByParentId = useMemo(() => {
    const map = new Map<number | null, RoleItem[]>();
    for (const role of sortedRoles) {
      const parentId = role.parentRole?.id && rolesById.has(role.parentRole.id) ? role.parentRole.id : null;
      const list = map.get(parentId) ?? [];
      list.push(role);
      map.set(parentId, list);
    }
    return map;
  }, [rolesById, sortedRoles]);

  const rootRoles = useMemo(() => childrenByParentId.get(null) ?? [], [childrenByParentId]);

  const loadData = useCallback(async () => {
    try {
      const [loadedRoles, loadedPermissions, loadedGroups] = await Promise.all([
        getRoles(),
        getPermissions(),
        getPermissionGroups(),
      ]);
      setRoles(loadedRoles);
      setPermissions(loadedPermissions);
      setGroups(loadedGroups);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить данные');
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadData();
  }, [active, loadData]);

  return {
    roles,
    setRoles,
    permissions,
    setPermissions,
    groups,
    setGroups,
    sortedRoles,
    sortedGroups,
    rolesById,
    childrenByParentId,
    rootRoles,
    loadData,
    coreGroup: CORE_GROUP,
  };
}
