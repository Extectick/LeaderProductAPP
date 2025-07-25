import { Profile } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.API_BASE_URL || 'http://localhost:3000';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  profile?: Profile;
  // message?: string; // если хочешь добавить сюда, но лучше не надо
}


export const login = async (email: string, password: string): Promise<Profile | null> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const data = isJson ? await response.json() : {};

  if (!response.ok) {
    throw new Error(data.message || 'Ошибка входа');
  }

  const { accessToken, refreshToken, profile } = data as LoginResponse;

  await AsyncStorage.multiSet([
    ['accessToken', accessToken],
    ['refreshToken', refreshToken]
  ]);

  return profile || null;
};



export const register = async (email: string, password: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Ошибка регистрации');
  }
};

export const verify = async (email: string, code: string): Promise<Profile | null> => {
  const response = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });

  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const data = isJson ? await response.json() : {};

  if (!response.ok) {
    throw new Error(data.message || 'Ошибка подтверждения');
  }

  const { accessToken, refreshToken, profile } = data as LoginResponse;

  await AsyncStorage.multiSet([
    ['accessToken', accessToken],
    ['refreshToken', refreshToken],
  ]);

  return typeof profile !== 'undefined' ? profile : await getProfile(accessToken);
};



export const logout = async (): Promise<void> => {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
};

export const refreshToken = async (): Promise<string | null> => {
  const storedRefreshToken = await AsyncStorage.getItem(REFRESH_KEY);
  if (!storedRefreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
    });

    const data = await response.json();
    if (!response.ok || !data?.accessToken) {
      throw new Error(data.message || 'Ошибка обновления токена');
    }

    await AsyncStorage.setItem(ACCESS_KEY, data.accessToken);
    return data.accessToken;
  } catch (err) {
    console.warn('Ошибка при обновлении токена:', err);
    await logout();
    return null;
  }
};

export const getProfile = async (accessToken?: string): Promise<Profile> => {
  const token = accessToken || (await AsyncStorage.getItem(ACCESS_KEY));
  if (!token) throw new Error('Отсутствует accessToken');

  const response = await fetch(`${API_BASE_URL}/profiles/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Ошибка получения профиля');
  }

  return data;
};

export const ensureAuth = async (): Promise<string | null> => {
  const token = await AsyncStorage.getItem(ACCESS_KEY);
  if (token) return token;

  const newToken = await refreshToken();
  return newToken;
};
