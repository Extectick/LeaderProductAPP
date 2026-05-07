import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Dropdown from '@/components/ui/Dropdown';
import {
  listOnecLpAppPhysicalPersons,
  listOnecLpAppUsers,
  type OnecLpAppPhysicalPerson,
  type OnecLpAppUser,
} from '@/utils/onecLpAppService';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import type { Department, RoleItem } from '@/utils/userService';
import type { ProfileStatus, ProfileType } from '@/src/entities/user/types';
import {
  Button as PaperButton,
  Chip,
  Dialog,
  List,
  Portal,
  Surface,
  TouchableRipple,
  TextInput as PaperTextInput,
  ActivityIndicator as PaperActivityIndicator,
} from 'react-native-paper';
import {
  activeProfileTypeLabel,
  formatPhone,
  profileStatusLabel,
  profileTypeLabel,
} from './usersTab.helpers';
import type { UsersEditorState } from './useUsersActions';

const STATUS_OPTIONS: ProfileStatus[] = ['PENDING', 'ACTIVE', 'BLOCKED'];
const PROFILE_TYPES: ProfileType[] = ['EMPLOYEE', 'CLIENT', 'SUPPLIER'];

function Pressable({ children, ...props }: any) {
  return (
    <TouchableRipple {...props}>
      <View>{children}</View>
    </TouchableRipple>
  );
}

type Props = {
  visible: boolean;
  styles: any;
  colors: any;
  editorUserId: number | null;
  editor: UsersEditorState | null;
  saving: boolean;
  roles: RoleItem[];
  departments: Department[];
  onClose: () => void;
  onSave: () => void;
  onChangeEditor: (updater: (prev: UsersEditorState | null) => UsersEditorState | null) => void;
};

type OnecUserPickerProps = {
  selectedGuid: string | null;
  disabled: boolean;
  colors: any;
  styles: any;
  onSelect: (user: OnecLpAppUser) => void;
  onClear: () => void;
};

type OnecPhysicalPersonPickerProps = {
  selectedGuid: string | null;
  disabled: boolean;
  colors: any;
  styles: any;
  onSelect: (person: OnecLpAppPhysicalPerson) => void;
  onClear: () => void;
};

function formatOnecUser(user: OnecLpAppUser) {
  const name = user.name?.trim() || 'Пользователь 1С без имени';
  return user.inactive ? `${name} (неактивен)` : name;
}

function formatPhysicalPerson(person: OnecLpAppPhysicalPerson) {
  return person.name?.trim() || 'Физлицо 1С без имени';
}

function OnecUserPicker({ selectedGuid, disabled, colors, styles, onSelect, onClear }: OnecUserPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [users, setUsers] = React.useState<OnecLpAppUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedUser = React.useMemo(
    () => users.find((user) => user.guid === selectedGuid) ?? null,
    [selectedGuid, users]
  );

  const selectedLabel = selectedUser ? formatOnecUser(selectedUser) : selectedGuid ? 'Пользователь 1С выбран' : 'Не привязан';
  const inputValue = open ? query : selectedUser ? formatOnecUser(selectedUser) : selectedGuid ? selectedGuid : '';

  const filteredUsers = React.useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return users;
    return users.filter((user) => {
      const haystack = [
        user.name,
        user.guid,
        user.physicalPersonName,
        user.physicalPersonGuid,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(text);
    });
  }, [query, users]);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listOnecLpAppUsers();
      setUsers(list);
    } catch (err: any) {
      setError(err?.message || 'Не удалось получить пользователей 1С');
    } finally {
      setLoading(false);
    }
  }, []);

  const openPicker = React.useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    if (!users.length) void loadUsers();
  }, [disabled, loadUsers, users.length]);

  return (
    <View style={styles.userEditorField}>
      <Text style={styles.userEditorLabel}>Пользователь 1С</Text>
      <View style={localStyles.onecDropdownWrap}>
        <PaperTextInput
          mode="outlined"
          label="Поиск или выбор пользователя 1С"
          value={inputValue}
          onFocus={openPicker}
          onPressIn={openPicker}
          onChangeText={(value) => {
            if (!open) setOpen(true);
            setQuery(value);
            if (!users.length) void loadUsers();
          }}
          autoCapitalize="none"
          disabled={disabled}
          right={<PaperTextInput.Icon icon={open ? 'chevron-up' : 'chevron-down'} onPress={openPicker} />}
        />
        <Text selectable numberOfLines={2} style={localStyles.onecSelectedGuid}>
          {selectedGuid || 'GUID не выбран'}
        </Text>
        {open ? (
          <Surface mode="flat" style={localStyles.onecDropdown}>
            {loading ? (
              <View style={localStyles.onecDropdownState}>
                <PaperActivityIndicator color={colors.tint} />
                <Text style={styles.userEditorMuted}>Загружаем пользователей 1С</Text>
              </View>
            ) : null}
            {error ? (
              <View style={localStyles.onecError}>
                <Text style={localStyles.onecErrorText}>{error}</Text>
                <PaperButton compact onPress={() => void loadUsers()} disabled={loading}>
                  Повторить
                </PaperButton>
              </View>
            ) : null}
            {!loading && !error ? (
              <ScrollView style={localStyles.onecList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {filteredUsers.length ? (
                  filteredUsers.map((user) => {
                    const active = selectedGuid === user.guid;
                    return (
                      <Pressable
                        key={user.guid}
                        onPress={() => {
                          onSelect(user);
                          setQuery('');
                          setOpen(false);
                        }}
                        style={[localStyles.onecOption, active && localStyles.onecOptionActive]}
                      >
                        <Text numberOfLines={1} style={[localStyles.onecOptionTitle, active && localStyles.onecOptionTitleActive]}>
                          {formatOnecUser(user)}
                        </Text>
                        <Text numberOfLines={1} style={localStyles.onecOptionGuid}>
                          {user.guid}
                        </Text>
                        {user.physicalPersonName ? (
                          <Text numberOfLines={1} style={localStyles.onecOptionMeta}>
                            Физлицо: {user.physicalPersonName}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })
                ) : (
                  <View style={localStyles.onecDropdownState}>
                    <Text style={styles.userEditorMuted}>Пользователи 1С не найдены</Text>
                  </View>
                )}
              </ScrollView>
            ) : null}
            <View style={localStyles.onecDropdownActions}>
              {selectedGuid ? (
                <PaperButton compact disabled={disabled} onPress={onClear}>
                  Очистить
                </PaperButton>
              ) : null}
              <PaperButton compact onPress={() => void loadUsers()} disabled={loading}>
                Обновить
              </PaperButton>
              <PaperButton compact onPress={() => setOpen(false)}>
                Скрыть
              </PaperButton>
            </View>
          </Surface>
        ) : null}
      </View>
    </View>
  );
}

function OnecPhysicalPersonPicker({
  selectedGuid,
  disabled,
  colors,
  styles,
  onSelect,
  onClear,
}: OnecPhysicalPersonPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [persons, setPersons] = React.useState<OnecLpAppPhysicalPerson[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedPerson = React.useMemo(
    () => persons.find((person) => person.guid === selectedGuid) ?? null,
    [selectedGuid, persons]
  );

  const inputValue = open ? query : selectedPerson ? formatPhysicalPerson(selectedPerson) : selectedGuid ? selectedGuid : '';

  const filteredPersons = React.useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return persons;
    return persons.filter((person) => {
      const haystack = [person.name, person.guid, person.code].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(text);
    });
  }, [query, persons]);

  const loadPersons = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listOnecLpAppPhysicalPersons();
      setPersons(list);
    } catch (err: any) {
      setError(err?.message || 'Не удалось получить физических лиц 1С');
    } finally {
      setLoading(false);
    }
  }, []);

  const openPicker = React.useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    if (!persons.length) void loadPersons();
  }, [disabled, loadPersons, persons.length]);

  return (
    <View style={styles.userEditorField}>
      <Text style={styles.userEditorLabel}>Физическое лицо 1С</Text>
      <View style={localStyles.onecDropdownWrap}>
        <PaperTextInput
          mode="outlined"
          label="Поиск или выбор физлица 1С"
          value={inputValue}
          onFocus={openPicker}
          onPressIn={openPicker}
          onChangeText={(value) => {
            if (!open) setOpen(true);
            setQuery(value);
            if (!persons.length) void loadPersons();
          }}
          autoCapitalize="none"
          disabled={disabled}
          right={<PaperTextInput.Icon icon={open ? 'chevron-up' : 'chevron-down'} onPress={openPicker} />}
        />
        <Text selectable numberOfLines={2} style={localStyles.onecSelectedGuid}>
          {selectedGuid || 'GUID не выбран'}
        </Text>
        {open ? (
          <Surface mode="flat" style={localStyles.onecDropdown}>
            {loading ? (
              <View style={localStyles.onecDropdownState}>
                <PaperActivityIndicator color={colors.tint} />
                <Text style={styles.userEditorMuted}>Загружаем физических лиц 1С</Text>
              </View>
            ) : null}
            {error ? (
              <View style={localStyles.onecError}>
                <Text style={localStyles.onecErrorText}>{error}</Text>
                <PaperButton compact onPress={() => void loadPersons()} disabled={loading}>
                  Повторить
                </PaperButton>
              </View>
            ) : null}
            {!loading && !error ? (
              <ScrollView style={localStyles.onecList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {filteredPersons.length ? (
                  filteredPersons.map((person) => {
                    const active = selectedGuid === person.guid;
                    return (
                      <Pressable
                        key={person.guid}
                        onPress={() => {
                          onSelect(person);
                          setQuery('');
                          setOpen(false);
                        }}
                        style={[localStyles.onecOption, active && localStyles.onecOptionActive]}
                      >
                        <Text numberOfLines={1} style={[localStyles.onecOptionTitle, active && localStyles.onecOptionTitleActive]}>
                          {formatPhysicalPerson(person)}
                        </Text>
                        <Text numberOfLines={1} style={localStyles.onecOptionGuid}>
                          {person.guid}
                        </Text>
                        {person.code ? (
                          <Text numberOfLines={1} style={localStyles.onecOptionMeta}>
                            Код: {person.code}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })
                ) : (
                  <View style={localStyles.onecDropdownState}>
                    <Text style={styles.userEditorMuted}>Физические лица 1С не найдены</Text>
                  </View>
                )}
              </ScrollView>
            ) : null}
            <View style={localStyles.onecDropdownActions}>
              {selectedGuid ? (
                <PaperButton compact disabled={disabled} onPress={onClear}>
                  Очистить
                </PaperButton>
              ) : null}
              <PaperButton compact onPress={() => void loadPersons()} disabled={loading}>
                Обновить
              </PaperButton>
              <PaperButton compact onPress={() => setOpen(false)}>
                Скрыть
              </PaperButton>
            </View>
          </Surface>
        ) : null}
      </View>
    </View>
  );
}

export function UsersEditorModal({
  visible,
  styles,
  colors,
  editorUserId,
  editor,
  saving,
  roles,
  departments,
  onClose,
  onSave,
  onChangeEditor,
}: Props) {
  const handleClose = React.useCallback(() => {
    if (saving) return;
    onClose();
  }, [onClose, saving]);

  const roleItems = React.useMemo(
    () => roles.map((role) => ({ label: getRoleDisplayName(role), value: String(role.id) })),
    [roles]
  );

  const departmentItems = React.useMemo(
    () => [
      { label: 'Без отдела', value: 'none' },
      ...departments.map((department) => ({
        label: department.name,
        value: String(department.id),
      })),
    ],
    [departments]
  );

  const selectedRoleLabel = React.useMemo(() => {
    if (editor?.roleId == null) return 'Не выбрана';
    return roleItems.find((item) => item.value === String(editor.roleId))?.label || 'Не выбрана';
  }, [editor?.roleId, roleItems]);

  const selectedDepartmentLabel = React.useMemo(() => {
    if (editor?.departmentId == null) return 'Без отдела';
    return departments.find((item) => item.id === editor.departmentId)?.name || 'Без отдела';
  }, [departments, editor?.departmentId]);

  const renderStatusPicker = React.useCallback(
    (
      selectedStatus: ProfileStatus | null,
      onSelect: (status: ProfileStatus) => void,
      disabled = false
    ) => (
      <View style={styles.chips}>
        {STATUS_OPTIONS.map((status) => {
          const active = selectedStatus === status;
          return (
            <Chip
              key={`status-${status}`}
              onPress={() => onSelect(status)}
              disabled={disabled}
              compact
              selected={active}
              mode={active ? 'flat' : 'outlined'}
              style={disabled ? { opacity: 0.5 } : null}
            >
              {profileStatusLabel(status)}
            </Chip>
          );
        })}
      </View>
    ),
    [styles.chip, styles.chipActive, styles.chipText, styles.chipTextActive, styles.chips]
  );

  const renderReadonlyValue = React.useCallback(
    (value: string) => (
      <View style={styles.userEditorReadonly}>
        <Text style={styles.userEditorReadonlyText}>{value}</Text>
      </View>
    ),
    [styles.userEditorReadonly, styles.userEditorReadonlyText]
  );

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleClose} style={styles.userEditorPaperDialog}>
        {!editor ? (
          <Dialog.Content>
            <PaperActivityIndicator style={{ marginVertical: 20 }} />
          </Dialog.Content>
        ) : (
          <View style={styles.userEditorModalCard}>
              <View style={styles.userEditorHeader}>
                <Text style={styles.sectionTitle}>Редактирование пользователя #{editorUserId}</Text>
                <Text style={styles.sub}>{activeProfileTypeLabel(editor.currentProfileType)}</Text>
              </View>

              <ScrollView
                style={styles.userEditorScroll}
                contentContainerStyle={styles.userEditorContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.userEditorSection}>
                  <Text style={styles.userEditorSectionTitle}>Основные данные</Text>
                  <View style={styles.userEditorGrid}>
                    <View style={styles.userEditorField}>
                      <Text style={styles.userEditorLabel}>Фамилия</Text>
                      <PaperTextInput
                        value={editor.lastName}
                        onChangeText={(value) => onChangeEditor((state) => (state ? { ...state, lastName: value } : state))}
                        style={styles.input}
                        placeholder="Фамилия"
                        placeholderTextColor={colors.secondaryText}
                        editable={!saving}
                      />
                    </View>

                    <View style={styles.userEditorField}>
                      <Text style={styles.userEditorLabel}>Имя</Text>
                      <PaperTextInput
                        value={editor.firstName}
                        onChangeText={(value) => onChangeEditor((state) => (state ? { ...state, firstName: value } : state))}
                        style={styles.input}
                        placeholder="Имя"
                        placeholderTextColor={colors.secondaryText}
                        editable={!saving}
                      />
                    </View>

                    <View style={styles.userEditorField}>
                      <Text style={styles.userEditorLabel}>Отчество</Text>
                      <PaperTextInput
                        value={editor.middleName}
                        onChangeText={(value) => onChangeEditor((state) => (state ? { ...state, middleName: value } : state))}
                        style={styles.input}
                        placeholder="Отчество"
                        placeholderTextColor={colors.secondaryText}
                        editable={!saving}
                      />
                    </View>

                    <View style={styles.userEditorField}>
                      <Text style={styles.userEditorLabel}>Email</Text>
                      <PaperTextInput
                        value={editor.email}
                        onChangeText={(value) => onChangeEditor((state) => (state ? { ...state, email: value } : state))}
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor={colors.secondaryText}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!saving}
                      />
                    </View>

                    <View style={styles.userEditorField}>
                      <Text style={styles.userEditorLabel}>Телефон</Text>
                      <PaperTextInput
                        value={editor.phone}
                        onChangeText={(value) => onChangeEditor((state) => (state ? { ...state, phone: formatPhone(value) } : state))}
                        style={styles.input}
                        placeholder="Телефон"
                        placeholderTextColor={colors.secondaryText}
                        editable={!saving}
                      />
                    </View>

                    <View style={styles.userEditorField}>
                      <Text style={styles.userEditorLabel}>Новый пароль</Text>
                      <PaperTextInput
                        value={editor.newPassword}
                        onChangeText={(value) => onChangeEditor((state) => (state ? { ...state, newPassword: value } : state))}
                        style={styles.input}
                        placeholder="Оставьте пустым, чтобы не менять"
                        placeholderTextColor={colors.secondaryText}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!saving}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.userEditorSection}>
                  <Text style={styles.userEditorSectionTitle}>Доступ</Text>
                  <Text style={styles.userEditorMuted}>{activeProfileTypeLabel(editor.currentProfileType)}</Text>
                  <Text style={styles.userEditorLabel}>Статус учетной записи</Text>
                  {renderStatusPicker(
                    editor.accountStatus,
                    (status) => onChangeEditor((state) => (state ? { ...state, accountStatus: status } : state)),
                    saving
                  )}
                </View>

                <View style={styles.userEditorSection}>
                  <Text style={styles.userEditorSectionTitle}>Оргструктура</Text>

                  <View style={styles.userEditorField}>
                    <Text style={styles.userEditorLabel}>Роль</Text>
                    {saving ? renderReadonlyValue(selectedRoleLabel) : null}
                    {!saving && roleItems.length ? (
                      <Dropdown<string>
                        value={editor.roleId != null ? String(editor.roleId) : undefined}
                        onChange={(value) => {
                          const roleId = Number(value);
                          if (!Number.isFinite(roleId)) return;
                          onChangeEditor((state) => (state ? { ...state, roleId } : state));
                        }}
                        items={roleItems}
                        placeholder="Выберите роль"
                      />
                    ) : null}
                    {!saving && !roleItems.length ? renderReadonlyValue('Список ролей недоступен') : null}
                  </View>

                  <View style={styles.userEditorField}>
                    <Text style={styles.userEditorLabel}>Отдел</Text>
                    {!editor.hasEmployeeProfile
                      ? renderReadonlyValue('Профиль сотрудника отсутствует - выбор отдела недоступен')
                      : null}
                    {editor.hasEmployeeProfile && saving ? renderReadonlyValue(selectedDepartmentLabel) : null}
                    {editor.hasEmployeeProfile && !saving ? (
                      <Dropdown<string>
                        value={editor.departmentId == null ? 'none' : String(editor.departmentId)}
                        onChange={(value) =>
                          onChangeEditor((state) =>
                            state
                              ? { ...state, departmentId: value === 'none' ? null : Number(value) }
                              : state
                          )
                        }
                        items={departmentItems}
                        placeholder="Выберите отдел"
                      />
                    ) : null}
                  </View>
                </View>

                <View style={styles.userEditorSection}>
                  <Text style={styles.userEditorSectionTitle}>1С</Text>
                  {!editor.hasEmployeeProfile ? (
                    <Text style={styles.userEditorMuted}>
                      Профиль сотрудника отсутствует - привязка пользователя 1С недоступна.
                    </Text>
                  ) : (
                    <View style={styles.userEditorGrid}>
                      <OnecUserPicker
                        selectedGuid={editor.onecUserGuid}
                        disabled={saving}
                        colors={colors}
                        styles={styles}
                        onSelect={(user) =>
                          onChangeEditor((state) =>
                            state
                              ? {
                                  ...state,
                                  onecUserGuid: user.guid,
                                  onecPhysicalPersonGuid:
                                    state.onecPhysicalPersonGuid || user.physicalPersonGuid || null,
                                }
                              : state
                          )
                        }
                        onClear={() => onChangeEditor((state) => (state ? { ...state, onecUserGuid: null } : state))}
                      />
                      <OnecPhysicalPersonPicker
                        selectedGuid={editor.onecPhysicalPersonGuid}
                        disabled={saving}
                        colors={colors}
                        styles={styles}
                        onSelect={(person) =>
                          onChangeEditor((state) => (state ? { ...state, onecPhysicalPersonGuid: person.guid } : state))
                        }
                        onClear={() => onChangeEditor((state) => (state ? { ...state, onecPhysicalPersonGuid: null } : state))}
                      />
                    </View>
                  )}
                </View>

                <View style={styles.userEditorSection}>
                  <Text style={styles.userEditorSectionTitle}>Профили пользователя</Text>

                  <View style={styles.userProfileGrid}>
                    {[
                      {
                        key: 'employee',
                        title: 'Сотрудник',
                        exists: editor.hasEmployeeProfile,
                        status: editor.employeeStatus,
                        hint: editor.hasEmployeeProfile
                          ? `Отдел: ${
                              departments.find((department) => department.id === editor.departmentId)?.name ||
                              'Без отдела'
                            }`
                          : 'Профиль сотрудника отсутствует',
                        onSelect: (status: ProfileStatus) =>
                          onChangeEditor((state) => (state ? { ...state, employeeStatus: status } : state)),
                      },
                      {
                        key: 'client',
                        title: 'Клиент',
                        exists: editor.hasClientProfile,
                        status: editor.clientStatus,
                        hint: editor.hasClientProfile ? 'Профиль клиента активен' : 'Профиль клиента отсутствует',
                        onSelect: (status: ProfileStatus) =>
                          onChangeEditor((state) => (state ? { ...state, clientStatus: status } : state)),
                      },
                      {
                        key: 'supplier',
                        title: 'Поставщик',
                        exists: editor.hasSupplierProfile,
                        status: editor.supplierStatus,
                        hint: editor.hasSupplierProfile
                          ? 'Профиль поставщика активен'
                          : 'Профиль поставщика отсутствует',
                        onSelect: (status: ProfileStatus) =>
                          onChangeEditor((state) => (state ? { ...state, supplierStatus: status } : state)),
                      },
                    ].map((profileCard) => (
                      <View
                        key={profileCard.key}
                        style={[styles.userProfileCard, !profileCard.exists && styles.userProfileCardDisabled]}
                      >
                        <View style={styles.userProfileCardHeader}>
                          <Text style={styles.userProfileName}>{profileCard.title}</Text>
                          <View
                            style={[
                              styles.userProfileBadge,
                              profileCard.exists ? styles.userProfileBadgeExists : styles.userProfileBadgeMissing,
                            ]}
                          >
                            <Text
                              style={[
                                styles.userProfileBadgeText,
                                profileCard.exists
                                  ? styles.userProfileBadgeTextExists
                                  : styles.userProfileBadgeTextMissing,
                              ]}
                            >
                              {profileCard.exists ? 'Профиль есть' : 'Профиль отсутствует'}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.userEditorMuted}>{profileCard.hint}</Text>

                        {profileCard.exists ? (
                          <>
                            <Text style={styles.userEditorLabel}>
                              Текущий статус:{' '}
                              {profileCard.status ? profileStatusLabel(profileCard.status) : 'Не задан'}
                            </Text>
                            {renderStatusPicker(profileCard.status, profileCard.onSelect, saving)}
                          </>
                        ) : (
                          <Text style={styles.userEditorMuted}>Управление статусом недоступно</Text>
                        )}
                      </View>
                    ))}
                  </View>

                  <Text style={styles.userEditorMuted}>
                    Доступные профили: {PROFILE_TYPES.map((type) => profileTypeLabel(type)).join(', ')}
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.userEditorFooter}>
                <PaperButton disabled={saving} onPress={handleClose} mode="outlined">
                  <Text style={styles.btnText}>Закрыть</Text>
                </PaperButton>

                <PaperButton
                  disabled={saving}
                  onPress={onSave}
                  mode="contained"
                  loading={saving}
                >
                  {saving ? (
                    <PaperActivityIndicator size="small" />
                  ) : (
                    <Text style={[styles.btnText, styles.userEditorSaveText]}>Сохранить</Text>
                  )}
                </PaperButton>
              </View>
          </View>
        )}
      </Dialog>
    </Portal>
  );
}

const localStyles = StyleSheet.create({
  onecDropdownWrap: {
    gap: 6,
  },
  onecSelectedGuid: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  onecDropdown: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  onecDropdownState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  onecList: {
    maxHeight: 300,
  },
  onecOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 3,
  },
  onecOptionActive: {
    backgroundColor: '#EFF6FF',
  },
  onecOptionTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  onecOptionTitleActive: {
    color: '#2563EB',
  },
  onecOptionGuid: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  onecOptionMeta: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  onecDropdownActions: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    flexWrap: 'wrap',
  },
  onecError: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
  },
  onecErrorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
});
