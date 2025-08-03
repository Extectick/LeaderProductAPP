// utils/authFetch.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorCodes, ErrorResponse, SuccessResponse } from './../types/apiResponseTypes';
import { logout as clearTokens, refreshToken } from './tokenService';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

interface AuthFetchOptions<TRequest = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: TRequest | string;
  headers?: Record<string, string>;
  parseJson?: boolean;
}

/**
 * Универсальный fetch с авторизацией и автообновлением токена
 */
export async function authFetch<TRequest = unknown, TResponse = unknown>(
  url: string,
  options: AuthFetchOptions<TRequest> = {}
): Promise<SuccessResponse<TResponse> | ErrorResponse> {
  const { method = 'GET', body, parseJson = true } = options;

  let token = await AsyncStorage.getItem('accessToken');
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  };

  let response = await fetch(`${API_BASE_URL}${url}`, fetchOptions);

  // Пропускаем обновление токена для запросов авторизации
  if (url.includes('/auth/login') || url.includes('/auth/register')) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Ошибка авторизации');
    }
    return data;
  }

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

  if (!parseJson) {
    return {
      ok: true,
      message: 'Success',
      data: {} as TResponse
    };
  }

  const data = await response.json();
  
  if (!response.ok) {
    return {
      ok: false,
      message: data.message || 'Ошибка запроса',
      error: {
        code: data.code || ErrorCodes.INTERNAL_ERROR,
        details: data.details
      }
    };
  }

  return {
    ok: true,
    message: data.message || 'Success',
    data: data.data,
    meta: data.meta
  };
}
