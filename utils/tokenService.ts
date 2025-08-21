// utils/tokenService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { API_BASE_URL } from './config';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';

const MAX_REFRESH_ATTEMPTS = 3;
let refreshAttempts = 0;

// prevent concurrent refreshes
let refreshInFlight: Promise<string | null> | null = null;

export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string, profile?: any): Promise<void> {
  const items: [string, string][] = [
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
  ];
  if (profile) items.push([PROFILE_KEY, JSON.stringify(profile)]);
  await AsyncStorage.multiSet(items);
  console.log('Сохранён профиль:', profile);
  refreshAttempts = 0;
}

export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, PROFILE_KEY]);
  router.replace('/(auth)/AuthScreen');
}

export async function refreshToken(): Promise<string | null> {
  // de-dupe concurrent calls
  if (refreshInFlight) return refreshInFlight;
  if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
    console.warn('Достигнут максимум попыток обновления токена');
    // Do not call logout here to preserve tokens; caller will handle unauth state
    return null;
  }
  refreshAttempts++;
  refreshInFlight = (async () => {
    const storedRefreshToken = await getRefreshToken();
    if (!storedRefreshToken) {
      // If refresh token missing, consider user unauthenticated
      await logout();
      return null;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      }
      // support both {data:{...}} and flat body
      const payload = json?.data ?? json;
      const accessToken: string | undefined = payload?.accessToken;
      const newRefreshToken: string | undefined = payload?.refreshToken;
      const profile = payload?.profile;
      if (!accessToken) {
        throw new Error('Отсутствует accessToken в ответе');
      }
      await saveTokens(accessToken, newRefreshToken ?? storedRefreshToken, profile);
      refreshAttempts = 0;
      return accessToken;
    } catch (error) {
      console.error('Ошибка при обновлении токена:', error);
      // Do not call logout on network errors; return null and let caller decide
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}