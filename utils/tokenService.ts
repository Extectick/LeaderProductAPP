// utils/tokenService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { apiClient } from './apiClient';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';

const MAX_REFRESH_ATTEMPTS = 3;
let refreshAttempts = 0;

export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string, profile?: any): Promise<void> {
  const items: [string, string][] = [
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
  ];
  if (profile) items.push([PROFILE_KEY, JSON.stringify(profile)]);
  await AsyncStorage.multiSet(items);

  console.log('Сохранён профиль:', profile);
  refreshAttempts = 0; // сброс попыток при новом токене
}

export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, PROFILE_KEY]);
  router.replace('/AuthScreen');
}

export async function refreshToken(): Promise<string | null> {
  if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
    console.warn('Достигнут максимум попыток обновления токена');
    await logout();
    return null;
  }
  refreshAttempts++;

  const storedRefreshToken = await getRefreshToken();
  if (!storedRefreshToken) {
    await logout();
    return null;
  }

  try {
    const response = await apiClient<{ refreshToken: string }, { accessToken: string; refreshToken: string }>(
      '/auth/token',
      {
        method: 'POST',
        body: { refreshToken: storedRefreshToken },
        skipAuth: true,
      }
    );

    if (!response.ok) {
      throw new Error(response.message || 'Ошибка обновления токена');
    }

    if (!response.data?.accessToken) {
      throw new Error('Отсутствует accessToken в ответе');
    }

    await saveTokens(response.data.accessToken, response.data.refreshToken);
    refreshAttempts = 0;
    return response.data.accessToken;
  } catch (error) {
    console.error('Ошибка при обновлении токена:', error);
    await logout();
    return null;
  }
}
