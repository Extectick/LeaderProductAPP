// utils/userService.ts
import type {
  CreateClientProfileDto,
  CreateEmployeeProfileDto,
  CreateSupplierProfileDto,
  ProfileStatus,
  ProfileType
} from '@/types/userTypes';
import type {
  EmailChangeSessionData,
  EmailChangeStartResponseData,
  PhoneVerificationSessionData,
  PhoneVerificationStartResponseData,
} from '@/types/apiTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Profile } from '../types/userTypes';
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';
import { Platform } from 'react-native';
const PROFILE_KEY = 'profile';

export type Department = { id: number; name: string };


export async function createProfile(
  type: 'CLIENT' | 'SUPPLIER' | 'EMPLOYEE',
  profileData: CreateClientProfileDto | CreateSupplierProfileDto | CreateEmployeeProfileDto
): Promise<Profile | null> {
  const res = await apiClient(`/users/profiles/${type.toLowerCase()}`, {
    method: 'POST',
    body: profileData,
  });
  if (!res.ok) throw new Error(res.message);

  // Получим обновленный профиль после создания
  return getProfile();
}

export async function getDepartments(): Promise<Department[]> {
  const res = await apiClient<void, Department[]>(API_ENDPOINTS.USERS.DEPARTMENTS);
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export type Permission = string;

export type RoleItem = {
  id: number;
  name: string;
  parentRole: { id: number; name: string } | null;
  permissions: string[];
};

export async function getPermissions(): Promise<Permission[]> {
  const res = await apiClient<void, any>(API_ENDPOINTS.USERS.PERMISSIONS);
  if (!res.ok) throw new Error(res.message);
  const data = res.data || [];
  return Array.isArray(data)
    ? data.map((p: any) => (typeof p === 'string' ? p : p?.name)).filter(Boolean)
    : [];
}

export async function getRoles(): Promise<RoleItem[]> {
  const res = await apiClient<void, RoleItem[]>(API_ENDPOINTS.USERS.ROLES);
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export async function createRole(payload: { name: string; parentRoleId?: number | null; permissions?: string[] }) {
  const res = await apiClient<typeof payload, { id: number; name: string }>(API_ENDPOINTS.USERS.ROLES, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function updateRole(
  roleId: number,
  payload: { name?: string; parentRoleId?: number | null }
) {
  const res = await apiClient<typeof payload, { id: number; name: string }>(API_ENDPOINTS.USERS.ROLE_BY_ID(roleId), {
    method: 'PATCH',
    body: payload,
  });
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function updateRolePermissions(roleId: number, permissions: string[]) {
  const res = await apiClient<{ permissions: string[] }, { message: string }>(
    API_ENDPOINTS.USERS.ROLE_PERMISSIONS(roleId),
    { method: 'PATCH', body: { permissions } }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function deleteRole(roleId: number) {
  const res = await apiClient<void, { message: string }>(API_ENDPOINTS.USERS.ROLE_BY_ID(roleId), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function assignUserRole(userId: number, payload: { roleId?: number; roleName?: string }) {
  const res = await apiClient<typeof payload, { message: string }>(API_ENDPOINTS.USERS.USER_ROLE(userId), {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function createDepartment(name: string) {
  const res = await apiClient<{ name: string }, Department[]>(API_ENDPOINTS.USERS.DEPARTMENTS, {
    method: 'POST',
    body: { name },
  });
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export async function updateDepartment(id: number, name: string) {
  const res = await apiClient<{ name: string }, Department[]>(API_ENDPOINTS.USERS.DEPARTMENT_BY_ID(id), {
    method: 'PATCH',
    body: { name },
  });
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export async function deleteDepartment(id: number) {
  const res = await apiClient<void, Department[]>(API_ENDPOINTS.USERS.DEPARTMENT_BY_ID(id), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export async function getDepartmentUsers(departmentId: number): Promise<AdminUserItem[]> {
  const res = await apiClient<void, AdminUserItem[]>(API_ENDPOINTS.USERS.DEPARTMENT_USERS(departmentId));
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export type AdminUserItem = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  middleName?: string | null;
  phone: string | null;
  avatarUrl?: string | null;
  profileStatus?: ProfileStatus;
  currentProfileType?: ProfileType | null;
  departmentName?: string | null;
  role: { id: number; name: string } | null;
  lastSeenAt?: string | null;
  isOnline?: boolean;
};

export async function getUsers(search?: string): Promise<AdminUserItem[]> {
  const res = await apiClient<void, AdminUserItem[]>(API_ENDPOINTS.USERS.USERS(search));
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export async function getProfile(): Promise<Profile | null> {
  const res = await apiClient<void, { profile: Profile }>(API_ENDPOINTS.USERS.PROFILE);
  if (!res.ok) {
    if (res.status === 403) {
      try {
        const cached = await AsyncStorage.getItem(PROFILE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as Profile;
          const blocked = { ...parsed, profileStatus: 'BLOCKED' as ProfileStatus };
          await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(blocked));
          return blocked;
        }
      } catch {}
    }
    console.error('Ошибка получения профиля:', res.message);
    return null;
  }
  const profile = res.data?.profile || null;
  if (profile) {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  return profile;
}

export async function getProfileById(userId?: number | null): Promise<Profile | null> {
  const url =
    userId == null
      ? API_ENDPOINTS.USERS.PROFILE
      : API_ENDPOINTS.USERS.PROFILE_BY_ID(Number(userId)); // /users/:userId/profile

  const res = await apiClient<void, { profile: Profile }>(url);
  if (!res.ok) {
    console.error('Ошибка получения профиля:', res.message);
    return null;
  }

  const profile = res.data?.profile ?? null;

  // Кэшируем только свой профиль (как делал прежний getProfile)
  if (profile && userId == null) {
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {}
  }

  return profile;
}

export async function setCurrentProfileType(type: ProfileType | null): Promise<Profile | null> {
  const res = await apiClient<{ type: ProfileType | null }, { profile: Profile }>(API_ENDPOINTS.USERS.CURRENT_PROFILE, {
    method: 'PATCH',
    body: { type },
  });
  if (!res.ok) throw new Error(res.message || 'Не удалось выбрать профиль');
  const profile = res.data?.profile || null;
  if (profile) {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  return profile;
}

export type UpdateMyProfilePayload = {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  email?: string;
  phone?: string | null;
};

export async function updateMyProfile(payload: UpdateMyProfilePayload): Promise<Profile | null> {
  const res = await apiClient<UpdateMyProfilePayload, { profile: Profile }>(API_ENDPOINTS.USERS.PROFILE, {
    method: 'PATCH',
    body: payload,
  });
  if (!res.ok) throw new Error(res.message || 'Не удалось обновить профиль');
  const profile = res.data?.profile || null;
  if (profile) {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  return profile;
}

export async function startPhoneVerification(phone: string): Promise<PhoneVerificationStartResponseData> {
  const res = await apiClient<{ phone: string }, PhoneVerificationStartResponseData>(
    API_ENDPOINTS.USERS.PHONE_VERIFICATION_START,
    {
      method: 'POST',
      body: { phone },
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось запустить верификацию телефона');
  const deepLink = String(res.data.deepLinkUrl || '').trim();
  if (!deepLink || !/^https:\/\/t\.me\/.+\?start=verify_phone_[A-Za-z0-9_-]+$/.test(deepLink)) {
    throw new Error('Telegram ссылка не получена. Проверьте настройки сервера.');
  }
  return res.data;
}

export async function getPhoneVerificationStatus(sessionId: string): Promise<PhoneVerificationSessionData> {
  const res = await apiClient<void, { session: PhoneVerificationSessionData }>(
    API_ENDPOINTS.USERS.PHONE_VERIFICATION_STATUS(sessionId),
    { method: 'GET' }
  );
  if (!res.ok || !res.data?.session) throw new Error(res.message || 'Не удалось получить статус верификации');
  return res.data.session;
}

export async function cancelPhoneVerification(sessionId: string): Promise<boolean> {
  const res = await apiClient<void, { cancelled: boolean }>(
    API_ENDPOINTS.USERS.PHONE_VERIFICATION_CANCEL(sessionId),
    { method: 'POST' }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось отменить верификацию');
  return Boolean(res.data.cancelled);
}

export async function startEmailChange(email: string): Promise<EmailChangeStartResponseData> {
  const res = await apiClient<{ email: string }, EmailChangeStartResponseData>(
    API_ENDPOINTS.USERS.EMAIL_CHANGE_START,
    {
      method: 'POST',
      body: { email: String(email || '').trim() },
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось запустить смену email');
  return res.data;
}

export async function getEmailChangeStatus(sessionId: string): Promise<EmailChangeSessionData> {
  const res = await apiClient<void, { session: EmailChangeSessionData }>(
    API_ENDPOINTS.USERS.EMAIL_CHANGE_STATUS(sessionId),
    { method: 'GET' }
  );
  if (!res.ok || !res.data?.session) throw new Error(res.message || 'Не удалось получить статус смены email');
  return res.data.session;
}

export async function resendEmailChangeCode(sessionId: string): Promise<boolean> {
  const res = await apiClient<void, { resent: boolean }>(
    API_ENDPOINTS.USERS.EMAIL_CHANGE_RESEND(sessionId),
    { method: 'POST' }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось отправить код повторно');
  return Boolean(res.data.resent);
}

export async function verifyEmailChange(sessionId: string, code: string): Promise<Profile | null> {
  const res = await apiClient<{ code: string }, { profile: Profile }>(
    API_ENDPOINTS.USERS.EMAIL_CHANGE_VERIFY(sessionId),
    {
      method: 'POST',
      body: { code: String(code || '').trim() },
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось подтвердить смену email');
  const profile = res.data.profile || null;
  if (profile) {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  return profile;
}

export async function cancelEmailChange(sessionId: string): Promise<boolean> {
  const res = await apiClient<void, { cancelled: boolean }>(
    API_ENDPOINTS.USERS.EMAIL_CHANGE_CANCEL(sessionId),
    { method: 'POST' }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось отменить смену email');
  return Boolean(res.data.cancelled);
}

export async function getUserProfileById(userId: number): Promise<Profile | null> {
  return getProfileById(userId);
}

export async function adminUpdateUser(
  userId: number,
  payload: Partial<{
    firstName: string;
    lastName: string;
    middleName: string;
    email: string;
    phone: string;
    profileStatus: string;
    departmentId: number | null;
  }>
) {
  const res = await apiClient<typeof payload, { profile: Profile }>(API_ENDPOINTS.USERS.USER_ADMIN_UPDATE(userId), {
    method: 'PATCH',
    body: payload,
  });
  if (!res.ok) throw new Error(res.message);
  return res.data?.profile || null;
}

export type AdminProfileUpdatePayload = {
  status?: ProfileStatus;
  phone?: string | null;
  departmentId?: number | null;
  address?: {
    street: string;
    city: string;
    state?: string | null;
    postalCode?: string | null;
    country: string;
  } | null;
};

export async function adminUpdateUserProfile(
  userId: number,
  type: 'client' | 'supplier' | 'employee',
  payload: AdminProfileUpdatePayload
): Promise<Profile | null> {
  const res = await apiClient<AdminProfileUpdatePayload, { profile: Profile }>(
    API_ENDPOINTS.USERS.USER_PROFILE_UPDATE(userId, type),
    { method: 'PATCH', body: payload }
  );
  if (!res.ok) throw new Error(res.message || 'Не удалось обновить профиль');
  return res.data?.profile || null;
}

export async function adminUpdatePassword(userId: number, password: string) {
  const res = await apiClient<{ password: string }, { message: string }>(
    API_ENDPOINTS.USERS.USER_ADMIN_PASSWORD(userId),
    { method: 'PATCH', body: { password } }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

const guessExt = (uri: string) => {
  const clean = uri.split('?')[0] || '';
  const ext = clean.split('.').pop() || 'jpg';
  return ext.toLowerCase();
};

const guessMime = (ext: string) => {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'image/jpeg';
};

export async function uploadProfileAvatar(type: ProfileType, file: { uri: string; name?: string; type?: string }) {
  const typeKey = String(type || '').toLowerCase() as 'client' | 'supplier' | 'employee';
  if (!['client', 'supplier', 'employee'].includes(typeKey)) {
    throw new Error('Недопустимый тип профиля');
  }

  const ext = guessExt(file.uri);
  const mime = file.type || guessMime(ext);
  const name = file.name || `avatar.${ext}`;

  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(file.uri)).blob();
    form.append('avatar', blob, name);
  } else {
    form.append('avatar', { uri: file.uri, name, type: mime } as any);
  }

  const res = await apiClient<FormData, { profile: Profile }>(
    API_ENDPOINTS.USERS.PROFILE_AVATAR(typeKey),
    {
      method: 'POST',
      body: form,
    }
  );
  if (!res.ok) throw new Error(res.message || 'Не удалось загрузить аватар');
  return res.data?.profile ?? null;
}
