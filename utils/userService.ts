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