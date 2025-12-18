// utils/tokenService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { router } from 'expo-router';
import { jwtDecode } from 'jwt-decode';

import { API_BASE_URL } from './config';
import { pushNotification } from './notificationStore';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';

const MAX_REFRESH_ATTEMPTS = 10;
let refreshAttempts = 0;
let refreshInFlight: Promise<string | null> | null = null;
let lastWarnTs = 0;

const REFRESH_TIMEOUT_MS = 15000;
const NETWORK_NOTICE_COOLDOWN_MS = 8000;

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

  if (profile) {
    items.push([PROFILE_KEY, JSON.stringify(profile)]);
    await AsyncStorage.multiSet(items);
  } else {
    // Нет профиля в ответе — убираем возможный устаревший профиль
    await AsyncStorage.multiSet(items);
    await AsyncStorage.removeItem(PROFILE_KEY);
  }

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

function decodeExp(token?: string | null): number | null {
  if (!token) return null;
  try {
    const decoded: any = jwtDecode(token);
    if (!decoded || typeof decoded.exp !== 'number') return null;
    return decoded.exp;
  } catch {
    return null;
  }
}

export async function isRefreshTokenExpired(): Promise<boolean> {
  const rt = await getRefreshToken();
  const exp = decodeExp(rt);
  if (!rt) return true;
  if (!exp) return false; // если не удалось распарсить, считаем валидным
  const now = Math.floor(Date.now() / 1000);
  return exp <= now;
}

export async function handleBackendUnavailable(reason?: string) {
  const expired = await isRefreshTokenExpired();
  if (expired) {
    await logout();
    return;
  }

  const now = Date.now();
  if (now - lastWarnTs < NETWORK_NOTICE_COOLDOWN_MS) return;
  lastWarnTs = now;

  pushNotification({
    title: 'Сервер недоступен',
    message: reason || 'Не удалось связаться с сервером. Попробуйте позже.',
    type: 'warning',
    durationMs: 6000,
  });
}

export async function refreshToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  // СНАЧАЛА проверяем, есть ли refreshToken в хранилище
  const storedRefreshToken = await getRefreshToken();
  if (!storedRefreshToken) {
    console.warn('[token] refresh skipped: no refresh token');
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
      const res = await axios.post(
        `${API_BASE_URL}/auth/token`,
        { refreshToken: storedRefreshToken },
        { timeout: REFRESH_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
      );
      const payload = res.data?.data ?? res.data;
      const accessToken: string | undefined = payload?.accessToken;
      const newRefreshToken: string | undefined = payload?.refreshToken;
      const profile = payload?.profile;

      if (!accessToken) throw new Error('Отсутствует accessToken в ответе');

      const refreshToStore = newRefreshToken ?? storedRefreshToken;
      await saveTokens(accessToken, refreshToStore, profile);
      refreshAttempts = 0;
      lastWarnTs = 0;
      return accessToken;
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || e?.message || 'Refresh error';
      console.error('[token] refresh error', { status, msg });
      if (!status) {
        await handleBackendUnavailable(msg);
      }
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
