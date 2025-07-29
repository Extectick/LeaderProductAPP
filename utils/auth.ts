// // utils/auth.ts
// import { Department, Profile } from '@/types';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import Constants from 'expo-constants';
// import { router } from 'expo-router';
// import apiClient from './apiClient';

// const API_BASE_URL = Constants.expoConfig?.extra?.API_BASE_URL || 'http://localhost:3000';

// const ACCESS_KEY = 'accessToken';
// const REFRESH_KEY = 'refreshToken';

// export interface LoginResponse {
//   accessToken: string;
//   refreshToken: string;
//   profile?: Profile;
// }

// // Логин: получает токены и профиль, сохраняет в AsyncStorage
// export const login = async (email: string, password: string): Promise<Profile | null> => {
//   const response = await fetch(`${API_BASE_URL}/auth/login`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ email, password }),
//   });

//   const isJson = response.headers.get('Content-Type')?.includes('application/json');
//   const data = isJson ? (await response.json()) : {};

//   if (!response.ok) {
//     throw new Error(data.message || 'Ошибка входа');
//   }

//   const { accessToken, refreshToken, profile } = data as LoginResponse;

//   await AsyncStorage.multiSet([
//     [ACCESS_KEY, accessToken],
//     [REFRESH_KEY, refreshToken],
//   ]);

//   return profile || null;
// };

// // Регистрация
// export const register = async (email: string, password: string): Promise<void> => {
//   const response = await fetch(`${API_BASE_URL}/auth/register`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ email, password }),
//   });

//   if (!response.ok) {
//     const data = await response.json().catch(() => ({}));
//     throw new Error(data.message || 'Ошибка регистрации');
//   }
// };

// // Верификация (например, email+код)
// export const verify = async (email: string, code: string): Promise<Profile | null> => {
//   const response = await fetch(`${API_BASE_URL}/auth/verify`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ email, code }),
//   });

//   const isJson = response.headers.get('Content-Type')?.includes('application/json');
//   const data = isJson ? (await response.json()) : {};

//   if (!response.ok) {
//     throw new Error(data.message || 'Ошибка подтверждения');
//   }

//   const { accessToken, refreshToken, profile } = data as LoginResponse;

//   await AsyncStorage.multiSet([
//     [ACCESS_KEY, accessToken],
//     [REFRESH_KEY, refreshToken],
//   ]);

//   // Профиль может быть не возвращён — тогда запросим отдельно через apiClient
//   if (profile !== undefined) return profile;
//   return await getProfile();
// };

// // Очистка токенов и данных, переход на экран авторизации
// export const logout = async (): Promise<void> => {
//   await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
//   router.replace('/(auth)/AuthScreen'); // Перенаправление на экран авторизации
// };

// // Обновление accessToken по refreshToken
// export const refreshToken = async (): Promise<string | null> => {
//   const storedRefreshToken = await AsyncStorage.getItem(REFRESH_KEY);
//   if (!storedRefreshToken) return null;

//   try {
//     const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ refreshToken: storedRefreshToken }),
//     });

//     const text = await response.text();
//     console.log('Refresh token response text:', text);

//     // Попытка распарсить JSON после вывода
//     const data = JSON.parse(text);

//     if (!response.ok || !data?.accessToken) {
//       throw new Error(data.message || 'Ошибка обновления токена');
//     }

//     await AsyncStorage.setItem(ACCESS_KEY, data.accessToken);
//     return data.accessToken;
//   } catch (err) {
//     console.warn('Ошибка при обновлении токена:', err);
//     await logout();
//     return null;
//   }
// };


// // Получить профиль через apiClient (с авто обновлением токена)
// export const getProfile = async (): Promise<Profile> => {
//   try {
//     const profile = await apiClient.get<Profile>('/users/profile');
//     if (!profile || !profile.status) {
//       throw new Error('Неверный формат профиля');
//     }
//     return profile;
//   } catch (error) {
//     console.error('Ошибка получения профиля:', error);
//     throw error;
//   }
// };

// // Получить отделы (пример)
// export const getDepartments = async (): Promise<Department[]> => {
//   try {
//     const departments = await apiClient.get<Department[]>('/users/departments');
//     if (!departments) {
//       throw new Error('Отделы не найдены');
//     }
//     return departments;
//   } catch (error) {
//     console.error('Ошибка получения отделов:', error);
//     throw error;
//   }
// };
