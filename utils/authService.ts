// utils/authService.ts
import { Department, LoginResponse, Profile } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

// Получить профиль пользователя
export const getProfile = async (): Promise<Profile> => {
  const response = await apiClient.get<Profile>('/users/profile');
  return response.data;
};

// Получить список отделов
export const getDepartments = async (): Promise<Department[]> => {
  const response = await apiClient.get<Department[]>('/users/departments');
  return response.data;
};

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  console.log(response.data)
  return response.data;
};

// Пример регистрации
export const register = async (email: string, password: string): Promise<void> => {
  await apiClient.post('/auth/register', { email, password });
};

// Пример выхода
export const logout = async (): Promise<void> => {
  await apiClient.post('/auth/logout');
};

// Обновление токена
export const refreshToken = async (): Promise<string | null> => {
  try {
    const response = await apiClient.post<{ accessToken: string }>('/auth/refresh');
    return response.data.accessToken;
  } catch (error) {
    return null;
  }
};

// Верификация (например, email+код)
export const verify = async (email: string, code: string): Promise<Profile | null> => {
  try {
    const response = await apiClient.post<LoginResponse>('/auth/verify', { email, code });
    const { accessToken, refreshToken, profile } = response.data;

    await AsyncStorage.multiSet([
      [ACCESS_KEY, accessToken],
      [REFRESH_KEY, refreshToken],
    ]);

    if (profile !== undefined && profile !== null) {
      return profile;
    } else {

      return null;
    }
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Ошибка подтверждения');
  }
};