import { AppealParticipantCard } from '@/components/Appeals/AppealParticipantCard';
import Dropdown from '@/components/ui/Dropdown';
import { getRoleDisplayName } from '@/utils/rbacLabels';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { UserOption } from '../types';
import { humanName } from '../helpers';
import { trackingStyles as styles } from '../styles';
import TrackingModalShell from './TrackingModalShell';

type Props = {
  visible: boolean;
  userQuery: string;
  userSearchLoading: boolean;
  userOptions: UserOption[];
  selectedUserId?: number | null;
  onClose: () => void;
  onChangeQuery: (value: string) => void;
  onSubmitSearch: () => void;
  onSelectUser: (user: UserOption) => void;
};

export default function TrackingUserPickerModal({
  visible,
  userQuery,
  userSearchLoading,
  userOptions,
  selectedUserId,
  onClose,
  onChangeQuery,
  onSubmitSearch,
  onSelectUser,
}: Props) {
  const ALL_FILTER = '__all__';
  const NO_ROLE_FILTER = '__none__';
  const [filtersVisible, setFiltersVisible] = React.useState(false);
  const [departmentFilter, setDepartmentFilter] = React.useState<string>(ALL_FILTER);
  const [roleFilter, setRoleFilter] = React.useState<string>(ALL_FILTER);

  const departments = React.useMemo(() => {
    const uniq = new Set<string>();
    userOptions.forEach((item) => {
      const value = String(item.departmentName || '').trim() || 'Без отдела';
      uniq.add(value);
    });
    return [ALL_FILTER, ...Array.from(uniq).sort((a, b) => a.localeCompare(b, 'ru'))];
  }, [userOptions]);

  const roleOptions = React.useMemo(() => {
    const byKey = new Map<string, string>();
    userOptions.forEach((item) => {
      const key = item.role?.id != null
        ? `id:${item.role.id}`
        : String(item.role?.name || '').trim()
          ? `name:${String(item.role?.name || '').trim()}`
          : NO_ROLE_FILTER;
      const label = getRoleDisplayName(item.role || null);
      if (!byKey.has(key)) byKey.set(key, label);
    });
    const sorted = Array.from(byKey.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
      .map(([value, label]) => ({ value, label }));
    return [{ value: ALL_FILTER, label: 'Все роли' }, ...sorted];
  }, [ALL_FILTER, NO_ROLE_FILTER, userOptions]);

  React.useEffect(() => {
    if (departmentFilter !== ALL_FILTER && !departments.includes(departmentFilter)) {
      setDepartmentFilter(ALL_FILTER);
    }
  }, [ALL_FILTER, departmentFilter, departments]);

  React.useEffect(() => {
    const roleValues = new Set(roleOptions.map((item) => item.value));
    if (roleFilter !== ALL_FILTER && !roleValues.has(roleFilter)) {
      setRoleFilter(ALL_FILTER);
    }
  }, [ALL_FILTER, roleFilter, roleOptions]);

  const filteredUsers = React.useMemo(() => {
    return userOptions.filter((item) => {
      const department = String(item.departmentName || '').trim() || 'Без отдела';
      const roleKey = item.role?.id != null
        ? `id:${item.role.id}`
        : String(item.role?.name || '').trim()
          ? `name:${String(item.role?.name || '').trim()}`
          : NO_ROLE_FILTER;
      if (departmentFilter !== ALL_FILTER && department !== departmentFilter) {
        return false;
      }
      if (roleFilter !== ALL_FILTER && roleKey !== roleFilter) {
        return false;
      }
      return true;
    });
  }, [ALL_FILTER, NO_ROLE_FILTER, departmentFilter, roleFilter, userOptions]);

  return (
    <TrackingModalShell
      visible={visible}
      title="Пользователи"
      onClose={onClose}
      compact
    >
      <View style={styles.userPickerSearchRow}>
        <View style={[styles.inputShell, styles.userPickerSearchShell]}>
          <Ionicons name="search-outline" size={16} color="#64748B" />
          <TextInput
            placeholder="Поиск по имени или email"
            placeholderTextColor="#94A3B8"
            value={userQuery}
            onChangeText={onChangeQuery}
            onSubmitEditing={onSubmitSearch}
            style={styles.textInput}
          />
        </View>
        <Pressable
          onPress={() => setFiltersVisible((prev) => !prev)}
          style={(state: any) => [
            styles.userPickerFilterToggle,
            filtersVisible && styles.userPickerFilterToggleActive,
            state?.hovered && styles.secondaryBtnHover,
            state?.pressed && styles.secondaryBtnPressed,
          ]}
          accessibilityLabel={filtersVisible ? 'Скрыть фильтры' : 'Показать фильтры'}
        >
          <Ionicons name="options-outline" size={16} color="#1D4ED8" />
        </Pressable>
      </View>

      {filtersVisible ? (
        <View style={styles.userPickerFiltersPanel}>
          <View style={styles.userPickerFilterFieldsRow}>
            <View style={styles.userPickerFilterField}>
              <Text style={styles.userPickerFilterLabel}>Отдел</Text>
              <Dropdown<string>
                value={departmentFilter}
                onChange={setDepartmentFilter}
                items={departments.map((value) => ({
                  value,
                  label: value === ALL_FILTER ? 'Все отделы' : value,
                }))}
                placeholder="Все отделы"
                buttonStyle={styles.userPickerDropdownBtn}
              />
            </View>

            <View style={styles.userPickerFilterField}>
              <Text style={styles.userPickerFilterLabel}>Роль</Text>
              <Dropdown<string>
                value={roleFilter}
                onChange={setRoleFilter}
                items={roleOptions}
                placeholder="Все роли"
                buttonStyle={styles.userPickerDropdownBtn}
              />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.userPickerLoadingRow}>
        {userSearchLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="#2563EB" size="small" />
            <Text style={styles.mutedText}>Обновляем список...</Text>
          </View>
        ) : null}
      </View>

      <ScrollView style={styles.userPickerList} contentContainerStyle={styles.userPickerListContent}>
        {filteredUsers.length === 0 ? (
          <Text style={styles.mutedText}>Нет результатов</Text>
        ) : (
          filteredUsers.map((item) => {
            const isActive = selectedUserId === item.id;
            const roleName = String(item.role?.name || '').toLowerCase();
            const isAdmin = roleName.includes('admin');
            const isDepartmentManager = roleName.includes('manager');
            const department = item.departmentName
              ? { id: item.id, name: item.departmentName }
              : null;
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelectUser(item)}
                style={(state: any) => [
                  styles.participantPickerRowPressable,
                  state?.hovered && styles.participantPickerRowPressableHover,
                  state?.pressed && styles.participantPickerRowPressablePressed,
                ]}
              >
                <AppealParticipantCard
                  user={{
                    id: item.id,
                    email: item.email,
                    firstName: item.firstName,
                    lastName: item.lastName,
                    avatarUrl: item.avatarUrl || null,
                    department,
                    isAdmin,
                    isDepartmentManager,
                  }}
                  displayName={humanName(item)}
                  presenceText={item.email || item.phone || 'Нет данных'}
                  showRoleTags={false}
                  isOnline={Boolean(item.isOnline)}
                  style={isActive ? styles.participantPickerActiveCard : undefined}
                  rightSlot={
                    isActive ? (
                      <Ionicons name="checkmark-circle" size={20} color="#1D4ED8" />
                    ) : (
                      <Ionicons name="chevron-forward-outline" size={18} color="#6B7280" />
                    )
                  }
                />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </TrackingModalShell>
  );
}
