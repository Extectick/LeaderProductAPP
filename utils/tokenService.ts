// utils/tokenService.ts
// import { User } from '@/types/apiTypes';
import { Profile } from '@/types/userTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';

const ACCESS_KEY = 'accessToken';
const MAX_REFRESH_ATTEMPTS = 3;
let refreshAttempts = 0;

async function fetch<T>(url: string, options: RequestInit): Promise<T> {
  const response = await window.fetch(`${API_BASE_URL}${url}`, options);
  if (!response.ok) throw new Error(`HTTP error ${response.status}`);
  return response.json();
}
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';
const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.30.54:3000';

/**
 * Получить accessToken из AsyncStorage
 */
export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_KEY);
}

/**
 * Сохранить accessToken и refreshToken в AsyncStorage
 */
export async function saveTokens(accessToken: string, refreshToken: string, profile?: Profile): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
    [PROFILE_KEY, profile ? JSON.stringify(profile) : ''],
  ]);
}

export async function getProfile(): Promise<Profile | null> {
  const profileString = await AsyncStorage.getItem(PROFILE_KEY);
  return profileString ? JSON.parse(profileString) : null;
}

/**
 * Очистить токены и перенаправить на экран авторизации
 */
export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, PROFILE_KEY]);
  router.replace('/AuthScreen');
}

/**
 * Попытаться обновить accessToken по refreshToken
 */
export async function refreshToken(): Promise<string | null> {
  if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
    await logout();
    return null;
  }

  refreshAttempts++;

  const storedRefreshToken = await AsyncStorage.getItem(REFRESH_KEY);
  if (!storedRefreshToken) {
    await logout();
    return null;
  }

  try {
    const response = await fetch<{
      accessToken: string;
      refreshToken: string;
    }>('/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
    });

    if (!response.accessToken) {
      throw new Error('Отсутствует accessToken в ответе обновления');
    }

    refreshAttempts = 0; // Сброс счетчика при успехе
    await AsyncStorage.setItem(REFRESH_KEY, response.refreshToken);
    await AsyncStorage.setItem(ACCESS_KEY, response.accessToken);
    return response.accessToken;
  } catch (err) {
    console.warn('Ошибка при обновлении токена:', err);
    if (err instanceof Error && err.message.includes('403')) {
      await logout();
    }
    return null;
  }
}
