// utils/tokenService.ts
// import { User } from '@/types/apiTypes';
import { Profile } from '@/types/userTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ErrorResponse } from './../types/apiResponseTypes';
import { authFetch } from './authFetch';

const ACCESS_KEY = 'accessToken';
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
  const storedRefreshToken = await AsyncStorage.getItem(REFRESH_KEY);
  if (!storedRefreshToken) {
    logout();
    return null
  };
  // console.log(storedRefreshToken)
  try {
    const response = await authFetch<{ refreshToken: string }, { accessToken: string; refreshToken: string }>('/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
    });

    if (!response.ok) {
      const errorResponse = response as unknown as ErrorResponse;
      console.warn('refreshToken error:', errorResponse);
      throw new Error(errorResponse.message || 'Ошибка обновления токена');
    }

    const { data: { accessToken, refreshToken } } = response;

    if (!accessToken) {
      throw new Error('Отсутствует accessToken в ответе обновления');
    }

    await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
    await AsyncStorage.setItem(ACCESS_KEY, accessToken);
    return accessToken;
  } catch (err) {
    console.warn('Ошибка при обновлении токена:', err);
    await logout();
    return null;
  }
}
