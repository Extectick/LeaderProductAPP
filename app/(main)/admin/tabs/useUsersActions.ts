import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';
import { toApiPhoneDigitsString } from '@/utils/phone';
import {
  adminUpdateUser,
  adminUpdateUserProfile,
  assignUserRole,
  type AdminUsersListItem,
  getProfileById,
  moderateEmployeeProfile,
} from '@/utils/userService';
import type { ProfileStatus } from '@/src/entities/user/types';
import { formatPhone } from './usersTab.helpers';

export type UsersEditorState = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  roleId: number | null;
  departmentId: number | null;
  employeeStatus: ProfileStatus | null;
};

type UseUsersActionsParams = {
  editorUserId: number | null;
  editor: UsersEditorState | null;
  editorInitial: UsersEditorState | null;
  loadData: () => Promise<void>;
  setActionBusyId: Dispatch<SetStateAction<number | null>>;
  setEditorVisible: Dispatch<SetStateAction<boolean>>;
  setEditorUserId: Dispatch<SetStateAction<number | null>>;
  setEditor: Dispatch<SetStateAction<UsersEditorState | null>>;
  setEditorInitial: Dispatch<SetStateAction<UsersEditorState | null>>;
};

export function useUsersActions({
  editorUserId,
  editor,
  editorInitial,
  loadData,
  setActionBusyId,
  setEditorVisible,
  setEditorUserId,
  setEditor,
  setEditorInitial,
}: UseUsersActionsParams) {
  const openEditor = useCallback(
    async (userId: number) => {
      setEditorUserId(userId);
      setEditorVisible(true);
      try {
        const profile = await getProfileById(userId);
        if (!profile) throw new Error('Профиль не найден');
        const next: UsersEditorState = {
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          middleName: profile.middleName || '',
          email: profile.email || '',
          phone: formatPhone(profile.phone),
          roleId: profile.role?.id ?? null,
          departmentId: profile.employeeProfile?.department?.id ?? null,
          employeeStatus: profile.employeeProfile?.status ?? null,
        };
        setEditor(next);
        setEditorInitial(next);
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось загрузить профиль');
        setEditorVisible(false);
      }
    },
    [setEditor, setEditorInitial, setEditorUserId, setEditorVisible]
  );

  const doModeration = useCallback(
    async (item: AdminUsersListItem, action: 'APPROVE' | 'REJECT', reason?: string) => {
      setActionBusyId(item.id);
      try {
        await moderateEmployeeProfile(item.id, { action, reason });
        await loadData();
        Alert.alert('Готово', action === 'APPROVE' ? 'Сотрудник подтвержден' : 'Сотрудник отклонен');
      } catch (error: any) {
        Alert.alert('Ошибка', error?.message || 'Не удалось выполнить действие');
      } finally {
        setActionBusyId(null);
      }
    },
    [loadData, setActionBusyId]
  );

  const saveEditor = useCallback(async () => {
    if (!editorUserId || !editor || !editorInitial) return;
    try {
      const patch: Record<string, unknown> = {};
      if (editor.firstName !== editorInitial.firstName) patch.firstName = editor.firstName.trim();
      if (editor.lastName !== editorInitial.lastName) patch.lastName = editor.lastName.trim();
      if (editor.middleName !== editorInitial.middleName) patch.middleName = editor.middleName.trim();
      if (editor.email !== editorInitial.email) patch.email = editor.email.trim();
      if (editor.phone !== editorInitial.phone) patch.phone = toApiPhoneDigitsString(editor.phone) || '';
      if (Object.keys(patch).length) await adminUpdateUser(editorUserId, patch);

      if (editor.roleId && editor.roleId !== editorInitial.roleId) {
        await assignUserRole(editorUserId, { roleId: editor.roleId });
      }

      const employeePatch: Record<string, unknown> = {};
      if (editor.departmentId !== editorInitial.departmentId) employeePatch.departmentId = editor.departmentId;
      if (editor.employeeStatus && editor.employeeStatus !== editorInitial.employeeStatus) {
        employeePatch.status = editor.employeeStatus;
      }
      if (Object.keys(employeePatch).length) {
        await adminUpdateUserProfile(editorUserId, 'employee', employeePatch);
      }

      setEditorVisible(false);
      await loadData();
    } catch (error: any) {
      Alert.alert('Ошибка', error?.message || 'Не удалось сохранить');
    }
  }, [editor, editorInitial, editorUserId, loadData, setEditorVisible]);

  return {
    openEditor,
    doModeration,
    saveEditor,
  };
}
