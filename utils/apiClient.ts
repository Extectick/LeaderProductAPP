import { Profile } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { logout, refreshToken } from './auth';

const API_BASE_URL = Constants.expoConfig?.extra?.API_BASE_URL || 'http://localhost:3000';

async function request<T = any>(endpoint: string, options: RequestInit = {}, retry = true): Promise<T> {
  // Получаем текущий accessToken из AsyncStorage
  let token = await AsyncStorage.getItem('accessToken');

  const headers = new Headers({
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retry) {
    // Попытка обновить токен
    const newToken = await refreshToken();
    if (newToken) {
      // Обновим заголовок и повторим запрос один раз
      token = newToken;
      headers.set('Authorization', `Bearer ${token}`);

      const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!retryResponse.ok) {
        const errorData = await retryResponse.json().catch(() => ({}));
        if (retryResponse.status === 401) {
          await logout();
        }
        throw new Error(errorData.message || 'Ошибка запроса после обновления токена');
      }

      return retryResponse.json();
    } else {
      await logout();
      throw new Error('Unauthorized - токен не обновлен');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Ошибка запроса');
  }

  return response.json();
}

export const getProfile = async (accessToken?: string): Promise<Profile> => {
  const token = accessToken || (await AsyncStorage.getItem('accessToken'));
  if (!token) throw new Error('Токен доступа отсутствует');

  try {
    const profile = await request<Profile>('/users/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!profile || !profile.status) {
      throw new Error('Неверный формат профиля');
    }
    return profile;
  } catch (error) {
    console.error('Ошибка получения профиля:', error);
    throw error;
  }
};

export const apiClient = {
  get: <T = any>(url: string, options?: RequestInit) => request<T>(url, { ...options, method: 'GET' }),
  post: <T = any>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: <T = any>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = any>(url: string, options?: RequestInit) => request<T>(url, { ...options, method: 'DELETE' }),
};
