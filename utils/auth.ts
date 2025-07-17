// D:\Extectick\LeaderProductAPP\utils\auth.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import * as apiClient from '../app/apiClient';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const PROFILE_KEY = 'userProfile';

interface TokenPayload {
  userId: number;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export async function register(email: string, password: string) {
  return apiClient.register(email, password);
}

export async function login(email: string, password: string) {
  const data = await apiClient.login(email, password);
  await saveTokens(data.accessToken, data.refreshToken);
  
  // Запрашиваем и сохраняем профиль
  const profileData = await apiClient.getProfile(data.accessToken);
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profileData.profile));
  
  return { ...data, profile: profileData.profile };
}

export async function verify(email: string, code: string) {
  const data = await apiClient.verify(email, code);
  await saveTokens(data.accessToken, data.refreshToken);
  
  // Запрашиваем и сохраняем профиль
  const profileData = await apiClient.getProfile(data.accessToken);
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profileData.profile));
  
  return { ...data, profile: profileData.profile };
}

export async function refreshToken() {
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('No refresh token found');
  
  // Проверяем срок действия refresh токена
  const refreshTokenPayload = jwtDecode<TokenPayload>(refreshToken);
  if (isTokenExpired(refreshTokenPayload.exp)) {
    await clearTokens();
    throw new Error('Refresh token expired');
  }

  const data = await apiClient.refreshToken(refreshToken);
  await saveTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout() {
  const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) return;
  
  try {
    await apiClient.logout(accessToken, refreshToken);
  } finally {
    await clearTokens();
    await AsyncStorage.removeItem(PROFILE_KEY);
  }
}

async function saveTokens(accessToken: string, refreshToken: string) {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

async function clearTokens() {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

export async function getAccessToken() {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function getProfile() {
  const profile = await AsyncStorage.getItem(PROFILE_KEY);
  if (!profile) {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');
    
    const profileData = await apiClient.getProfile(accessToken);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profileData.profile));
    return profileData.profile;
  }
  return JSON.parse(profile);
}

function isTokenExpired(expirationTime: number): boolean {
  return Date.now() >= expirationTime * 1000;
}

// Улучшенный middleware для проверки и обновления токена
// Кэш для результатов проверки токена
let authCache: { token: string | null, timestamp: number } | null = null;
const CACHE_TTL = 30 * 1000; // 30 секунд

export async function ensureAuth(): Promise<string | null> {
  // Проверяем кэш
  if (authCache && Date.now() - authCache.timestamp < CACHE_TTL) {
    return authCache.token;
  }

  // 1. Пытаемся получить access token
  let accessToken = await getAccessToken();
  // 2. Если токен есть, проверяем его валидность
  if (accessToken) {
    try {
      const payload = jwtDecode<TokenPayload>(accessToken);
      
      // 3. Проверяем срок действия токена
      if (!isTokenExpired(payload.exp)) {
        // Проверяем наличие профиля
        const profile = await AsyncStorage.getItem(PROFILE_KEY);
        if (!profile) {
          // Если профиля нет, запрашиваем его
          const profileData = await apiClient.getProfile(accessToken);
          if (!profileData.profile) {
            throw new Error('Profile required');
          }
          await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profileData.profile));
        }
        
        // Обновляем кэш
        authCache = { token: accessToken, timestamp: Date.now() };
        return accessToken;
      }
    } catch (error) {
      console.warn('Invalid access token:', error);
      // Продолжаем попытку обновить токен
    }
  }

  // 4. Пробуем обновить токены с помощью refresh token
  try {
    const refreshToken = await getRefreshToken();
    
    if (!refreshToken) {
      return null;
    }

    // 5. Проверяем refresh token перед использованием
    const refreshPayload = jwtDecode<TokenPayload>(refreshToken);
    if (isTokenExpired(refreshPayload.exp)) {
      await clearTokens();
      throw new Error('Refresh token expired');
    }
    
    // 6. Обновляем токены
    const newTokens = await apiClient.refreshToken(refreshToken);
    
    // 7. Сохраняем новые токены
    await saveTokens(newTokens.accessToken, newTokens.refreshToken);
    
    // 8. Запрашиваем и сохраняем профиль
    const profileData = await apiClient.getProfile(newTokens.accessToken);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profileData.profile));
    console.log(profileData)
    // 9. Возвращаем новый access token
    return newTokens.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    await clearTokens();
    throw new Error('Authentication required');
  }
}

// Дополнительная функция для проверки авторизации без автоматического обновления токена
export async function checkAuth(): Promise<{ isAuthenticated: boolean, requiresRefresh?: boolean }> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return { isAuthenticated: false };

    // Проверяем срок действия токена
    const payload = jwtDecode<TokenPayload>(accessToken);
    if (isTokenExpired(payload.exp)) {
      try {
        // Пробуем обновить токен
        const newToken = await refreshToken();
        return { 
          isAuthenticated: !!newToken,
          requiresRefresh: true 
        };
      } catch (error) {
        await clearTokens();
        return { isAuthenticated: false };
      }
    }

    // Токен валиден (проверен срок действия)
    return { isAuthenticated: true };
  } catch (error) {
    console.error('Auth check error:', error);
    return { isAuthenticated: false };
  }
}
