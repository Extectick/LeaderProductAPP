// utils/tokenService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

const API_BASE_URL = Constants.expoConfig?.extra?.API_BASE_URL || 'http://localhost:3000';

/**
 * Получить accessToken из AsyncStorage
 */
export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_KEY);
}

/**
 * Сохранить accessToken и refreshToken в AsyncStorage
 */
export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
  ]);
}

/**
 * Очистить токены и перенаправить на экран авторизации
 */
export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
  router.replace('/(auth)/AuthScreen');
}

/**
 * Попытаться обновить accessToken по refreshToken
 */
export async function refreshToken(): Promise<string | null> {
  const storedRefreshToken = await AsyncStorage.getItem(REFRESH_KEY);
  if (!storedRefreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
    });

    if (!response.ok) {
      // На всякий случай попробуем прочитать текст ошибки
      const text = await response.text();
      console.warn('refreshToken response not OK:', response.status, text);
      throw new Error('Ошибка обновления токена');
    }

    const data = await response.json();
    if (!data.accessToken) {
      throw new Error('Отсутствует accessToken в ответе обновления');
    }

    await AsyncStorage.setItem(ACCESS_KEY, data.accessToken);
    return data.accessToken;
  } catch (err) {
    console.warn('Ошибка при обновлении токена:', err);
    await logout();
    return null;
  }
}
