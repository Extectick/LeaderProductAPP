import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import BrandedBackground from '@/components/BrandedBackground';
import ShimmerButton from '@/components/ShimmerButton';
import { AuthContext } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { gradientColors, ThemeKey } from '@/constants/Colors';
import {
  getDepartments,
  getRoles,
  getUsers,
  RoleItem,
  AdminUserItem,
  assignUserRole,
  getProfileById,
  adminUpdateUser,
  adminUpdatePassword,
  Department,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  createRole,
  updateRole,
  deleteRole,
  getDepartmentUsers,
  getPermissions,
  updateRolePermissions,
} from '@/utils/userService';
import { Profile, ProfileStatus } from '@/types/userTypes';

const formatPhone = (input: string) => {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  let num = digits;
  if (num.startsWith('8')) num = '7' + num.slice(1);
  if (!num.startsWith('7')) num = '7' + num;
  const parts = [
    '+7',
    num.slice(1, 4) ? ` (${num.slice(1, 4)}` : '',
    num.length > 4 ? ')' : '',
    num.slice(4, 7) ? ` ${num.slice(4, 7)}` : '',
    num.length > 7 ? '-' : '',
    num.slice(7, 9),
    num.length > 9 ? '-' : '',
    num.slice(9, 11),
  ];
  return parts.join('').replace(/\s+-/g, ' ').trim();
};

type FormState = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  status: ProfileStatus;
  departmentId: number | null;
  roleId: number | null;
};

const STATUS_OPTIONS: ProfileStatus[] = ['ACTIVE', 'PENDING', 'BLOCKED'];

export default function AdminScreen() {
  const auth = useContext(AuthContext);
  const { theme, themes } = useTheme();
  const colors = themes[theme];
  const grad = gradientColors[theme as ThemeKey] || gradientColors.leaderprod;
  const btnGradient = useMemo(() => [grad[0], grad[1]] as [string, string], [grad]);
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'departments' | 'roles'>('users');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerType, setPickerType] = useState<'role' | 'department' | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [editRoleId, setEditRoleId] = useState<number | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [deptUsersModal, setDeptUsersModal] = useState<{ id: number; name: string } | null>(null);
  const [deptUsers, setDeptUsers] = useState<AdminUserItem[]>([]);
  const [deptUsersLoading, setDeptUsersLoading] = useState(false);
  const [rolePermModal, setRolePermModal] = useState<RoleItem | null>(null);
  const [rolePermsDraft, setRolePermsDraft] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    middleName: '',
    email: '',
    phone: '',
    status: 'PENDING',
    departmentId: null,
    roleId: null,
  });
  const [initialForm, setInitialForm] = useState<FormState | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = auth?.profile?.role?.name === 'admin' || auth?.profile?.role?.name === 'administrator';

  const loadRefs = useCallback(async () => {
    try {
      const [r, d, perms] = await Promise.all([getRoles(), getDepartments(), getPermissions()]);
      setRoles(r);
      setDepartments(d);
      setPermissions(perms);
    } catch (e: any) {
      console.warn('loadRefs error', e?.message);
    }
  }, []);

  const loadUsers = useCallback(
    async (q?: string) => {
      setLoadingUsers(true);
      try {
        const data = await getUsers(q);
        setUsers(data);
      } catch (e: any) {
        Alert.alert('Ошибка', e?.message || 'Не удалось загрузить пользователей');
      } finally {
        setLoadingUsers(false);
      }
    },
    []
  );

  const syncForm = useCallback((profile: Profile) => {
    const next: FormState = {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      middleName: profile.middleName || '',
      email: profile.email || '',
      phone: profile.phone || profile.employeeProfile?.phone || '',
      status: profile.profileStatus || 'PENDING',
      departmentId: profile.employeeProfile?.department?.id ?? null,
      roleId: profile.role?.id ?? null,
    };
    setForm(next);
    setInitialForm(next);
    setNewPassword('');
  }, []);

  const loadProfile = useCallback(
    async (userId?: number | null) => {
      if (!userId) return;
      try {
        setProfileLoading(true);
        const prof = await getProfileById(userId);
        if (!prof) throw new Error('Профиль не найден');
        setSelectedProfile(prof);
        syncForm(prof);
      } catch (e: any) {
        Alert.alert('Ошибка', e?.message || 'Не удалось загрузить профиль');
        setSelectedProfile(null);
        setInitialForm(null);
      } finally {
        setProfileLoading(false);
      }
    },
    [syncForm]
  );

  useEffect(() => {
    void loadRefs();
    void loadUsers('');
  }, [loadRefs, loadUsers]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void loadUsers(search.trim());
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, loadUsers]);

  const isDirty = useMemo(() => {
    if (!initialForm) return false;
    return (
      form.firstName.trim() !== initialForm.firstName.trim() ||
      form.lastName.trim() !== initialForm.lastName.trim() ||
      form.middleName.trim() !== initialForm.middleName.trim() ||
      form.email.trim() !== initialForm.email.trim() ||
      form.phone.trim() !== initialForm.phone.trim() ||
      form.status !== initialForm.status ||
      form.departmentId !== initialForm.departmentId ||
      form.roleId !== initialForm.roleId ||
      newPassword.trim().length > 0
    );
  }, [form, initialForm, newPassword]);

  const selectedRole = useMemo(
    () => (form.roleId ? roles.find((r) => r.id === form.roleId) || null : null),
    [roles, form.roleId]
  );
  const selectedDepartment = useMemo(
    () => (form.departmentId ? departments.find((d) => d.id === form.departmentId) || null : null),
    [departments, form.departmentId]
  );
  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.id, label: r.name })), [roles]);
  const departmentOptions = useMemo(
    () => [{ value: null, label: 'Без отдела' }, ...departments.map((d) => ({ value: d.id, label: d.name }))],
    [departments]
  );

  const [deptModalToRestore, setDeptModalToRestore] = useState<{ id: number; name: string } | null>(null);

  const handleSelectUser = (user: AdminUserItem) => {
    setSelectedUserId(user.id);
    setModalVisible(true);
    void loadProfile(user.id);
  };

  const cycleStatus = useCallback(() => {
    const idx = STATUS_OPTIONS.indexOf(form.status);
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    setForm((prev) => ({ ...prev, status: next }));
  }, [form.status]);

  const handleRoleChipPress = useCallback(() => {
    if (!roles.length) {
      Alert.alert('Нет ролей', 'Сначала создайте роли');
      return;
    }
    setPickerType('role');
  }, [roles]);

  const handleDepartmentChipPress = useCallback(() => {
    if (!departments.length) {
      setForm((prev) => ({ ...prev, departmentId: null }));
    }
    setPickerType('department');
  }, [departments]);

  const handleSave = async () => {
    if (!selectedUserId || !initialForm) return;
    const payload: Partial<FormState> & { profileStatus?: ProfileStatus } = {};
    if (form.firstName.trim() !== initialForm.firstName.trim()) payload.firstName = form.firstName.trim();
    if (form.lastName.trim() !== initialForm.lastName.trim()) payload.lastName = form.lastName.trim();
    if (form.middleName.trim() !== initialForm.middleName.trim()) payload.middleName = form.middleName.trim();
    if (form.email.trim() !== initialForm.email.trim()) payload.email = form.email.trim();
    if (form.phone.trim() !== initialForm.phone.trim()) payload.phone = form.phone.trim();
    if (form.status !== initialForm.status) payload.profileStatus = form.status;
    if (form.departmentId !== initialForm.departmentId) payload.departmentId = form.departmentId;

    setSaving(true);
    try {
      if (Object.keys(payload).length) {
        await adminUpdateUser(selectedUserId, payload);
      }
      if (form.roleId && form.roleId !== initialForm.roleId) {
        await assignUserRole(selectedUserId, { roleId: form.roleId });
      }
      if (newPassword.trim()) {
        await adminUpdatePassword(selectedUserId, newPassword.trim());
      }
      await loadProfile(selectedUserId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUserId
            ? {
                ...u,
                firstName: form.firstName,
                lastName: form.lastName,
                middleName: form.middleName,
                email: form.email,
                phone: form.phone,
                role: selectedRole ? { id: selectedRole.id, name: selectedRole.name } : u.role,
              }
            : u
        )
      );
      Alert.alert('Успех', 'Данные пользователя обновлены');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  // ------- Departments CRUD -------
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
        setDepartments((prev) =>
          prev.map((d) => (d.id === editDeptId ? { ...d, name } : d))
        );
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

  // ------- Roles CRUD -------
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

  // загрузка пользователей отдела при открытии модалки
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

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 18 }}>Недостаточно прав</Text>
      </View>
    );
  }

  return (
    <BrandedBackground speed={1.1} style={{ flex: 1 }}>
      <View style={styles.container}>
        <Text style={styles.title}>Администрирование</Text>
        <View style={styles.card}>
          <View style={styles.tabsRow}>
            <Pressable onPress={() => setActiveTab('users')} style={[styles.tabBtn, activeTab === 'users' && styles.tabBtnActive]}>
              <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>Пользователи</Text>
            </Pressable>
            <Pressable onPress={() => setActiveTab('departments')} style={[styles.tabBtn, activeTab === 'departments' && styles.tabBtnActive]}>
              <Text style={[styles.tabText, activeTab === 'departments' && styles.tabTextActive]}>Отделы</Text>
            </Pressable>
            <Pressable onPress={() => setActiveTab('roles')} style={[styles.tabBtn, activeTab === 'roles' && styles.tabBtnActive]}>
              <Text style={[styles.tabText, activeTab === 'roles' && styles.tabTextActive]}>Роли</Text>
            </Pressable>
          </View>

          {activeTab === 'users' && (
            <>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={18} color={colors.secondaryText} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Поиск по имени, email или телефону"
                  style={styles.searchInput}
                />
                {loadingUsers && <ActivityIndicator size="small" />}
              </View>
              <View style={styles.split}>
                <View style={styles.userListWrap}>
                  <FlatList
                    data={users}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => {
                      const active = item.id === selectedUserId;
                      const fullName =
                        [item.lastName, item.firstName, item.middleName].filter(Boolean).join(' ') || item.email;
                      return (
                        <TouchableOpacity
                          style={[styles.userItem, active && styles.userItemActive]}
                          onPress={() => handleSelectUser(item)}
                        >
                          <Text style={[styles.userItemTitle, active && styles.userItemTitleActive]}>
                            #{item.id} · {fullName}
                          </Text>
                          <Text style={[styles.userItemSub, active && styles.userItemSubActive]}>
                            {item.email} · {item.phone || '-'}
                          </Text>
                          <Text style={[styles.userItemSub, active && styles.userItemSubActive]}>
                            Роль: {item.role?.name || '-'}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={<Text style={styles.subtitle}>{loadingUsers ? 'Поиск...' : 'Список пуст'}</Text>}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ flexGrow: 1 }}
                  />
                </View>
              </View>
            </>
          )}

          {activeTab === 'departments' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10 }}>
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
              {departments.map((d) => {
                const isEditing = editDeptId === d.id;
                return (
                  <View key={d.id} style={styles.itemRow}>
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.9} onPress={() => setDeptUsersModal({ id: d.id, name: d.name })}>
                      {isEditing ? (
                        <TextInput
                          value={editDeptName}
                          onChangeText={setEditDeptName}
                          style={[styles.input, styles.nameInputFlex]}
                          autoFocus
                          onSubmitEditing={handleUpdateDepartment}
                        />
                      ) : (
                        <Text style={styles.nameText} numberOfLines={1}>{d.name}</Text>
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
            </ScrollView>
          )}

          {activeTab === 'roles' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10 }}>
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
                        <Text style={styles.nameText} numberOfLines={1}>{r.name}</Text>
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
            </ScrollView>
          )}
        </View>
      </View>

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setModalVisible(false);
          if (deptModalToRestore) {
            setDeptUsersModal(deptModalToRestore);
            setDeptModalToRestore(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback
            onPress={() => {
              setModalVisible(false);
              if (deptModalToRestore) {
                setDeptUsersModal(deptModalToRestore);
                setDeptModalToRestore(null);
              }
            }}
          >
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', maxWidth: 980 }}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.cardBackground }]}>
              {profileLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color={colors.tint} />
                </View>
              ) : selectedProfile ? (
                <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
                  <View style={styles.heroWrap}>
                    <LinearGradient
                      colors={['#C7D2FE', '#E9D5FF']}
                      start={{ x: 0, y: 0.4 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroBg}
                    />
                    <View style={styles.heroInner}>
                      <View style={styles.avatarOuter}>
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarInitials}>
                            {(selectedProfile.firstName?.[0] || '').toUpperCase()}
                            {(selectedProfile.lastName?.[0] || '').toUpperCase() || 'U'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.heroTitle}>
                        {[form.lastName, form.firstName, form.middleName].filter(Boolean).join(' ') || 'Профиль'}
                      </Text>
                      <Text style={styles.heroSubtitle}>
                        {selectedDepartment?.name || selectedProfile.employeeProfile?.department?.name || 'Без отдела'}
                      </Text>
                      <View style={styles.chipsRow}>
                        <SelectableChip styles={styles} label="Сотрудник" icon="id-card-outline" tone="violet" />
                        <SelectableChip
                          styles={styles}
                          label={form.status || 'STATUS'}
                          icon="shield-checkmark-outline"
                          tone={form.status === 'ACTIVE' ? 'green' : form.status === 'BLOCKED' ? 'red' : 'blue'}
                          onPress={cycleStatus}
                        />
                        <SelectableChip
                          styles={styles}
                          label={selectedRole?.name || 'Роль'}
                          icon="person-outline"
                          tone="blue"
                          onPress={handleRoleChipPress}
                        />
                        <SelectableChip
                          styles={styles}
                          label={selectedDepartment?.name || 'Отдел'}
                          icon="business-outline"
                          tone="gray"
                          onPress={handleDepartmentChipPress}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardsWrap}>
                    <SelectorCard
                      styles={styles}
                      icon="shield-checkmark-outline"
                      label="Статус"
                      options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                      selected={form.status}
                      onSelect={(v) => setForm((prev) => ({ ...prev, status: v as ProfileStatus }))}
                    />
                    <EditableCard
                      styles={styles}
                      icon="mail-outline"
                      label="Email"
                      value={form.email}
                      onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
                      placeholder="email@example.com"
                      keyboardType="email-address"
                    />
                    <EditableCard
                      styles={styles}
                      icon="call-outline"
                      label="Телефон"
                      value={form.phone}
                      onChangeText={(text) => setForm((prev) => ({ ...prev, phone: formatPhone(text) }))}
                      placeholder="+7 ..."
                      keyboardType="phone-pad"
                    />
                    <EditableCard
                      styles={styles}
                      icon="document-text-outline"
                      label="Фамилия"
                      value={form.lastName}
                      onChangeText={(text) => setForm((prev) => ({ ...prev, lastName: text }))}
                      placeholder="Фамилия"
                    />
                    <EditableCard
                      styles={styles}
                      icon="document-text-outline"
                      label="Имя"
                      value={form.firstName}
                      onChangeText={(text) => setForm((prev) => ({ ...prev, firstName: text }))}
                      placeholder="Имя"
                    />
                    <EditableCard
                      styles={styles}
                      icon="document-text-outline"
                      label="Отчество"
                      value={form.middleName}
                      onChangeText={(text) => setForm((prev) => ({ ...prev, middleName: text }))}
                      placeholder="Отчество"
                    />
                    <EditableCard
                      styles={styles}
                      icon="key-outline"
                      label="Новый пароль"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Оставьте пустым чтобы не менять"
                      secureTextEntry
                    />
                    <StaticCard styles={styles} icon="barcode-outline" label="ID пользователя" value={`#${selectedProfile.id}`} />
                  </View>

                  {isDirty ? (
                    <View style={{ marginTop: 12 }}>
                      <ShimmerButton
                        title={saving ? 'Сохраняем...' : 'Сохранить'}
                        loading={saving}
                        gradientColors={btnGradient}
                        onPress={handleSave}
                      />
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <Text style={{ color: colors.text }}>Нет данных</Text>
              )}
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => {
                  setModalVisible(false);
                  if (deptModalToRestore) {
                    setDeptUsersModal(deptModalToRestore);
                    setDeptModalToRestore(null);
                  }
                }}
              >
                <Text style={styles.modalCloseText}>Закрыть</Text>
              </TouchableOpacity>

              {pickerType && (
                <View style={styles.pickerOverlay} pointerEvents="box-none">
                  <TouchableWithoutFeedback onPress={() => setPickerType(null)}>
                    <View style={StyleSheet.absoluteFill} />
                  </TouchableWithoutFeedback>
                  <View style={[styles.pickerCard, { backgroundColor: colors.cardBackground }]}>
                    <Text style={styles.pickerTitle}>
                      {pickerType === 'role' ? 'Выбор роли' : 'Выбор отдела'}
                    </Text>
                    <ScrollView style={{ maxHeight: 320 }}>
                      {(pickerType === 'role' ? roleOptions : departmentOptions).map((opt) => {
                        const active =
                          pickerType === 'role'
                            ? opt.value === form.roleId
                            : opt.value === form.departmentId;
                        return (
                          <Pressable
                            key={`${pickerType}-${opt.value ?? 'none'}`}
                            onPress={() => {
                              if (pickerType === 'role') {
                                setForm((prev) => ({ ...prev, roleId: Number(opt.value) }));
                              } else {
                                setForm((prev) => ({
                                  ...prev,
                                  departmentId: opt.value === null ? null : Number(opt.value),
                                }));
                              }
                              setPickerType(null);
                            }}
                            style={[styles.pickerOption, active && styles.pickerOptionActive]}
                          >
                            <Text style={[styles.pickerOptionText, active && styles.pickerOptionTextActive]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Модал отдел -> пользователи */}
      <Modal
        visible={!!deptUsersModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDeptUsersModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setDeptUsersModal(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '80%', width: '90%', maxWidth: 600, backgroundColor: colors.cardBackground }]}>
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
                        handleSelectUser(u);
                      }}
                      style={({ pressed }) => [
                        styles.deptUserCard,
                        pressed && styles.deptUserCardPressed,
                      ]}
                    >
                      <View style={styles.deptUserHeader}>
                        <Text style={styles.deptUserName} numberOfLines={1}>
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

      {/* Модал роль -> права */}
      <Modal
        visible={!!rolePermModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRolePermModal(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setRolePermModal(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={[styles.modalCard, { maxHeight: '80%', width: '90%', maxWidth: 720, backgroundColor: colors.cardBackground }]}>
            <Text style={styles.title}>Права роли {rolePermModal?.name}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {permissions.map((p) => {
                const active = rolePermsDraft.includes(p);
                return (
                  <Pressable
                    key={p}
                    onPress={() =>
                      setRolePermsDraft((prev) =>
                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                      )
                    }
                    style={[
                      styles.permRow,
                      active && styles.permRowActive,
                    ]}
                  >
                    <Ionicons
                      name={active ? 'checkbox-outline' : 'square-outline'}
                      size={20}
                      color={active ? colors.tint : colors.secondaryText}
                    />
                    <Text style={[styles.permText, active && styles.permTextActive]} numberOfLines={2}>
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
    </BrandedBackground>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, padding: 12 },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 10 },
    tabsRow: { flexDirection: 'row', gap: 8 },
    tabBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    tabBtnActive: {
      backgroundColor: colors.tint + '12',
      borderColor: colors.tint,
    },
    tabText: { color: colors.secondaryText, fontWeight: '700' },
    tabTextActive: { color: colors.tint },
    card: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: 12,
      gap: 10,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
      flex: 1,
    },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.inputBackground,
      borderColor: colors.inputBorder,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    searchInput: { flex: 1, color: colors.text },
    split: { flex: 1, flexDirection: 'row', gap: 12 },
    userListWrap: {
      flex: 1,
      backgroundColor: colors.cardBackground,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      overflow: 'hidden',
    },
    userItem: {
      padding: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.inputBorder,
    },
    userItemActive: { backgroundColor: colors.tint + '22' },
    userItemTitle: { fontWeight: '700', color: colors.text },
    userItemTitleActive: { color: colors.tint },
    userItemSub: { color: colors.secondaryText, fontSize: 13 },
    userItemSubActive: { color: colors.tint },
    subtitle: { color: colors.secondaryText },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    modalCard: {
      width: '100%',
      maxWidth: 920,
      borderRadius: 20,
      padding: 14,
      backgroundColor: colors.cardBackground,
    },
    modalClose: {
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderColor: colors.inputBorder,
    },
    modalCloseText: { fontSize: 16, fontWeight: '700', color: colors.text },
    center: { alignItems: 'center', justifyContent: 'center', padding: 20 },

    heroWrap: {
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#E0E7FF',
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    heroBg: { ...StyleSheet.absoluteFillObject },
    heroInner: { padding: 18 },
    avatarOuter: {
      alignSelf: 'flex-start',
      width: 96,
      height: 96,
      borderRadius: 28,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#EEF2FF',
      marginBottom: 10,
    },
    avatar: { width: 88, height: 88, borderRadius: 24 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
    avatarInitials: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
    heroTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
    heroSubtitle: { marginTop: 6, color: '#334155' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },

    chip: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    chipText: { fontSize: 12, fontWeight: '700' },

    cardsWrap: { gap: 12 },
    infoCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    infoIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoLabel: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
    infoValue: { color: '#111827', fontSize: 14, fontWeight: '700' },
    infoInput: { color: '#111827', fontSize: 14, fontWeight: '700', padding: 0 },
    optionChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      marginRight: 8,
      marginTop: 6,
      backgroundColor: '#F9FAFB',
    },
    optionChipActive: {
      backgroundColor: '#DBEAFE',
      borderColor: '#93C5FD',
    },
    optionText: { color: '#111827', fontWeight: '700' },
    optionTextActive: { color: '#1D4ED8' },
    pickerOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerCard: {
      width: '90%',
      maxWidth: 420,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    pickerTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10 },
    pickerOption: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      marginBottom: 8,
    },
    pickerOptionActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
    pickerOptionText: { color: colors.text, fontWeight: '700' },
    pickerOptionTextActive: { color: '#4338CA' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderColor: colors.inputBorder,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: colors.text,
    },
    smallBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemRow: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inputBackground,
    },
    iconBtnDanger: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#F87171',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FEF2F2',
    },
    nameText: {
      flex: 1,
      color: colors.text,
      fontWeight: '700',
      flexShrink: 1,
    },
    nameInputFlex: {
      flex: 1,
      minWidth: 0,
    },
    permRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      marginBottom: 8,
    },
    permRowActive: {
      borderColor: colors.tint,
      backgroundColor: colors.tint + '12',
    },
    permText: { flex: 1, color: colors.secondaryText, fontWeight: '700' },
    permTextActive: { color: colors.text },
    deptUserCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      padding: 12,
      marginBottom: 8,
      gap: 4,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    deptUserCardPressed: { backgroundColor: colors.tint + '12', borderColor: colors.tint },
    deptUserHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    deptUserName: { flex: 1, fontWeight: '700', color: colors.text, marginRight: 8 },
    deptUserRole: { color: colors.secondaryText, fontWeight: '700' },
    deptUserSub: { color: colors.secondaryText },
  });

type Tone = 'green' | 'violet' | 'gray' | 'red' | 'blue';

function SelectableChip({
  styles,
  label,
  icon,
  tone = 'gray',
  onPress,
}: {
  styles: ReturnType<typeof getStyles>;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone?: Tone;
  onPress?: () => void;
}) {
  const palette = {
    green: { bg: '#DCFCE7', bd: '#86EFAC', text: '#166534' },
    violet: { bg: '#EDE9FE', bd: '#C4B5FD', text: '#4C1D95' },
    gray: { bg: '#F3F4F6', bd: '#E5E7EB', text: '#374151' },
    red: { bg: '#FEE2E2', bd: '#FCA5A5', text: '#991B1B' },
    blue: { bg: '#DBEAFE', bd: '#93C5FD', text: '#1E3A8A' },
  }[tone];

  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.bd }]}>
      <Ionicons name={icon} size={14} color={palette.text} />
      <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function EditableCard({
  styles,
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
}: {
  styles: ReturnType<typeof getStyles>;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#4F46E5" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          style={styles.infoInput}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
        />
      </View>
    </View>
  );
}

function StaticCard({
  styles,
  icon,
  label,
  value,
}: {
  styles: ReturnType<typeof getStyles>;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
}) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#4F46E5" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || '-'}</Text>
      </View>
    </View>
  );
}

function SelectorCard({
  styles,
  icon,
  label,
  options,
  selected,
  onSelect,
}: {
  styles: ReturnType<typeof getStyles>;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  options: Array<{ value: any; label: string }>;
  selected: any;
  onSelect: (val: any) => void;
}) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color="#4F46E5" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          {options.map((opt) => {
            const active = opt.value === selected;
            return (
              <Pressable
                key={`${label}-${opt.value}`}
                onPress={() => onSelect(opt.value)}
                style={[styles.optionChip, active && styles.optionChipActive]}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
