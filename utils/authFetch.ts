// utils/authFetch.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { router } from 'expo-router';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL_DEV!;

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

    if (error.response?.status === 403 && !originalRequest._retry) {
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
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('Refresh token is missing');

        // Запрос обновления токена (замените URL на ваш)
        const { data } = await axios.post(`${API_BASE_URL}/auth/token`, { refreshToken });

        if (!data.accessToken) throw new Error('No access token in response');

        await AsyncStorage.setItem('accessToken', data.accessToken);
        await AsyncStorage.setItem('refreshToken', data.refreshToken);

        apiClient.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
        onRefreshed(data.accessToken);

        return apiClient(originalRequest);
      } catch (refreshError) {
        await AsyncStorage.removeItem('accessToken');
        await AsyncStorage.removeItem('refreshToken');
        router.replace('/(auth)/AuthScreen');
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
): Promise<{ ok: boolean; data?: Res; message?: string }> {
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
    };
  } catch (error) {
    let message = 'Unknown error';

    if (axios.isAxiosError(error)) {
      message = error.response?.data?.message || error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    return {
      ok: false,
      message,
    };
  }
}

export default apiClient;
