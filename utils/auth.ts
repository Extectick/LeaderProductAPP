// D:\Extectick\LeaderProductAPP\utils\auth.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import * as apiClient from './apiClient';

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

export async function login(email: string, password: string) {
  const data = await apiClient.login(email, password);
  await saveTokens(data.accessToken, data.refreshToken);

  // Профиль сохраняется при логине
  // const profileData = await fetchAndStoreProfile(data.accessToken);
  // return { ...data, profile: profileData };
}
export async function register(email: string, password: string) {
  return apiClient.register(email, password);
}

export async function verify(email: string, code: string) {
  const data = await apiClient.verify(email, code);
  await saveTokens(data.accessToken, data.refreshToken);

  // const profileData = await fetchAndStoreProfile(data.accessToken);
  // return { ...data, profile: profileData };
}

async function fetchAndStoreProfile(token: string) {
  const profileData = await apiClient.getProfile(token);
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profileData.profile));
  return profileData.profile;
}

export async function refreshToken() {
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('No refresh token');

  const payload = jwtDecode<TokenPayload>(refreshToken);
  if (isTokenExpired(payload.exp)) {
    await clearTokens();
    throw new Error('Refresh token expired');
  }

  const newTokens = await apiClient.refreshToken(refreshToken);
  await saveTokens(newTokens.accessToken, newTokens.refreshToken);
  await fetchAndStoreProfile(newTokens.accessToken);
  return newTokens;
}

export async function ensureAuth(): Promise<string | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  try {
    const payload = jwtDecode<TokenPayload>(accessToken);
    if (!isTokenExpired(payload.exp)) {
      // Проверка профиля при старте приложения
      const profileStr = await AsyncStorage.getItem(PROFILE_KEY);
      if (!profileStr) {
        await fetchAndStoreProfile(accessToken);
      }
      return accessToken;
    }
  } catch (e) {
    console.warn('Invalid access token, trying refresh...');
  }

  try {
    const newTokens = await refreshToken();
    return newTokens.accessToken;
  } catch (e) {
    console.error('Re-authentication failed');
    await clearTokens();
    return null;
  }
}

export async function getProfile() {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Not authenticated');

  return await fetchAndStoreProfile(accessToken);
}

export async function logout() {
  const accessToken = await getAccessToken();
  const refreshToken = await getRefreshToken();
  if (accessToken && refreshToken) {
    try {
      await apiClient.logout(accessToken, refreshToken);
    } catch (e) {
      console.warn('Logout error', e);
    }
  }
  await clearTokens();
  await AsyncStorage.removeItem(PROFILE_KEY);
}

function isTokenExpired(exp: number) {
  return Date.now() >= exp * 1000;
}

async function saveTokens(access: string, refresh: string) {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, access],
    [REFRESH_TOKEN_KEY, refresh],
  ]);
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
