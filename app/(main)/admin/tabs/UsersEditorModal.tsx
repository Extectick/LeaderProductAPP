import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Dropdown from '@/components/ui/Dropdown';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import type { Department, RoleItem } from '@/utils/userService';
import type { ProfileStatus, ProfileType } from '@/src/entities/user/types';
import {
  activeProfileTypeLabel,
  formatPhone,
  profileStatusLabel,
  profileTypeLabel,
} from './usersTab.helpers';
import type { UsersEditorState } from './useUsersActions';

const STATUS_OPTIONS: ProfileStatus[] = ['PENDING', 'ACTIVE', 'BLOCKED'];
const PROFILE_TYPES: ProfileType[] = ['EMPLOYEE', 'CLIENT', 'SUPPLIER'];

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
            <Pressable
              key={`status-${status}`}
              onPress={() => onSelect(status)}
              disabled={disabled}
              style={[styles.chip, active && styles.chipActive, disabled && { opacity: 0.5 }]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{profileStatusLabel(status)}</Text>
            </Pressable>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalWrap}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        <View style={[styles.modalCard, styles.userEditorModalCard]}>
          {!editor ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color={colors.tint} />
          ) : (
            <>
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
                      <TextInput
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
                      <TextInput
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
                      <TextInput
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
                      <TextInput
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
                      <TextInput
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
                      <TextInput
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
                <Pressable disabled={saving} onPress={handleClose} style={[styles.btn, saving && { opacity: 0.6 }]}>
                  <Text style={styles.btnText}>Закрыть</Text>
                </Pressable>

                <Pressable
                  disabled={saving}
                  onPress={onSave}
                  style={[styles.btn, styles.userEditorSaveBtn, saving && { opacity: 0.7 }]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.tint} />
                  ) : (
                    <Text style={[styles.btnText, styles.userEditorSaveText]}>Сохранить</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
