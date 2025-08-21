// utils/tokenService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { apiClient } from './apiClient';
import { API_BASE_URL } from './config';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';

const MAX_REFRESH_ATTEMPTS = 3;
let refreshAttempts = 0;
let refreshInFlight: Promise<string | null> | null = null;
let lastWarnTs = 0;

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
  refreshAttempts = 0; // сброс попыток при новом токене
}

export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, PROFILE_KEY]);
  // Сбрасываем бэкофф, чтобы не было дальнейшего спама предупреждений
  refreshAttempts = 0;
  lastWarnTs = 0;
  // router.replace('/(auth)/AuthScreen');
}

export function resetRefreshBackoff() {
  refreshAttempts = 0;
  lastWarnTs = 0;
}

export async function refreshToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  // ⬇️ СНАЧАЛА проверяем, есть ли refreshToken в хранилище
  const storedRefreshToken = await getRefreshToken();
  if (!storedRefreshToken) {
    // Нечего обновлять — не увеличиваем попытки, не логируем
    refreshAttempts = 0; // на всякий случай сбросим бэкофф
    return null;
  }

  if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
    const now = Date.now();
    if (now - lastWarnTs > 10_000) { // не чаще раза в 10с
      console.warn('Достигнут максимум попыток обновления токена');
      lastWarnTs = now;
    }
    return null;
  }

  refreshAttempts++;

  refreshInFlight = (async () => {
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
      const payload = json?.data ?? json;
      const accessToken: string | undefined = payload?.accessToken;
      const newRefreshToken: string | undefined = payload?.refreshToken;
      const profile = payload?.profile;

      if (!accessToken) throw new Error('Отсутствует accessToken в ответе');

      await saveTokens(accessToken, newRefreshToken ?? storedRefreshToken, profile);
      refreshAttempts = 0;
      lastWarnTs = 0;
      return accessToken;
    } catch (e) {
      console.error('Ошибка при обновлении токена:', e);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}