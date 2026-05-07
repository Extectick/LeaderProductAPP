import { Alert } from 'react-native';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  createPermissionGroup,
  createRole,
  deletePermissionGroup,
  deleteRole,
  movePermissionToGroup,
  type PermissionGroupItem,
  type PermissionItem,
  type RoleItem,
  updatePermissionGroup,
  updateRole,
} from '@/utils/userService';

const SYSTEM_ROLE_NAMES = new Set(['user', 'employee', 'department_manager', 'admin']);
const GROUP_KEY_RE = /^[a-z0-9_]+$/;

export function useRolesActions(params: {
  newRoleName: string;
  newRoleDisplayName: string;
  newParentRoleId: number | null;
  setRoles: Dispatch<SetStateAction<RoleItem[]>>;
  setNewRoleName: Dispatch<SetStateAction<string>>;
  setNewRoleDisplayName: Dispatch<SetStateAction<string>>;
  setNewParentRoleId: Dispatch<SetStateAction<number | null>>;

  editRoleModal: RoleItem | null;
  editRoleDisplayName: string;
  editRoleParentId: number | null;
  setEditRoleModal: Dispatch<SetStateAction<RoleItem | null>>;

  newGroupKey: string;
  newGroupDisplayName: string;
  newGroupDescription: string;
  newGroupSortOrder: string;
  setGroups: Dispatch<SetStateAction<PermissionGroupItem[]>>;
  setNewGroupKey: Dispatch<SetStateAction<string>>;
  setNewGroupDisplayName: Dispatch<SetStateAction<string>>;
  setNewGroupDescription: Dispatch<SetStateAction<string>>;
  setNewGroupSortOrder: Dispatch<SetStateAction<string>>;

  editingGroup: PermissionGroupItem | null;
  editGroupDisplayName: string;
  editGroupDescription: string;
  editGroupSortOrder: string;
  setEditingGroup: Dispatch<SetStateAction<PermissionGroupItem | null>>;
  setEditGroupDisplayName: Dispatch<SetStateAction<string>>;
  setEditGroupDescription: Dispatch<SetStateAction<string>>;
  setEditGroupSortOrder: Dispatch<SetStateAction<string>>;

  movePermissionId: number | null;
  moveTargetGroupId: number | null;
  setPermissions: Dispatch<SetStateAction<PermissionItem[]>>;
  setMovePermissionId: Dispatch<SetStateAction<number | null>>;
  setMoveTargetGroupId: Dispatch<SetStateAction<number | null>>;

  loadData: () => Promise<void>;
  coreGroupKey: string;
}) {
  const {
    newRoleName,
    newRoleDisplayName,
    newParentRoleId,
    setRoles,
    setNewRoleName,
    setNewRoleDisplayName,
    setNewParentRoleId,
    editRoleModal,
    editRoleDisplayName,
    editRoleParentId,
    setEditRoleModal,
    newGroupKey,
    newGroupDisplayName,
    newGroupDescription,
    newGroupSortOrder,
    setGroups,
    setNewGroupKey,
    setNewGroupDisplayName,
    setNewGroupDescription,
    setNewGroupSortOrder,
    editingGroup,
    editGroupDisplayName,
    editGroupDescription,
    editGroupSortOrder,
    setEditingGroup,
    setEditGroupDisplayName,
    setEditGroupDescription,
    setEditGroupSortOrder,
    movePermissionId,
    moveTargetGroupId,
    setPermissions,
    setMovePermissionId,
    setMoveTargetGroupId,
    loadData,
    coreGroupKey,
  } = params;

  const handleCreateRole = useCallback(async () => {
    const name = newRoleName.trim();
    const displayName = newRoleDisplayName.trim();
    if (!name || !displayName) {
      Alert.alert('Ошибка', 'Заполните код и название роли');
      return;
    }
    try {
      const created = await createRole({ name, displayName, parentRoleId: newParentRoleId });
      setRoles((prev) => [...prev, { ...created, permissions: created.permissions || [] }]);
      setNewRoleName('');
      setNewRoleDisplayName('');
      setNewParentRoleId(null);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось создать роль');
    }
  }, [newRoleName, newRoleDisplayName, newParentRoleId, setNewParentRoleId, setNewRoleDisplayName, setNewRoleName, setRoles]);

  const handleUpdateRole = useCallback(async () => {
    if (!editRoleModal) return;
    const displayName = editRoleDisplayName.trim();
    if (!displayName) {
      Alert.alert('Ошибка', 'Название роли не может быть пустым');
      return;
    }

    const payload: { displayName?: string; parentRoleId?: number | null } = {};
    if ((editRoleModal.displayName || editRoleModal.name) !== displayName) payload.displayName = displayName;
    if ((editRoleModal.parentRole?.id ?? null) !== editRoleParentId) payload.parentRoleId = editRoleParentId;

    if (!Object.keys(payload).length) {
      setEditRoleModal(null);
      return;
    }

    try {
      const updated = await updateRole(editRoleModal.id, payload);
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      setEditRoleModal(null);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось обновить роль');
    }
  }, [editRoleDisplayName, editRoleModal, editRoleParentId, setEditRoleModal, setRoles]);

  const handleDeleteRole = useCallback(async (role: RoleItem) => {
    if (SYSTEM_ROLE_NAMES.has(role.name)) {
      Alert.alert('Недоступно', 'Базовую роль нельзя удалить');
      return;
    }
    Alert.alert('Удалить роль?', 'Действие необратимо', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRole(role.id);
            setRoles((prev) => prev.filter((r) => r.id !== role.id));
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message || 'Не удалось удалить роль');
          }
        },
      },
    ]);
  }, [setRoles]);

  const handleCreateGroup = useCallback(async () => {
    const key = newGroupKey.trim().toLowerCase();
    const displayName = newGroupDisplayName.trim();
    const description = newGroupDescription.trim();
    const sortOrder = Number(newGroupSortOrder || '500');

    if (!key || !GROUP_KEY_RE.test(key)) {
      Alert.alert('Ошибка', 'Ключ группы должен быть в формате lowercase snake_case');
      return;
    }
    if (!displayName) {
      Alert.alert('Ошибка', 'Название группы обязательно');
      return;
    }
    if (!Number.isFinite(sortOrder)) {
      Alert.alert('Ошибка', 'Некорректный порядок сортировки');
      return;
    }

    try {
      const created = await createPermissionGroup({ key, displayName, description, sortOrder: Math.trunc(sortOrder) });
      setGroups((prev) => [...prev, created]);
      setNewGroupKey('');
      setNewGroupDisplayName('');
      setNewGroupDescription('');
      setNewGroupSortOrder('500');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось создать группу прав');
    }
  }, [newGroupDescription, newGroupDisplayName, newGroupKey, newGroupSortOrder, setGroups, setNewGroupDescription, setNewGroupDisplayName, setNewGroupKey, setNewGroupSortOrder]);

  const openEditGroup = useCallback((group: PermissionGroupItem) => {
    setEditingGroup(group);
    setEditGroupDisplayName(group.displayName || group.key);
    setEditGroupDescription(group.description || '');
    setEditGroupSortOrder(String(group.sortOrder ?? 500));
  }, [setEditGroupDescription, setEditGroupDisplayName, setEditGroupSortOrder, setEditingGroup]);

  const handleUpdateGroup = useCallback(async () => {
    if (!editingGroup) return;
    const displayName = editGroupDisplayName.trim();
    const description = editGroupDescription.trim();
    const sortOrder = Number(editGroupSortOrder || '500');

    if (!displayName) {
      Alert.alert('Ошибка', 'Название группы обязательно');
      return;
    }
    if (!Number.isFinite(sortOrder)) {
      Alert.alert('Ошибка', 'Некорректный порядок сортировки');
      return;
    }

    try {
      const updated = await updatePermissionGroup(editingGroup.id, {
        displayName,
        description,
        sortOrder: Math.trunc(sortOrder),
      });
      setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setEditingGroup(updated);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось обновить группу');
    }
  }, [editGroupDescription, editGroupDisplayName, editGroupSortOrder, editingGroup, setEditingGroup, setGroups]);

  const handleDeleteGroup = useCallback(async (group: PermissionGroupItem) => {
    if (group.isSystem || group.key === coreGroupKey) {
      Alert.alert('Недоступно', 'Системную группу нельзя удалить');
      return;
    }
    Alert.alert('Удалить группу?', 'Права группы перейдут в "Основные".', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePermissionGroup(group.id);
            await loadData();
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message || 'Не удалось удалить группу');
          }
        },
      },
    ]);
  }, [coreGroupKey, loadData]);

  const handleMovePermission = useCallback(async () => {
    if (!movePermissionId || !moveTargetGroupId) {
      Alert.alert('Ошибка', 'Выберите право и целевую группу');
      return;
    }
    try {
      const updated = await movePermissionToGroup(movePermissionId, moveTargetGroupId);
      setPermissions((prev) => prev.map((p) => (p.id === updated.id ? { ...p, group: updated.group } : p)));
      setMovePermissionId(null);
      setMoveTargetGroupId(null);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось перенести право');
    }
  }, [movePermissionId, moveTargetGroupId, setMovePermissionId, setMoveTargetGroupId, setPermissions]);

  return {
    handleCreateRole,
    handleUpdateRole,
    handleDeleteRole,
    handleCreateGroup,
    openEditGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleMovePermission,
  };
}
