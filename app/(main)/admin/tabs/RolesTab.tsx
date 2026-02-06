import React, { useCallback, useEffect, useState } from 'react';
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
  createRole,
  deleteRole,
  getPermissions,
  getRoles,
  RoleItem,
  updateRole,
  updateRolePermissions,
} from '@/utils/userService';

import { AdminStyles } from '@/components/admin/adminStyles';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';

type RolesTabProps = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
};

export default function RolesTab({ active, styles, colors }: RolesTabProps) {
  const tabBarSpacer = useTabBarSpacerHeight();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [editRoleId, setEditRoleId] = useState<number | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [rolePermModal, setRolePermModal] = useState<RoleItem | null>(null);
  const [rolePermsDraft, setRolePermsDraft] = useState<string[]>([]);

  const loadRoles = useCallback(async () => {
    try {
      const [r, perms] = await Promise.all([getRoles(), getPermissions()]);
      setRoles(r);
      setPermissions(perms);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить роли');
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadRoles();
  }, [active, loadRoles]);

  const handleCreateRole = async () => {
    const name = newRoleName.trim();
    if (!name) return;
    try {
      const created = await createRole({ name });
      if (!created || created.id == null) return;
      setRoles((prev) => [...prev, { id: created.id, name: created.name, parentRole: null, permissions: [] }]);
      setNewRoleName('');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось создать роль');
    }
  };

  const handleUpdateRole = async () => {
    if (!editRoleId) return;
    const name = editRoleName.trim();
    if (!name || roles.find((r) => r.id === editRoleId)?.name === name) {
      setEditRoleId(null);
      setEditRoleName('');
      return;
    }
    try {
      const updated = await updateRole(editRoleId, { name });
      if (updated && updated.id != null) {
        setRoles((prev) => prev.map((r) => (r.id === updated.id ? { ...r, name: updated.name } : r)));
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось обновить роль');
    } finally {
      setEditRoleId(null);
      setEditRoleName('');
    }
  };

  const handleDeleteRole = async (id: number) => {
    Alert.alert('Удалить роль?', 'Действие необратимо', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRole(id);
            setRoles((prev) => prev.filter((r) => r.id !== id));
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message || 'Не удалось удалить роль');
          }
        },
      },
    ]);
  };

  if (!active) {
    return <View style={{ display: 'none' }} />;
  }

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: tabBarSpacer + 12 }}>
        <View style={styles.toolbarCard}>
          <View style={styles.row}>
            <TextInput
              placeholder="Новая роль"
              value={newRoleName}
              onChangeText={setNewRoleName}
              style={[styles.input, { flex: 1 }]}
            />
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.tint }]} onPress={handleCreateRole}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Добавить</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {roles.map((r) => {
            const isEditing = editRoleId === r.id;
            return (
              <View key={r.id} style={styles.itemRow}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={0.9}
                  onPress={() => {
                    setRolePermModal(r);
                  setRolePermsDraft(r.permissions || []);
                }}
              >
                {isEditing ? (
                  <TextInput
                    value={editRoleName}
                    onChangeText={setEditRoleName}
                    style={[styles.input, styles.nameInputFlex]}
                    autoFocus
                    onSubmitEditing={handleUpdateRole}
                  />
                ) : (
                  <Text style={styles.nameText} numberOfLines={2}>
                    {r.name}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
                {isEditing ? (
                  <TouchableOpacity style={styles.iconBtn} onPress={handleUpdateRole}>
                    <Ionicons name="checkmark-outline" size={18} color={colors.text} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => {
                      setEditRoleId(r.id);
                      setEditRoleName(r.name);
                    }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors.text} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.iconBtnDanger} onPress={() => handleDeleteRole(r.id)}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={active && !!rolePermModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRolePermModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setRolePermModal(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View
            style={[
              styles.modalCard,
              { maxHeight: '80%', width: '90%', maxWidth: 720, backgroundColor: colors.cardBackground },
            ]}
          >
            <Text style={styles.title}>Права роли {rolePermModal?.name}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {permissions.map((p) => {
                const activePerm = rolePermsDraft.includes(p);
                return (
                  <Pressable
                    key={p}
                    onPress={() =>
                      setRolePermsDraft((prev) =>
                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                      )
                    }
                    style={[styles.permRow, activePerm && styles.permRowActive]}
                  >
                    <Ionicons
                      name={activePerm ? 'checkbox-outline' : 'square-outline'}
                      size={20}
                      color={activePerm ? colors.tint : colors.secondaryText}
                    />
                    <Text style={[styles.permText, activePerm && styles.permTextActive]} numberOfLines={2}>
                      {p}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalClose, { backgroundColor: colors.tint }]}
              onPress={async () => {
                if (!rolePermModal) return;
                try {
                  await updateRolePermissions(rolePermModal.id, rolePermsDraft);
                  setRoles((prev) =>
                    prev.map((r) => (r.id === rolePermModal.id ? { ...r, permissions: rolePermsDraft } : r))
                  );
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
    </>
  );
}
