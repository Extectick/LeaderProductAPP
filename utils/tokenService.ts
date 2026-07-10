// utils/tokenService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

import { API_BASE_URL } from './config';
import { setServerReachable, setServerUnavailable } from '@/src/shared/network/serverStatus';
import { clearServicesAccessCache } from '@/src/features/services/storage/servicesAccessCache';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';
const AUTH_API_BASE_URL_KEY = 'authApiBaseUrl';

const MAX_REFRESH_ATTEMPTS = 10;
let refreshAttempts = 0;
let refreshInFlight: Promise<string | null> | null = null;
let lastWarnTs = 0;
let sessionExpiredActive = false;
let lastRefreshFailure: RefreshFailure | null = null;

const REFRESH_TIMEOUT_MS = 10_000;

type RefreshFailureKind = 'invalid' | 'network' | 'server' | 'unknown';

export type RefreshFailure = {
  kind: RefreshFailureKind;
  status?: number;
  message: string;
  at: number;
};

export type AuthSessionExpiredEvent = {
  reason: string;
  status?: number;
  at: number;
};

type AuthSessionExpiredListener = (event: AuthSessionExpiredEvent) => void;

const authSessionExpiredListeners = new Set<AuthSessionExpiredListener>();

function notifyAuthSessionExpired(event: AuthSessionExpiredEvent) {
  authSessionExpiredListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // ignore listener errors
    }
  });
}

export function onAuthSessionExpired(listener: AuthSessionExpiredListener) {
  authSessionExpiredListeners.add(listener);
  return () => {
    authSessionExpiredListeners.delete(listener);
  };
}

export function hasAuthSessionExpired() {
  return sessionExpiredActive;
}

export function getLastRefreshFailure() {
  return lastRefreshFailure;
}

function rememberRefreshFailure(failure: Omit<RefreshFailure, 'at'>) {
  lastRefreshFailure = { ...failure, at: Date.now() };
}

async function clearStoredAuthState(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, PROFILE_KEY, AUTH_API_BASE_URL_KEY]);
  await clearServicesAccessCache();
  refreshAttempts = 0;
  lastWarnTs = 0;
}

async function invalidateAuthSession(reason: string, status?: number) {
  await clearStoredAuthState();
  refreshInFlight = null;
  setServerReachable();
  if (sessionExpiredActive) return;
  sessionExpiredActive = true;
  notifyAuthSessionExpired({ reason, status, at: Date.now() });
}

async function ensureTokenStorageScope(): Promise<boolean> {
  const entries = await AsyncStorage.multiGet([AUTH_API_BASE_URL_KEY, ACCESS_KEY, REFRESH_KEY]);
  const storedBaseUrl = entries[0]?.[1] || '';
  const hasTokens = Boolean(entries[1]?.[1] || entries[2]?.[1]);

  if (!hasTokens) return true;

  if (!storedBaseUrl) {
    await AsyncStorage.setItem(AUTH_API_BASE_URL_KEY, API_BASE_URL);
    return true;
  }

  if (storedBaseUrl !== API_BASE_URL) {
    await invalidateAuthSession('api_base_url_changed');
    return false;
  }

  return true;
}

export async function getAccessToken(): Promise<string | null> {
  if (!(await ensureTokenStorageScope())) return null;
  return AsyncStorage.getItem(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  if (!(await ensureTokenStorageScope())) return null;
  return AsyncStorage.getItem(REFRESH_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string, profile?: any): Promise<void> {
  const items: [string, string][] = [
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
    [AUTH_API_BASE_URL_KEY, API_BASE_URL],
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
  sessionExpiredActive = false;
  lastRefreshFailure = null;
}

export async function logout(): Promise<void> {
  await clearStoredAuthState();
  // Сбрасываем бэкофф, чтобы не было дальнейшего спама предупреждений
  refreshAttempts = 0;
  lastWarnTs = 0;
  sessionExpiredActive = false;
  lastRefreshFailure = null;
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
  setServerUnavailable(reason || 'Network error');
  const expired = await isRefreshTokenExpired();
  if (expired) {
    await invalidateAuthSession(reason || 'refresh_token_expired');
    return;
  }
}

export async function refreshToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  // СНАЧАЛА проверяем, есть ли refreshToken в хранилище
  const storedRefreshToken = await getRefreshToken();
  if (!storedRefreshToken) {
    refreshAttempts = 0; // на всякий случай сбросим бэкофф
    lastRefreshFailure = null;
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
      setServerReachable();
      return accessToken;
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || e?.message || 'Refresh error';
      console.error('[token] refresh error', { status, msg });
      if (status === 401 || status === 403) {
        rememberRefreshFailure({ kind: 'invalid', status, message: msg });
        await invalidateAuthSession(msg, status);
      } else if (!status) {
        rememberRefreshFailure({ kind: 'network', message: msg });
        await handleBackendUnavailable(msg);
      } else if (status >= 500) {
        rememberRefreshFailure({ kind: 'server', status, message: msg });
        setServerUnavailable(msg);
      } else {
        rememberRefreshFailure({ kind: 'unknown', status, message: msg });
      }
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
