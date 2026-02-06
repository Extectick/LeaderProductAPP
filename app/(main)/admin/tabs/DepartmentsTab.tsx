import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  createDepartment,
  deleteDepartment,
  Department,
  getDepartmentUsers,
  getDepartments,
  AdminUserItem,
  updateDepartment,
} from '@/utils/userService';

import { AdminStyles } from '@/components/admin/adminStyles';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';

type DepartmentsTabProps = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
  onOpenUser: (userId: number) => void;
};

export default function DepartmentsTab({ active, styles, colors, onOpenUser }: DepartmentsTabProps) {
  const tabBarSpacer = useTabBarSpacerHeight();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [deptUsersModal, setDeptUsersModal] = useState<{ id: number; name: string } | null>(null);
  const [deptUsers, setDeptUsers] = useState<AdminUserItem[]>([]);
  const [deptUsersLoading, setDeptUsersLoading] = useState(false);

  const loadDepartments = useCallback(async () => {
    try {
      const data = await getDepartments();
      setDepartments(data);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить отделы');
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadDepartments();
  }, [active, loadDepartments]);

  const handleCreateDepartment = async () => {
    const name = newDeptName.trim();
    if (!name) return;
    try {
      const updated = await createDepartment(name);
      if (Array.isArray(updated) && updated.length > 1) {
        setDepartments(updated);
      } else {
        setDepartments((prev) => [
          ...prev,
          ...(Array.isArray(updated) && updated.length === 1 ? updated : [{ id: Date.now(), name }]),
        ]);
      }
      setNewDeptName('');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось создать отдел');
    }
  };

  const handleUpdateDepartment = async () => {
    if (!editDeptId) return;
    const name = editDeptName.trim();
    if (!name || departments.find((d) => d.id === editDeptId)?.name === name) {
      setEditDeptId(null);
      setEditDeptName('');
      return;
    }
    try {
      const updated = await updateDepartment(editDeptId, name);
      if (Array.isArray(updated) && updated.length > 1) {
        setDepartments(updated);
      } else {
        setDepartments((prev) => prev.map((d) => (d.id === editDeptId ? { ...d, name } : d)));
      }
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось обновить отдел');
    } finally {
      setEditDeptId(null);
      setEditDeptName('');
    }
  };

  const handleDeleteDepartment = async (id: number) => {
    Alert.alert('Удалить отдел?', 'Действие необратимо', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = await deleteDepartment(id);
            if (Array.isArray(updated) && updated.length > 1) {
              setDepartments(updated);
            } else {
              setDepartments((prev) => prev.filter((d) => d.id !== id));
            }
          } catch (e: any) {
            Alert.alert('Ошибка', e?.message || 'Не удалось удалить отдел');
          }
        },
      },
    ]);
  };

  useEffect(() => {
    if (!deptUsersModal) {
      setDeptUsers([]);
      return;
    }
    setDeptUsersLoading(true);
    getDepartmentUsers(deptUsersModal.id)
      .then(setDeptUsers)
      .catch((e: any) => Alert.alert('Ошибка', e?.message || 'Не удалось загрузить пользователей отдела'))
      .finally(() => setDeptUsersLoading(false));
  }, [deptUsersModal]);

  if (!active) {
    return <View style={{ display: 'none' }} />;
  }

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: tabBarSpacer + 12 }}>
        <View style={styles.toolbarCard}>
          <View style={styles.row}>
            <TextInput
              placeholder="Новый отдел"
              value={newDeptName}
              onChangeText={setNewDeptName}
              style={[styles.input, { flex: 1 }]}
            />
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.tint }]} onPress={handleCreateDepartment}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Добавить</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {departments.map((d) => {
            const isEditing = editDeptId === d.id;
            return (
              <View key={d.id} style={styles.itemRow}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={0.9}
                  onPress={() => setDeptUsersModal({ id: d.id, name: d.name })}
                >
                {isEditing ? (
                  <TextInput
                    value={editDeptName}
                    onChangeText={setEditDeptName}
                    style={[styles.input, styles.nameInputFlex]}
                    autoFocus
                    onSubmitEditing={handleUpdateDepartment}
                  />
                ) : (
                  <Text style={styles.nameText} numberOfLines={2}>
                    {d.name}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
                {isEditing ? (
                  <TouchableOpacity style={styles.iconBtn} onPress={handleUpdateDepartment}>
                    <Ionicons name="checkmark-outline" size={18} color={colors.text} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => {
                      setEditDeptId(d.id);
                      setEditDeptName(d.name);
                    }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors.text} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.iconBtnDanger} onPress={() => handleDeleteDepartment(d.id)}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={active && !!deptUsersModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeptUsersModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setDeptUsersModal(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View
            style={[
              styles.modalCard,
              { maxHeight: '80%', width: '90%', maxWidth: 600, backgroundColor: colors.cardBackground },
            ]}
          >
            <Text style={styles.title}>Пользователи отдела {deptUsersModal?.name}</Text>
            {deptUsersLoading ? (
              <ActivityIndicator />
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {deptUsers.map((u) => {
                  const fullName = [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ') || u.email;
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => {
                        setDeptUsersModal(null);
                        onOpenUser(u.id);
                      }}
                      style={({ pressed }) => [styles.deptUserCard, pressed && styles.deptUserCardPressed]}
                    >
                      <View style={styles.deptUserHeader}>
                        <Text style={styles.deptUserName} numberOfLines={2}>
                          #{u.id} · {fullName}
                        </Text>
                        <Text style={styles.deptUserRole}>{u.role?.name || '—'}</Text>
                      </View>
                      <Text style={styles.deptUserSub}>{u.email}</Text>
                      <Text style={styles.deptUserSub}>{u.phone || '—'}</Text>
                    </Pressable>
                  );
                })}
                {!deptUsers.length && <Text style={styles.subtitle}>Нет пользователей</Text>}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setDeptUsersModal(null)}>
              <Text style={styles.modalCloseText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
