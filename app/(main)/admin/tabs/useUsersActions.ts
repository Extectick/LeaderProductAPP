import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';
import { toApiPhoneDigitsString } from '@/utils/phone';
import {
  adminUpdatePassword,
  adminUpdateUser,
  adminUpdateUserProfile,
  assignUserRole,
  type AdminUsersListItem,
  getProfileById,
  moderateEmployeeProfile,
} from '@/utils/userService';
import type { Profile, ProfileStatus, ProfileType } from '@/src/entities/user/types';
import { formatPhone } from './usersTab.helpers';

export type UsersEditorState = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  newPassword: string;
  roleId: number | null;
  accountStatus: ProfileStatus;
  currentProfileType: ProfileType | null;
  hasEmployeeProfile: boolean;
  hasClientProfile: boolean;
  hasSupplierProfile: boolean;
  departmentId: number | null;
  employeeStatus: ProfileStatus | null;
  clientStatus: ProfileStatus | null;
  supplierStatus: ProfileStatus | null;
};

type NotifyFn = (payload: {
  title?: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  durationMs?: number;
}) => void;

type UseUsersActionsParams = {
  editorUserId: number | null;
  editor: UsersEditorState | null;
  editorInitial: UsersEditorState | null;
  loadData: () => Promise<void>;
  notify: NotifyFn;
  setActionBusyId: Dispatch<SetStateAction<number | null>>;
  setEditorVisible: Dispatch<SetStateAction<boolean>>;
  setEditorSaving: Dispatch<SetStateAction<boolean>>;
  setEditorUserId: Dispatch<SetStateAction<number | null>>;
  setEditor: Dispatch<SetStateAction<UsersEditorState | null>>;
  setEditorInitial: Dispatch<SetStateAction<UsersEditorState | null>>;
};

function toEditorState(profile: Profile): UsersEditorState {
  return {
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    middleName: profile.middleName || '',
    email: profile.email || '',
    phone: formatPhone(profile.phone),
    newPassword: '',
    roleId: profile.role?.id ?? null,
    accountStatus: profile.profileStatus,
    currentProfileType: profile.currentProfileType ?? null,
    hasEmployeeProfile: Boolean(profile.employeeProfile),
    hasClientProfile: Boolean(profile.clientProfile),
    hasSupplierProfile: Boolean(profile.supplierProfile),
    departmentId: profile.employeeProfile?.department?.id ?? null,
    employeeStatus: profile.employeeProfile?.status ?? null,
    clientStatus: profile.clientProfile?.status ?? null,
    supplierStatus: profile.supplierProfile?.status ?? null,
  };
}

export function useUsersActions({
  editorUserId,
  editor,
  editorInitial,
  loadData,
  notify,
  setActionBusyId,
  setEditorVisible,
  setEditorSaving,
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
        const next = toEditorState(profile);
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

    const nextPassword = editor.newPassword.trim();
    if (nextPassword.length > 0 && nextPassword.length < 6) {
      notify({
        type: 'error',
        title: 'Ошибка сохранения',
        message: 'Новый пароль должен содержать минимум 6 символов',
      });
      return;
    }

    setEditorSaving(true);
    try {
      let hasChanges = false;

      const userPatch: Record<string, unknown> = {};
      const nextFirstName = editor.firstName.trim();
      const nextLastName = editor.lastName.trim();
      const nextMiddleName = editor.middleName.trim();
      const nextEmail = editor.email.trim();

      if (nextFirstName !== editorInitial.firstName.trim()) userPatch.firstName = nextFirstName;
      if (nextLastName !== editorInitial.lastName.trim()) userPatch.lastName = nextLastName;
      if (nextMiddleName !== editorInitial.middleName.trim()) userPatch.middleName = nextMiddleName;
      if (nextEmail !== editorInitial.email.trim()) userPatch.email = nextEmail;
      if (editor.phone !== editorInitial.phone) userPatch.phone = toApiPhoneDigitsString(editor.phone) || '';
      if (editor.accountStatus !== editorInitial.accountStatus) userPatch.profileStatus = editor.accountStatus;

      if (Object.keys(userPatch).length) {
        await adminUpdateUser(editorUserId, userPatch);
        hasChanges = true;
      }

      if (editor.roleId && editor.roleId !== editorInitial.roleId) {
        await assignUserRole(editorUserId, { roleId: editor.roleId });
        hasChanges = true;
      }

      if (editor.hasEmployeeProfile) {
        const employeePatch: Record<string, unknown> = {};
        if (editor.departmentId !== editorInitial.departmentId) employeePatch.departmentId = editor.departmentId;
        if (editor.employeeStatus && editor.employeeStatus !== editorInitial.employeeStatus) {
          employeePatch.status = editor.employeeStatus;
        }
        if (Object.keys(employeePatch).length) {
          await adminUpdateUserProfile(editorUserId, 'employee', employeePatch);
          hasChanges = true;
        }
      }

      if (editor.hasClientProfile && editor.clientStatus && editor.clientStatus !== editorInitial.clientStatus) {
        await adminUpdateUserProfile(editorUserId, 'client', { status: editor.clientStatus });
        hasChanges = true;
      }

      if (editor.hasSupplierProfile && editor.supplierStatus && editor.supplierStatus !== editorInitial.supplierStatus) {
        await adminUpdateUserProfile(editorUserId, 'supplier', { status: editor.supplierStatus });
        hasChanges = true;
      }

      if (nextPassword.length > 0) {
        await adminUpdatePassword(editorUserId, nextPassword);
        hasChanges = true;
      }

      if (!hasChanges) {
        notify({
          type: 'info',
          title: 'Без изменений',
          message: 'Нет изменений для сохранения',
        });
        return;
      }

      await loadData();
      setEditorVisible(false);
      notify({
        type: 'success',
        title: 'Сохранено',
        message: 'Изменения пользователя успешно сохранены',
      });
    } catch (error: any) {
      notify({
        type: 'error',
        title: 'Ошибка сохранения',
        message: error?.message || 'Не удалось сохранить изменения пользователя',
      });

      try {
        const refreshed = await getProfileById(editorUserId);
        if (refreshed) {
          const next = toEditorState(refreshed);
          setEditor(next);
          setEditorInitial(next);
        }
      } catch {
        // no-op: keep editor state as is if refresh failed
      }
    } finally {
      setEditorSaving(false);
    }
  }, [
    editor,
    editorInitial,
    editorUserId,
    loadData,
    notify,
    setEditor,
    setEditorInitial,
    setEditorSaving,
    setEditorVisible,
  ]);

  return {
    openEditor,
    doModeration,
    saveEditor,
  };
}
