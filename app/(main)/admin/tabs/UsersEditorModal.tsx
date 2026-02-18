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
import { getRoleDisplayName } from '@/utils/rbacLabels';
import type { Department, RoleItem } from '@/utils/userService';
import type { ProfileStatus } from '@/src/entities/user/types';
import { formatPhone, profileStatusLabel } from './usersTab.helpers';
import type { UsersEditorState } from './useUsersActions';

type Props = {
  visible: boolean;
  styles: any;
  colors: any;
  editorUserId: number | null;
  editor: UsersEditorState | null;
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
  roles,
  departments,
  onClose,
  onSave,
  onChangeEditor,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={styles.modalCard}>
          {!editor ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color={colors.tint} />
          ) : (
            <>
              <Text style={styles.sectionTitle}>Редактирование пользователя #{editorUserId}</Text>
              <ScrollView contentContainerStyle={{ gap: 8 }}>
                <TextInput
                  value={editor.lastName}
                  onChangeText={(v) => onChangeEditor((s) => (s ? { ...s, lastName: v } : s))}
                  style={styles.input}
                  placeholder="Фамилия"
                  placeholderTextColor={colors.secondaryText}
                />
                <TextInput
                  value={editor.firstName}
                  onChangeText={(v) => onChangeEditor((s) => (s ? { ...s, firstName: v } : s))}
                  style={styles.input}
                  placeholder="Имя"
                  placeholderTextColor={colors.secondaryText}
                />
                <TextInput
                  value={editor.middleName}
                  onChangeText={(v) => onChangeEditor((s) => (s ? { ...s, middleName: v } : s))}
                  style={styles.input}
                  placeholder="Отчество"
                  placeholderTextColor={colors.secondaryText}
                />
                <TextInput
                  value={editor.email}
                  onChangeText={(v) => onChangeEditor((s) => (s ? { ...s, email: v } : s))}
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.secondaryText}
                />
                <TextInput
                  value={editor.phone}
                  onChangeText={(v) => onChangeEditor((s) => (s ? { ...s, phone: formatPhone(v) } : s))}
                  style={styles.input}
                  placeholder="Телефон"
                  placeholderTextColor={colors.secondaryText}
                />

                <Text style={styles.sub}>Роль</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {roles.map((r) => (
                    <Pressable
                      key={`role-${r.id}`}
                      onPress={() => onChangeEditor((s) => (s ? { ...s, roleId: r.id } : s))}
                      style={[styles.chip, editor.roleId === r.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, editor.roleId === r.id && styles.chipTextActive]}>
                        {getRoleDisplayName(r)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.sub}>Отдел</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Pressable
                    onPress={() => onChangeEditor((s) => (s ? { ...s, departmentId: null } : s))}
                    style={[styles.chip, editor.departmentId === null && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, editor.departmentId === null && styles.chipTextActive]}>
                      Без отдела
                    </Text>
                  </Pressable>
                  {departments.map((d) => (
                    <Pressable
                      key={`dept-${d.id}`}
                      onPress={() => onChangeEditor((s) => (s ? { ...s, departmentId: d.id } : s))}
                      style={[styles.chip, editor.departmentId === d.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, editor.departmentId === d.id && styles.chipTextActive]}>
                        {d.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.sub}>Статус профиля сотрудника</Text>
                <View style={styles.chips}>
                  {(['PENDING', 'ACTIVE', 'BLOCKED'] as ProfileStatus[]).map((st) => (
                    <Pressable
                      key={`st-${st}`}
                      onPress={() => onChangeEditor((s) => (s ? { ...s, employeeStatus: st } : s))}
                      style={[styles.chip, editor.employeeStatus === st && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, editor.employeeStatus === st && styles.chipTextActive]}>
                        {profileStatusLabel(st)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                <Pressable onPress={onClose} style={styles.btn}>
                  <Text style={styles.btnText}>Закрыть</Text>
                </Pressable>
                <Pressable onPress={onSave} style={[styles.btn, { borderColor: colors.tint }]}>
                  <Text style={[styles.btnText, { color: colors.tint }]}>Сохранить</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
