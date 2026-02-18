import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  PermissionGroupItem,
  PermissionItem,
  RoleItem,
  updateRolePermissions,
} from '@/utils/userService';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import { AdminStyles } from '@/components/admin/adminStyles';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';
import { useRolesData } from './useRolesData';
import { useRolesActions } from './useRolesActions';

type RolesTabProps = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
};

type PermissionSection = {
  key: string;
  group: PermissionGroupItem;
  permissions: PermissionItem[];
  selectedCount: number;
  inheritedCount: number;
  directSelectedCount: number;
  directTotal: number;
};

const SYSTEM_ROLE_NAMES = new Set(['user', 'employee', 'department_manager', 'admin']);

export default function RolesTab({ active, styles, colors }: RolesTabProps) {
  const tabBarSpacer = useTabBarSpacerHeight();
  const {
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
    coreGroup,
  } = useRolesData(active);

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDisplayName, setNewRoleDisplayName] = useState('');
  const [newParentRoleId, setNewParentRoleId] = useState<number | null>(null);

  const [editRoleModal, setEditRoleModal] = useState<RoleItem | null>(null);
  const [editRoleDisplayName, setEditRoleDisplayName] = useState('');
  const [editRoleParentId, setEditRoleParentId] = useState<number | null>(null);

  const [rolePermModal, setRolePermModal] = useState<RoleItem | null>(null);
  const [rolePermsDraft, setRolePermsDraft] = useState<string[]>([]);
  const [permissionSearch, setPermissionSearch] = useState('');
  const [expandedPermGroupKeys, setExpandedPermGroupKeys] = useState<Record<string, boolean>>({});

  const [expandedRoleIds, setExpandedRoleIds] = useState<Record<number, boolean>>({});

  const [groupsModalVisible, setGroupsModalVisible] = useState(false);
  const [newGroupKey, setNewGroupKey] = useState('');
  const [newGroupDisplayName, setNewGroupDisplayName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupSortOrder, setNewGroupSortOrder] = useState('500');

  const [editingGroup, setEditingGroup] = useState<PermissionGroupItem | null>(null);
  const [editGroupDisplayName, setEditGroupDisplayName] = useState('');
  const [editGroupDescription, setEditGroupDescription] = useState('');
  const [editGroupSortOrder, setEditGroupSortOrder] = useState('500');

  const [movePermissionId, setMovePermissionId] = useState<number | null>(null);
  const [moveTargetGroupId, setMoveTargetGroupId] = useState<number | null>(null);
  const [movePermissionSearch, setMovePermissionSearch] = useState('');

  const ui = useMemo(() => createUiStyles(colors), [colors]);

  useEffect(() => {
    setExpandedRoleIds((prev) => {
      const next: Record<number, boolean> = {};
      sortedRoles.forEach((role) => {
        next[role.id] = prev[role.id] ?? true;
      });
      return next;
    });
  }, [sortedRoles]);

  const inheritedPermissionInfo = useMemo(() => {
    const inherited = new Set<string>();
    const inheritedFrom = new Map<string, string>();
    if (!rolePermModal) return { inherited, inheritedFrom };

    let parentId = rolesById.get(rolePermModal.id)?.parentRole?.id ?? rolePermModal.parentRole?.id ?? null;
    const visited = new Set<number>();

    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = rolesById.get(parentId);
      if (!parent) break;
      const parentLabel = getRoleDisplayName(parent);
      (parent.permissions || []).forEach((perm) => {
        inherited.add(perm);
        if (!inheritedFrom.has(perm)) inheritedFrom.set(perm, parentLabel);
      });
      parentId = parent.parentRole?.id ?? null;
    }

    return { inherited, inheritedFrom };
  }, [rolePermModal, rolesById]);

  const filteredPermissions = useMemo(() => {
    const q = permissionSearch.trim().toLowerCase();
    if (!q) return permissions;
    return permissions.filter((p) => {
      const haystack = `${p.displayName || p.name} ${p.name} ${p.description || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [permissionSearch, permissions]);

  const permissionSections = useMemo<PermissionSection[]>(() => {
    const map = new Map<string, { group: PermissionGroupItem; permissions: PermissionItem[] }>();

    sortedGroups.forEach((group) => {
      map.set(group.key, { group, permissions: [] });
    });
    if (!map.has(coreGroup.key)) {
      map.set(coreGroup.key, { group: coreGroup, permissions: [] });
    }

    filteredPermissions.forEach((permission) => {
      const group = permission.group?.key ? permission.group : coreGroup;
      const bucket = map.get(group.key) ?? { group, permissions: [] };
      bucket.permissions.push(permission);
      map.set(group.key, bucket);
    });

    return Array.from(map.values())
      .map(({ group, permissions: groupPermissions }) => {
        const sorted = [...groupPermissions].sort((a, b) =>
          (a.displayName || a.name).localeCompare(b.displayName || b.name, 'ru', { sensitivity: 'base' })
        );
        const inheritedCount = sorted.filter((p) => inheritedPermissionInfo.inherited.has(p.name)).length;
        const selectedCount = sorted.filter((p) => inheritedPermissionInfo.inherited.has(p.name) || rolePermsDraft.includes(p.name)).length;
        const directTotal = sorted.length - inheritedCount;
        const directSelectedCount = sorted.filter((p) => !inheritedPermissionInfo.inherited.has(p.name) && rolePermsDraft.includes(p.name)).length;
        return {
          key: group.key,
          group,
          permissions: sorted,
          selectedCount,
          inheritedCount,
          directSelectedCount,
          directTotal,
        };
      })
      .filter((x) => x.permissions.length > 0)
      .sort((a, b) => {
        const ao = Number(a.group.sortOrder ?? 500);
        const bo = Number(b.group.sortOrder ?? 500);
        if (ao !== bo) return ao - bo;
        return (a.group.displayName || a.group.key).localeCompare(b.group.displayName || b.group.key, 'ru', { sensitivity: 'base' });
      });
  }, [coreGroup, filteredPermissions, inheritedPermissionInfo.inherited, rolePermsDraft, sortedGroups]);

  useEffect(() => {
    setExpandedPermGroupKeys((prev) => {
      const next: Record<string, boolean> = {};
      permissionSections.forEach((section) => {
        next[section.key] = prev[section.key] ?? true;
      });
      return next;
    });
  }, [permissionSections]);

  const toggleRoleExpanded = useCallback((roleId: number) => {
    setExpandedRoleIds((prev) => ({ ...prev, [roleId]: !(prev[roleId] ?? true) }));
  }, []);

  const togglePermission = useCallback(
    (permissionName: string) => {
      if (inheritedPermissionInfo.inherited.has(permissionName)) return;
      setRolePermsDraft((prev) =>
        prev.includes(permissionName)
          ? prev.filter((x) => x !== permissionName)
          : [...prev, permissionName]
      );
    },
    [inheritedPermissionInfo.inherited]
  );

  const applyDirectBulk = useCallback(
    (permissionNames: string[], enabled: boolean) => {
      setRolePermsDraft((prev) => {
        const next = new Set(prev);
        permissionNames.forEach((name) => {
          if (inheritedPermissionInfo.inherited.has(name)) return;
          if (enabled) next.add(name);
          else next.delete(name);
        });
        return Array.from(next);
      });
    },
    [inheritedPermissionInfo.inherited]
  );
  const {
    handleCreateRole,
    handleUpdateRole,
    handleDeleteRole,
    handleCreateGroup,
    openEditGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleMovePermission,
  } = useRolesActions({
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
    coreGroupKey: coreGroup.key,
  });

  const filteredPermissionsForMove = useMemo(() => {
    const q = movePermissionSearch.trim().toLowerCase();
    const sorted = [...permissions].sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name, 'ru', { sensitivity: 'base' })
    );
    if (!q) return sorted;
    return sorted.filter((p) => `${p.displayName || p.name} ${p.name}`.toLowerCase().includes(q));
  }, [movePermissionSearch, permissions]);

  const renderRoleNode = useCallback(
    (role: RoleItem, depth: number): React.ReactNode => {
      const children = childrenByParentId.get(role.id) ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = expandedRoleIds[role.id] ?? true;

      return (
        <View key={`role-${role.id}`} style={{ gap: 6, marginLeft: depth * 18 }}>
          <View style={[styles.itemRow, ui.nodeCard, depth > 0 && ui.nodeCardNested]}>
            <View style={ui.nodeMain}>
              {hasChildren ? (
                <Pressable onPress={() => toggleRoleExpanded(role.id)} style={ui.expandBtn}>
                  <Ionicons name={isExpanded ? 'chevron-down-outline' : 'chevron-forward-outline'} size={16} color={colors.secondaryText} />
                </Pressable>
              ) : (
                <View style={ui.expandSpacer} />
              )}
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.9}
                onPress={() => {
                  setRolePermModal(role);
                  setRolePermsDraft(role.permissions || []);
                  setPermissionSearch('');
                }}
              >
                <View style={ui.titleRow}>
                  <Text style={styles.nameText} numberOfLines={2}>{getRoleDisplayName(role)}</Text>
                  {hasChildren ? (
                    <View style={ui.countBadge}><Text style={ui.countBadgeText}>{children.length}</Text></View>
                  ) : null}
                </View>
                <Text style={ui.metaText}>Код: {role.name}</Text>
                <Text style={ui.metaText}>Прямых прав: {(role.permissions || []).length}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => {
                setEditRoleModal(role);
                setEditRoleDisplayName(role.displayName || role.name);
                setEditRoleParentId(role.parentRole?.id ?? null);
              }}>
                <Ionicons name="pencil-outline" size={18} color={colors.text} />
              </TouchableOpacity>
              {!SYSTEM_ROLE_NAMES.has(role.name) ? (
                <TouchableOpacity style={styles.iconBtnDanger} onPress={() => handleDeleteRole(role)}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
              ) : (
                <View style={[styles.iconBtn, { opacity: 0.4 }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.secondaryText} />
                </View>
              )}
            </View>
          </View>
          {hasChildren && isExpanded ? children.map((child) => renderRoleNode(child, depth + 1)) : null}
        </View>
      );
    },
    [childrenByParentId, colors.secondaryText, colors.text, expandedRoleIds, handleDeleteRole, styles.iconBtn, styles.iconBtnDanger, styles.itemRow, styles.nameText, toggleRoleExpanded, ui]
  );

  if (!active) return <View style={{ display: 'none' }} />;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: tabBarSpacer + 12 }}>
        <View style={styles.toolbarCard}>
          <View style={{ gap: 8 }}>
            <TextInput
              placeholder="Код роли (например, support_manager)"
              value={newRoleName}
              onChangeText={setNewRoleName}
              style={styles.input}
              autoCapitalize="none"
            />
            <TextInput
              placeholder="Название роли (рус.)"
              value={newRoleDisplayName}
              onChangeText={setNewRoleDisplayName}
              style={styles.input}
            />
            <Text style={{ color: colors.secondaryText, fontWeight: '700' }}>Родительская роль</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable onPress={() => setNewParentRoleId(null)} style={[styles.optionChip, newParentRoleId === null && styles.optionChipActive]}>
                <Text style={[styles.optionText, newParentRoleId === null && styles.optionTextActive]}>Без родителя</Text>
              </Pressable>
              {roles.map((role) => (
                <Pressable key={`new-parent-${role.id}`} onPress={() => setNewParentRoleId(role.id)} style={[styles.optionChip, newParentRoleId === role.id && styles.optionChipActive]}>
                  <Text style={[styles.optionText, newParentRoleId === role.id && styles.optionTextActive]}>{getRoleDisplayName(role)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.smallBtn, { flex: 1, backgroundColor: colors.tint }]} onPress={handleCreateRole}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Добавить роль</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, { flex: 1, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}
                onPress={() => setGroupsModalVisible(true)}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Группы прав</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={ui.headerRow}>
          <Text style={ui.treeTitle}>Иерархия ролей</Text>
          <View style={ui.headerActions}>
            <Pressable onPress={() => {
              const next: Record<number, boolean> = {};
              sortedRoles.forEach((r) => { next[r.id] = true; });
              setExpandedRoleIds(next);
            }} style={ui.headerActionBtn}>
              <Text style={ui.headerActionText}>Развернуть</Text>
            </Pressable>
            <Pressable onPress={() => {
              const next: Record<number, boolean> = {};
              sortedRoles.forEach((r) => { next[r.id] = false; });
              setExpandedRoleIds(next);
            }} style={ui.headerActionBtn}>
              <Text style={ui.headerActionText}>Свернуть</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          {rootRoles.map((root) => renderRoleNode(root, 0))}
          {!rootRoles.length ? <Text style={{ color: colors.secondaryText }}>Роли не найдены</Text> : null}
        </View>
      </ScrollView>

      <Modal visible={active && !!rolePermModal} transparent animationType="fade" onRequestClose={() => setRolePermModal(null)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setRolePermModal(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '88%', width: '92%', maxWidth: 860, backgroundColor: colors.cardBackground }] }>
            <Text style={styles.title}>Права роли {getRoleDisplayName(rolePermModal)}</Text>
            {!!inheritedPermissionInfo.inherited.size ? (
              <Text style={{ color: colors.secondaryText, marginBottom: 8 }}>Унаследованные права нельзя отключить вручную.</Text>
            ) : null}

            <TextInput
              style={[styles.input, { marginBottom: 8 }]}
              value={permissionSearch}
              onChangeText={setPermissionSearch}
              placeholder="Поиск прав"
              autoCapitalize="none"
            />

            <View style={ui.bulkRow}>
              <Pressable style={ui.bulkBtn} onPress={() => applyDirectBulk(permissions.map((p) => p.name), true)}>
                <Text style={ui.bulkBtnText}>Включить все прямые</Text>
              </Pressable>
              <Pressable style={ui.bulkBtn} onPress={() => applyDirectBulk(permissions.map((p) => p.name), false)}>
                <Text style={ui.bulkBtnText}>Снять все прямые</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 430 }} contentContainerStyle={{ gap: 8 }}>
              {permissionSections.map((section) => {
                const expanded = expandedPermGroupKeys[section.key] ?? true;
                const serviceLabel = section.group.service?.name
                  ? `Сервис: ${section.group.service.name}`
                  : section.group.key.startsWith('service_')
                    ? `Сервис: ${section.group.key.replace(/^service_/, '')}`
                    : '';

                return (
                  <View key={section.key} style={ui.groupCard}>
                    <Pressable onPress={() => setExpandedPermGroupKeys((prev) => ({ ...prev, [section.key]: !(prev[section.key] ?? true) }))} style={ui.groupHeader}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={ui.groupTitle}>{section.group.displayName || section.group.key}</Text>
                        {!!section.group.description ? <Text style={ui.groupDescription}>{section.group.description}</Text> : null}
                      </View>
                      <View style={ui.groupHeaderRight}>
                        {section.group.isSystem ? <View style={ui.groupBadge}><Text style={ui.groupBadgeText}>Системная</Text></View> : null}
                        {!!serviceLabel ? <View style={ui.groupBadge}><Text style={ui.groupBadgeText}>{serviceLabel}</Text></View> : null}
                        <Text style={ui.groupCounter}>{section.selectedCount}/{section.permissions.length}</Text>
                        <Ionicons name={expanded ? 'chevron-down-outline' : 'chevron-forward-outline'} size={16} color={colors.secondaryText} />
                      </View>
                    </Pressable>
                    {expanded ? (
                      <>
                        <View style={ui.groupStatsRow}>
                          <Text style={ui.groupStatsText}>Прямые: {section.directSelectedCount}/{section.directTotal}</Text>
                          <Text style={ui.groupStatsText}>Унаследовано: {section.inheritedCount}</Text>
                        </View>
                        <View style={ui.groupActionRow}>
                          <Pressable style={ui.groupActionBtn} onPress={() => applyDirectBulk(section.permissions.map((p) => p.name), true)}>
                            <Text style={ui.groupActionBtnText}>Включить прямые</Text>
                          </Pressable>
                          <Pressable style={ui.groupActionBtn} onPress={() => applyDirectBulk(section.permissions.map((p) => p.name), false)}>
                            <Text style={ui.groupActionBtnText}>Снять прямые</Text>
                          </Pressable>
                        </View>

                        {section.permissions.map((p) => {
                          const isInherited = inheritedPermissionInfo.inherited.has(p.name);
                          const activePerm = rolePermsDraft.includes(p.name) || isInherited;
                          return (
                            <Pressable key={p.name} onPress={() => togglePermission(p.name)} disabled={isInherited} style={[styles.permRow, activePerm && styles.permRowActive]}>
                              <Ionicons
                                name={isInherited ? 'lock-closed-outline' : activePerm ? 'checkbox-outline' : 'square-outline'}
                                size={20}
                                color={activePerm ? colors.tint : colors.secondaryText}
                              />
                              <View style={{ flex: 1, gap: 2 }}>
                                <Text style={[styles.permText, activePerm && styles.permTextActive]} numberOfLines={2}>
                                  {p.displayName || p.name}
                                </Text>
                                <Text style={{ color: colors.secondaryText, fontSize: 12 }} numberOfLines={3}>
                                  {p.description || 'Описание отсутствует'}
                                </Text>
                                <Text style={{ color: colors.secondaryText, fontSize: 11 }} numberOfLines={1}>{p.name}</Text>
                                {isInherited ? (
                                  <Text style={{ color: colors.secondaryText, fontSize: 11 }} numberOfLines={1}>
                                    Унаследовано от: {inheritedPermissionInfo.inheritedFrom.get(p.name) || 'родительской роли'}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </>
                    ) : null}
                  </View>
                );
              })}

              {!permissionSections.length ? <Text style={{ color: colors.secondaryText }}>Права не найдены</Text> : null}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalClose, { backgroundColor: colors.tint }]}
              onPress={async () => {
                if (!rolePermModal) return;
                try {
                  await updateRolePermissions(rolePermModal.id, rolePermsDraft);
                  setRoles((prev) => prev.map((r) => (r.id === rolePermModal.id ? { ...r, permissions: rolePermsDraft } : r)));
                  setRolePermModal(null);
                } catch (e: any) {
                  Alert.alert('Ошибка', e?.message || 'Не удалось сохранить права');
                }
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={active && groupsModalVisible} transparent animationType="fade" onRequestClose={() => setGroupsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setGroupsModalVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '88%', width: '92%', maxWidth: 980, backgroundColor: colors.cardBackground, gap: 12 }] }>
            <Text style={styles.title}>Группы прав</Text>

            <View style={ui.managerCard}>
              <Text style={ui.managerTitle}>Создать группу</Text>
              <TextInput value={newGroupKey} onChangeText={setNewGroupKey} style={styles.input} placeholder="Ключ группы" autoCapitalize="none" />
              <TextInput value={newGroupDisplayName} onChangeText={setNewGroupDisplayName} style={styles.input} placeholder="Название группы" />
              <TextInput value={newGroupDescription} onChangeText={setNewGroupDescription} style={styles.input} placeholder="Описание" />
              <TextInput value={newGroupSortOrder} onChangeText={setNewGroupSortOrder} style={styles.input} placeholder="Порядок сортировки" keyboardType="numeric" />
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.tint }]} onPress={handleCreateGroup}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Создать</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 8 }}>
              {sortedGroups.map((group) => (
                <View key={`group-${group.id}`} style={ui.groupManagerRow}>
                  <Pressable style={{ flex: 1, gap: 2 }} onPress={() => openEditGroup(group)}>
                    <Text style={ui.groupManagerTitle}>{group.displayName || group.key}</Text>
                    <Text style={ui.groupManagerMeta}>Ключ: {group.key}</Text>
                  </Pressable>
                  {group.isSystem ? <View style={ui.groupBadge}><Text style={ui.groupBadgeText}>Системная</Text></View> : null}
                  <TouchableOpacity style={styles.iconBtn} onPress={() => openEditGroup(group)}>
                    <Ionicons name="pencil-outline" size={18} color={colors.text} />
                  </TouchableOpacity>
                  {!group.isSystem && group.key !== coreGroup.key ? (
                    <TouchableOpacity style={styles.iconBtnDanger} onPress={() => handleDeleteGroup(group)}>
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.iconBtn, { opacity: 0.4 }]}>
                      <Ionicons name="lock-closed-outline" size={18} color={colors.secondaryText} />
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>

            {editingGroup ? (
              <View style={ui.managerCard}>
                <Text style={ui.managerTitle}>Редактирование: {editingGroup.key}</Text>
                <TextInput value={editGroupDisplayName} onChangeText={setEditGroupDisplayName} style={styles.input} placeholder="Название" />
                <TextInput value={editGroupDescription} onChangeText={setEditGroupDescription} style={styles.input} placeholder="Описание" />
                <TextInput value={editGroupSortOrder} onChangeText={setEditGroupSortOrder} style={styles.input} placeholder="Порядок" keyboardType="numeric" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.smallBtn, { flex: 1, backgroundColor: colors.inputBorder }]} onPress={() => setEditingGroup(null)}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, { flex: 1, backgroundColor: colors.tint }]} onPress={handleUpdateGroup}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Сохранить</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <View style={ui.managerCard}>
              <Text style={ui.managerTitle}>Перенос права в группу</Text>
              <TextInput value={movePermissionSearch} onChangeText={setMovePermissionSearch} style={styles.input} placeholder="Поиск права" autoCapitalize="none" />
              <ScrollView style={{ maxHeight: 120 }} contentContainerStyle={{ gap: 6 }}>
                {filteredPermissionsForMove.map((permission) => (
                  <Pressable
                    key={`move-perm-${permission.id}`}
                    onPress={() => setMovePermissionId(permission.id)}
                    style={[ui.selectionRow, movePermissionId === permission.id && ui.selectionRowActive]}
                  >
                    <Text style={[ui.selectionTitle, movePermissionId === permission.id && ui.selectionTitleActive]}>
                      {permission.displayName || permission.name}
                    </Text>
                    <Text style={ui.selectionMeta}>{permission.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {sortedGroups.map((group) => (
                  <Pressable key={`move-group-${group.id}`} onPress={() => setMoveTargetGroupId(group.id)} style={[styles.optionChip, moveTargetGroupId === group.id && styles.optionChipActive]}>
                    <Text style={[styles.optionText, moveTargetGroupId === group.id && styles.optionTextActive]}>{group.displayName || group.key}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.tint }]} onPress={handleMovePermission}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Перенести право</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.modalClose} onPress={() => setGroupsModalVisible(false)}>
              <Text style={styles.modalCloseText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={active && !!editRoleModal} transparent animationType="fade" onRequestClose={() => setEditRoleModal(null)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setEditRoleModal(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { width: '90%', maxWidth: 720, backgroundColor: colors.cardBackground, gap: 10 }] }>
            <Text style={styles.title}>Редактирование роли</Text>
            <Text style={{ color: colors.secondaryText }}>Код роли: {editRoleModal?.name}</Text>
            <TextInput value={editRoleDisplayName} onChangeText={setEditRoleDisplayName} style={styles.input} placeholder="Название роли (рус.)" />
            <Text style={{ color: colors.secondaryText, fontWeight: '700' }}>Родительская роль</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable onPress={() => setEditRoleParentId(null)} style={[styles.optionChip, editRoleParentId === null && styles.optionChipActive]}>
                <Text style={[styles.optionText, editRoleParentId === null && styles.optionTextActive]}>Без родителя</Text>
              </Pressable>
              {roles.filter((role) => role.id !== editRoleModal?.id).map((role) => (
                <Pressable key={`edit-parent-${role.id}`} onPress={() => setEditRoleParentId(role.id)} style={[styles.optionChip, editRoleParentId === role.id && styles.optionChipActive]}>
                  <Text style={[styles.optionText, editRoleParentId === role.id && styles.optionTextActive]}>{getRoleDisplayName(role)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.smallBtn, { flex: 1, backgroundColor: colors.inputBorder }]} onPress={() => setEditRoleModal(null)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallBtn, { flex: 1, backgroundColor: colors.tint }]} onPress={handleUpdateRole}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createUiStyles(colors: any) {
  return StyleSheet.create({
    headerRow: { marginTop: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    treeTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerActionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground },
    headerActionText: { color: colors.secondaryText, fontWeight: '700', fontSize: 12 },
    nodeCard: { paddingVertical: 8, paddingLeft: 10, borderRadius: 12 },
    nodeCardNested: { borderLeftWidth: 3, borderLeftColor: colors.tint + '55' },
    nodeMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
    expandBtn: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground },
    expandSpacer: { width: 24, height: 24 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    countBadge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint + '1f', borderWidth: 1, borderColor: colors.tint + '55' },
    countBadgeText: { fontSize: 11, fontWeight: '800', color: colors.tint },
    metaText: { color: colors.secondaryText, fontSize: 12, marginTop: 2 },
    bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    bulkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground },
    bulkBtnText: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' },
    groupCard: { borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, borderRadius: 12, padding: 8, gap: 8 },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    groupHeaderRight: { alignItems: 'flex-end', gap: 4 },
    groupTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
    groupDescription: { color: colors.secondaryText, fontSize: 12 },
    groupCounter: { color: colors.tint, fontWeight: '800', fontSize: 12 },
    groupBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.cardBackground },
    groupBadgeText: { color: colors.secondaryText, fontSize: 11, fontWeight: '700' },
    groupStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    groupStatsText: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' },
    groupActionRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    groupActionBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.cardBackground },
    groupActionBtnText: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' },
    managerCard: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, backgroundColor: colors.inputBackground, padding: 10, gap: 8 },
    managerTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
    groupManagerRow: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, padding: 10, backgroundColor: colors.inputBackground, flexDirection: 'row', alignItems: 'center', gap: 8 },
    groupManagerTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
    groupManagerMeta: { color: colors.secondaryText, fontSize: 12 },
    selectionRow: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, backgroundColor: colors.cardBackground, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
    selectionRowActive: { borderColor: colors.tint, backgroundColor: colors.tint + '1f' },
    selectionTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
    selectionTitleActive: { color: colors.tint },
    selectionMeta: { color: colors.secondaryText, fontSize: 11 },
  });
}
