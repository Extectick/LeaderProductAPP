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

export type PermissionGroupItem = {
  id: number;
  key: string;
  displayName: string;
  description: string;
  isSystem: boolean;
  sortOrder?: number;
  serviceId?: number | null;
  service?: { id: number; key: string; name: string } | null;
};

export type PermissionItem = {
  id: number;
  name: string;
  displayName?: string;
  description?: string;
  group?: PermissionGroupItem | null;
};

export type RoleItem = {
  id: number;
  name: string;
  displayName?: string;
  parentRole: { id: number; name: string; displayName?: string } | null;
  permissions: string[];
};

function parsePermissionGroup(raw: any): PermissionGroupItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = String(raw.key || '').trim();
  if (!key) return null;
  return {
    id: Number(raw.id) || 0,
    key,
    displayName: String(raw.displayName || key),
    description: String(raw.description || ''),
    isSystem: Boolean(raw.isSystem),
    sortOrder: raw.sortOrder == null ? undefined : Number(raw.sortOrder),
    serviceId: raw.serviceId == null ? null : Number(raw.serviceId),
    service: raw.service
      ? {
          id: Number(raw.service.id) || 0,
          key: String(raw.service.key || ''),
          name: String(raw.service.name || ''),
        }
      : null,
  };
}

export async function getPermissions(): Promise<PermissionItem[]> {
  const res = await apiClient<void, any>(API_ENDPOINTS.USERS.PERMISSIONS);
  if (!res.ok) throw new Error(res.message);
  const data = res.data || [];
  return Array.isArray(data)
    ? data
        .map((p: any) => {
          if (typeof p === 'string') {
            return { id: 0, name: p, displayName: p, description: '' };
          }
          if (!p?.name) return null;
          return {
            id: Number(p.id) || 0,
            name: p.name,
            displayName: p.displayName || p.name,
            description: p.description || '',
            group: parsePermissionGroup(p.group),
          } as PermissionItem;
        })
        .filter(Boolean) as PermissionItem[]
    : [];
}

export async function getPermissionGroups(): Promise<PermissionGroupItem[]> {
  const res = await apiClient<void, any>(API_ENDPOINTS.USERS.PERMISSION_GROUPS);
  if (!res.ok) throw new Error(res.message);
  const data = res.data || [];
  return Array.isArray(data)
    ? data.map((item: any) => parsePermissionGroup(item)).filter(Boolean) as PermissionGroupItem[]
    : [];
}

export async function createPermissionGroup(payload: {
  key: string;
  displayName: string;
  description?: string;
  sortOrder?: number;
  serviceId?: number | null;
}) {
  const res = await apiClient<typeof payload, PermissionGroupItem>(API_ENDPOINTS.USERS.PERMISSION_GROUPS, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) throw new Error(res.message);
  return parsePermissionGroup(res.data) as PermissionGroupItem;
}

export async function updatePermissionGroup(
  groupId: number,
  payload: { displayName?: string; description?: string; sortOrder?: number }
) {
  const res = await apiClient<typeof payload, PermissionGroupItem>(
    API_ENDPOINTS.USERS.PERMISSION_GROUP_BY_ID(groupId),
    {
      method: 'PATCH',
      body: payload,
    }
  );
  if (!res.ok) throw new Error(res.message);
  return parsePermissionGroup(res.data) as PermissionGroupItem;
}

export async function deletePermissionGroup(groupId: number) {
  const res = await apiClient<void, { message: string }>(
    API_ENDPOINTS.USERS.PERMISSION_GROUP_BY_ID(groupId),
    {
      method: 'DELETE',
    }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data;
}

export async function movePermissionToGroup(permissionId: number, groupId: number) {
  const res = await apiClient<{ groupId: number }, PermissionItem>(
    API_ENDPOINTS.USERS.PERMISSION_MOVE_GROUP(permissionId),
    {
      method: 'PATCH',
      body: { groupId },
    }
  );
  if (!res.ok) throw new Error(res.message);
  const data = res.data as any;
  if (!data?.name) {
    throw new Error('Некорректный ответ сервера');
  }
  return {
    id: Number(data.id) || 0,
    name: String(data.name),
    displayName: data.displayName || data.name,
    description: data.description || '',
    group: parsePermissionGroup(data.group),
  } as PermissionItem;
}

export async function getRoles(): Promise<RoleItem[]> {
  const res = await apiClient<void, RoleItem[]>(API_ENDPOINTS.USERS.ROLES);
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export async function createRole(payload: {
  name: string;
  displayName: string;
  parentRoleId?: number | null;
  permissions?: string[];
}) {
  const res = await apiClient<typeof payload, RoleItem>(API_ENDPOINTS.USERS.ROLES, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) throw new Error(res.message);
  const role = res.data as any;
  return {
    ...(role || {}),
    permissions: Array.isArray(role?.permissions) ? role.permissions : [],
  } as RoleItem;
}

export async function updateRole(
  roleId: number,
  payload: { displayName?: string; parentRoleId?: number | null; name?: string }
) {
  const res = await apiClient<typeof payload, RoleItem>(API_ENDPOINTS.USERS.ROLE_BY_ID(roleId), {
    method: 'PATCH',
    body: payload,
  });
  if (!res.ok) throw new Error(res.message);
  const role = res.data as any;
  return {
    ...(role || {}),
    permissions: Array.isArray(role?.permissions) ? role.permissions : [],
  } as RoleItem;
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
  role: { id: number; name: string; displayName?: string } | null;
  lastSeenAt?: string | null;
  isOnline?: boolean;
};

export type AdminModerationState =
  | 'NO_EMPLOYEE_PROFILE'
  | 'EMPLOYEE_PENDING'
  | 'EMPLOYEE_ACTIVE'
  | 'EMPLOYEE_BLOCKED';

export type AdminUsersListItem = AdminUserItem & {
  createdAt?: string | Date | null;
  departmentId?: number | null;
  employeeStatus?: ProfileStatus | null;
  moderationState: AdminModerationState;
  channels: {
    push: boolean;
    telegram: boolean;
    max: boolean;
  };
};

export type AdminUsersPageResponse = {
  items: AdminUsersListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
  };
};

export type AdminUsersListQuery = {
  search?: string;
  page?: number;
  limit?: number;
  moderationState?: AdminModerationState | 'all';
  roleId?: number | null;
  departmentId?: number | null;
  online?: 'online' | 'offline' | 'all';
  sortBy?: 'createdAt' | 'name' | 'email' | 'lastSeenAt' | 'role' | 'status';
  sortDir?: 'asc' | 'desc';
};

export type AdminModerationActionResponse = {
  profile: Profile | null;
  moderation: {
    action: 'APPROVE' | 'REJECT';
    reason: string | null;
    employeeStatusBefore: ProfileStatus;
    employeeStatusAfter: ProfileStatus;
    roleChanged: boolean;
    roleChange: { from: string | null; to: string | null } | null;
    currentProfileTypeReset: boolean;
  };
  notification: {
    pushSent: boolean;
    telegramSent: boolean;
    maxSent: boolean;
    skipped: string[];
  };
};

export async function getUsers(search?: string): Promise<AdminUserItem[]> {
  const res = await apiClient<void, AdminUserItem[]>(API_ENDPOINTS.USERS.USERS(search));
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export async function getAdminUsersPage(query: AdminUsersListQuery = {}): Promise<AdminUsersPageResponse> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.page && query.page > 0) params.set('page', String(query.page));
  if (query.limit && query.limit > 0) params.set('limit', String(query.limit));
  if (query.moderationState && query.moderationState !== 'all') params.set('moderationState', query.moderationState);
  if (query.roleId && query.roleId > 0) params.set('roleId', String(query.roleId));
  if (query.departmentId && query.departmentId > 0) params.set('departmentId', String(query.departmentId));
  if (query.online && query.online !== 'all') params.set('online', query.online);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDir) params.set('sortDir', query.sortDir);

  const path = `${API_ENDPOINTS.USERS.ADMIN_LIST}${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await apiClient<void, AdminUsersPageResponse>(path);
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось получить список пользователей');
  return res.data;
}

export async function moderateEmployeeProfile(
  userId: number,
  payload: { action: 'APPROVE' | 'REJECT'; reason?: string }
): Promise<AdminModerationActionResponse> {
  const res = await apiClient<typeof payload, AdminModerationActionResponse>(
    API_ENDPOINTS.USERS.USER_EMPLOYEE_MODERATION(userId),
    {
      method: 'POST',
      body: payload,
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось выполнить модерацию');
  return res.data;
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

function isValidPhoneVerificationDeepLink(url: string, provider: 'TELEGRAM' | 'MAX') {
  const raw = String(url || '').trim();
  if (!raw) return false;
  if (provider === 'MAX') {
    return /^https:\/\/max\.ru\/.+\?start=verify_phone_[A-Za-z0-9_-]+$/.test(raw);
  }
  return /^https:\/\/t\.me\/.+\?start=verify_phone_[A-Za-z0-9_-]+$/.test(raw);
}

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

export async function startPhoneVerification(
  phone: string,
  provider: 'TELEGRAM' | 'MAX' = 'TELEGRAM'
): Promise<PhoneVerificationStartResponseData> {
  const res = await apiClient<{ phone: string; provider: 'TELEGRAM' | 'MAX' }, PhoneVerificationStartResponseData>(
    API_ENDPOINTS.USERS.PHONE_VERIFICATION_START,
    {
      method: 'POST',
      body: { phone, provider },
    }
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось запустить верификацию телефона');
  const deepLink = String(res.data.deepLinkUrl || '').trim();
  const effectiveProvider = (res.data.provider || provider || 'TELEGRAM') as 'TELEGRAM' | 'MAX';
  if (!isValidPhoneVerificationDeepLink(deepLink, effectiveProvider)) {
    throw new Error(
      effectiveProvider === 'MAX'
        ? 'MAX ссылка не получена. Проверьте настройки сервера.'
        : 'Telegram ссылка не получена. Проверьте настройки сервера.'
    );
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
