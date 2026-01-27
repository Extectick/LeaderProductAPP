import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import ShimmerButton from '@/components/ShimmerButton';
import {
  assignUserRole,
  adminUpdatePassword,
  adminUpdateUser,
  AdminUserItem,
  getDepartments,
  getProfileById,
  getRoles,
  getUsers,
  RoleItem,
  Department,
} from '@/utils/userService';
import { Profile, ProfileStatus } from '@/types/userTypes';

import { AdminStyles } from '../adminStyles';
import { EditableCard, SelectableChip, SelectorCard, StaticCard } from '../components/AdminCards';

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

const normalizePhoneE164 = (val: string) => {
  const digits = val.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  let num = digits;
  if (num.startsWith('8')) num = '7' + num.slice(1);
  if (!num.startsWith('7')) num = '7' + num;
  return `+${num}`;
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

type UsersTabProps = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
  btnGradient: [string, string];
  queuedUserId: number | null;
  onConsumeQueuedUser: () => void;
};

export default function UsersTab({
  active,
  styles,
  colors,
  btnGradient,
  queuedUserId,
  onConsumeQueuedUser,
}: UsersTabProps) {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerType, setPickerType] = useState<'role' | 'department' | null>(null);
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

  const loadRefs = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([getRoles(), getDepartments()]);
      setRoles(r);
      setDepartments(d);
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
      phone: formatPhone(profile.phone || profile.employeeProfile?.phone || ''),
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
    if (!active) return;
    void loadRefs();
    void loadUsers('');
  }, [active, loadRefs, loadUsers]);

  useEffect(() => {
    if (!active) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void loadUsers(search.trim());
    }, 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, loadUsers, active]);

  useEffect(() => {
    if (!active || !queuedUserId) return;
    setSelectedUserId(queuedUserId);
    setModalVisible(true);
    void loadProfile(queuedUserId);
    onConsumeQueuedUser();
  }, [active, queuedUserId, onConsumeQueuedUser, loadProfile]);

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
    if (form.phone.trim() !== initialForm.phone.trim()) payload.phone = normalizePhoneE164(form.phone);
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

  if (!active) {
    return <View style={{ display: 'none' }} />;
  }

  return (
    <>
      <View style={styles.searchRow}>
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
              const activeRow = item.id === selectedUserId;
              const fullName =
                [item.lastName, item.firstName, item.middleName].filter(Boolean).join(' ') || item.email;
              return (
                <TouchableOpacity
                  style={[styles.userItem, activeRow && styles.userItemActive]}
                  onPress={() => handleSelectUser(item)}
                >
                  <Text style={[styles.userItemTitle, activeRow && styles.userItemTitleActive]}>
                    #{item.id} · {fullName}
                  </Text>
                  <Text style={[styles.userItemSub, activeRow && styles.userItemSubActive]}>
                    {item.email} · {item.phone || '-'}
                  </Text>
                  <Text style={[styles.userItemSub, activeRow && styles.userItemSubActive]}>
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

      <Modal
        visible={active && modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
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
                      mask="+7 (999) 999-99-99"
                      onMaskedChange={(masked, raw) => {
                        const normalizedMasked = formatPhone(masked || raw || '');
                        setForm((prev) => ({ ...prev, phone: normalizedMasked }));
                      }}
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
                    <StaticCard
                      styles={styles}
                      icon="barcode-outline"
                      label="ID пользователя"
                      value={`#${selectedProfile.id}`}
                    />
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
              <TouchableOpacity style={styles.modalClose} onPress={() => setModalVisible(false)}>
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
                        const activeOption =
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
                            style={[styles.pickerOption, activeOption && styles.pickerOptionActive]}
                          >
                            <Text style={[styles.pickerOptionText, activeOption && styles.pickerOptionTextActive]}>
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
    </>
  );
}
