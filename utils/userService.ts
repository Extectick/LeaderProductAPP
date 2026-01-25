// utils/userService.ts
import type {
  CreateClientProfileDto,
  CreateEmployeeProfileDto,
  CreateSupplierProfileDto
} from '@/types/userTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Profile } from '../types/userTypes';
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './apiEndpoints';
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
  role: { id: number; name: string } | null;
};

export async function getUsers(search?: string): Promise<AdminUserItem[]> {
  const res = await apiClient<void, AdminUserItem[]>(API_ENDPOINTS.USERS.USERS(search));
  if (!res.ok) throw new Error(res.message);
  return res.data || [];
}

export async function getProfile(): Promise<Profile | null> {
  const res = await apiClient<void, { profile: Profile }>(API_ENDPOINTS.USERS.PROFILE);
  if (!res.ok) {
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

export async function adminUpdatePassword(userId: number, password: string) {
  const res = await apiClient<{ password: string }, { message: string }>(
    API_ENDPOINTS.USERS.USER_ADMIN_PASSWORD(userId),
    { method: 'PATCH', body: { password } }
  );
  if (!res.ok) throw new Error(res.message);
  return res.data;
}
