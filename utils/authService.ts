// utils/authService.ts
import { Department, LoginResponse, Profile } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from './authFetch';
import { logout as logoutTokensOnly, saveTokens } from './tokenService';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';

// Получить профиль пользователя
export const getProfile = async (): Promise<Profile | null> => {
  try {
    const profile = await authFetch<Profile>('/users/profile');
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  } catch (error: any) {
    console.error('Ошибка получения профиля:', error);
    return null;
  }
};

// Получить список отделов
export const getDepartments = async (): Promise<Department[]> => {
  return await authFetch<Department[]>('/users/departments');
};

// Логин (сохраняет токены, возвращает ответ)
export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const data = await authFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  
  const { accessToken, refreshToken } = data;
  await saveTokens(accessToken, refreshToken);

  return data;
};

// Регистрация
export const register = async (email: string, password: string): Promise<void> => {
  await authFetch('/auth/register', {
    method: 'POST',
    body: { email, password },
  });
};

// Верификация (например, email+код)
export const verify = async (email: string, code: string): Promise<Profile | null> => {
  try {
    const { accessToken, refreshToken, profile } = await authFetch<LoginResponse>('/auth/verify', {
      method: 'POST',
      body: { email, code },
    });

    await saveTokens(accessToken, refreshToken);

    if (profile) {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      return profile;
    }

    return null;
  } catch (error: any) {
    throw new Error(error.message || 'Ошибка подтверждения');
  }
};

// Выход: очищает токены и делает POST /auth/logout
export const logout = async (): Promise<void> => {
  try {
    await authFetch('/auth/logout', {
      method: 'POST',
      parseJson: false, // не обязательно получать JSON-ответ
    });
  } catch (e) {
    // Игнорируем ошибку (например, если токен уже невалиден)
    console.warn('Ошибка при logout:', e);
  } finally {
    await logoutTokensOnly();
  }
};
