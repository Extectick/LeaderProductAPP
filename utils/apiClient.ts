// utils/apiClient.ts
import Constants from 'expo-constants';
import { getAccessToken, logout, refreshToken as refreshTokens } from './tokenService';

const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.30.54:3000';

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  message?: string;
  status: number;
}

interface RequestOptions<Req> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: Req | string;
  headers?: Record<string, string>;
  skipAuth?: boolean; // если не нужен токен
}

/**
 * Универсальная функция для API запросов с автоматическим добавлением токенов и обновлением при 401.
 */
export async function apiClient<Req = undefined, Res = any>(
  path: string,
  options: RequestOptions<Req> = {}
): Promise<ApiResponse<Res>> {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options;

  // Встроить базовый URL
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  // Получить accessToken, если нужен
  let token = !skipAuth ? await getAccessToken() : null;

  // Подготовить заголовки
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

  // Вспомогательная функция fetch-запроса
  async function fetchWithToken(tk: string | null): Promise<Response> {
    const h = { ...reqHeaders };
    if (tk) h['Authorization'] = `Bearer ${tk}`;

    const reqBody: BodyInit | undefined = ['GET', 'HEAD'].includes(method)
        ? undefined
        : (typeof body === 'string' ? body : JSON.stringify(body));

    return fetch(url, {
        method,
        headers: h,
        body: reqBody,
    });
  }

  try {
    let response = await fetchWithToken(token);

    // Если 401 — попытка обновить токен и повторить запрос
    if (response.status === 401 && !skipAuth) {
      const newToken = await refreshTokens();
      console.log('Новый токен: ' + newToken)
      if (!newToken) {
        await logout();
        return { ok: false, status: 401, message: 'Unauthorized - token expired' };
      }
      token = newToken;
      response = await fetchWithToken(token);
    }

    const status = response.status;
    const json = await response.json().catch(() => ({}));

    // Разворачиваем вложенный data, если он есть
    const responseData = json.data !== undefined ? json.data : json;

    if (!response.ok) {
      return {
        ok: false,
        status,
        message: json.message || json.error || `HTTP error ${status}`,
      };
    }

    return {
      ok: true,
      status,
      data: responseData as Res,
    };
  } catch (error: any) {
    console.error('apiClient fetch error:', error);
    return {
      ok: false,
      status: 0,
      message: error.message || 'Network error',
    };
  }
}
