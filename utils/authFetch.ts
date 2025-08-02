// utils/authFetch.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout as clearTokens, refreshToken } from './tokenService';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

interface AuthFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, any> | string;
  headers?: Record<string, string>;
  parseJson?: boolean; // если не нужно парсить JSON, например для logout
}

/**
 * Универсальный fetch с авторизацией и автообновлением токена
 */
export async function authFetch<T = any>(
  url: string,
  options: AuthFetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, parseJson = true } = options;

  let token = await AsyncStorage.getItem('accessToken');
    console.log('testtesttesttesttesttesttesttest')
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  let response = await fetch(`${API_BASE_URL}${url}`, fetchOptions);

  // Если accessToken протух — попробуем обновить
  if (response.status === 401 || response.status === 403) {
    const newToken = await refreshToken();

    if (!newToken) {
      await clearTokens();
      throw new Error('Не удалось обновить токен. Авторизуйтесь снова.');
    }

    token = newToken;

    // Повторяем запрос с новым токеном
    response = await fetch(`${API_BASE_URL}${url}`, {
      ...fetchOptions,
      headers: {
        ...fetchOptions.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Ошибка запроса');
  }

  if (!parseJson) return {} as T;

  const data: T = await response.json();
  return data;
}
