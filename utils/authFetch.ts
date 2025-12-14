// utils/authFetch.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { API_BASE_URL } from './config';
import { refreshToken as refreshTokenService, saveTokens } from './tokenService';

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
};

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Добавляем токен в заголовки
apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('accessToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Обработка ошибок и автоматическое обновление токена
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
      if (isRefreshing) {
        // Ждем, пока токен обновится
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccess = await refreshTokenService();
        if (!newAccess) {
          throw new Error('Refresh failed');
        }

        // Подстрахуемся: если tokenService сохранил новый refresh, он уже в AsyncStorage
        // Убедимся, что клиент пойдёт с новым access
        // Обновляем дефолтные заголовки и сам оригинальный запрос
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`;
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        }
        onRefreshed(newAccess);

        return apiClient(originalRequest);
      } catch (refreshError) {
        // Не выпиливаем токены в фоне, чтобы не дропать сессию при временных сбоях
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Универсальная функция для выполнения запросов с типизацией
 * @param url - путь API
 * @param config - конфигурация запроса (method, body и т.п.)
 */
export async function authFetch<Req = any, Res = any>(
  url: string,
  config?: Omit<AxiosRequestConfig, 'url' | 'data'> & { body?: Req }
): Promise<{ ok: boolean; data?: Res; message?: string; status?: number }> {
  try {
    const axiosConfig: AxiosRequestConfig = {
      url,
      method: config?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...config?.headers,
      },
      data: config?.body ? JSON.stringify(config.body) : undefined,
      timeout: 10000,
    };

    const response: AxiosResponse<any> = await apiClient.request(axiosConfig);

    // Раскрываем вложенность data, если она есть
    const payload = response.data;

    return {
      ok: true,
      data: payload?.data ?? payload,
      status: response.status,
    };
  } catch (error) {
    let message = 'Unknown error';
    let status: number | undefined = undefined;

    if (axios.isAxiosError(error)) {
      status = error.response?.status;
      message = error.response?.data?.message || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    return {
      ok: false,
      message,
      status,
    };
  }
}

export default apiClient;
