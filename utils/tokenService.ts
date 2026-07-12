// utils/tokenService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { API_BASE_URL } from './config';
import { setServerReachable, setServerUnavailable } from '@/src/shared/network/serverStatus';
import { clearServicesAccessCache } from '@/src/features/services/storage/servicesAccessCache';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const PROFILE_KEY = 'profile';
const AUTH_API_BASE_URL_KEY = 'authApiBaseUrl';
const DEVICE_SESSION_KEY = 'deviceSessionId';
const INSTALL_ID_KEY = 'authInstallId';
const REFRESH_LOCK_KEY = 'authRefreshLock';

const MAX_REFRESH_ATTEMPTS = 10;
let refreshAttempts = 0;
let refreshInFlight: Promise<string | null> | null = null;
let lastWarnTs = 0;
let sessionExpiredActive = false;
let lastRefreshFailure: RefreshFailure | null = null;

const REFRESH_TIMEOUT_MS = 10_000;
const REFRESH_LOCK_TTL_MS = 15_000;
const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 90;

type RefreshFailureKind = 'invalid' | 'network' | 'server' | 'rotated' | 'unknown';

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

function canUseSecureStore() {
  return Platform.OS !== 'web';
}

async function secureGet(key: string): Promise<string | null> {
  if (!canUseSecureStore()) return AsyncStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (!canUseSecureStore()) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

async function secureRemove(key: string): Promise<void> {
  if (canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore and clear AsyncStorage fallback below
    }
  }
  await AsyncStorage.removeItem(key);
}

async function migrateLegacyTokenIfNeeded(key: string): Promise<string | null> {
  const secureValue = await secureGet(key);
  if (secureValue) return secureValue;
  const legacyValue = await AsyncStorage.getItem(key);
  if (!legacyValue) return null;
  await secureSet(key, legacyValue);
  if (canUseSecureStore()) {
    await AsyncStorage.removeItem(key);
  }
  return legacyValue;
}

function makeInstallId() {
  return `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getInstallId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
  if (existing) return existing;
  const next = makeInstallId();
  await AsyncStorage.setItem(INSTALL_ID_KEY, next);
  return next;
}

export async function getDeviceSessionId(): Promise<string | null> {
  return secureGet(DEVICE_SESSION_KEY);
}

export async function getAuthDevicePayload() {
  return {
    installId: await getInstallId(),
    deviceSessionId: await getDeviceSessionId(),
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version || Constants.manifest2?.extra?.expoClient?.version || undefined,
    deviceName: Constants.deviceName || undefined,
  };
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readRefreshError(error: any) {
  const data = error?.response?.data ?? error?.data;
  const rawStatus = error?.response?.status ?? error?.status;
  const parsedStatus =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string' && rawStatus.trim()
        ? Number(rawStatus)
        : undefined;
  const message = data?.message || error?.message || 'Refresh error';
  const reason = data?.error?.details?.reason || data?.error?.reason;
  const code = data?.error?.code;
  const status =
    Number.isFinite(parsedStatus)
      ? parsedStatus
      : /status code 409/i.test(String(message))
        ? 409
        : undefined;
  return { status, message, reason, code };
}

function isRefreshTokenRotatedConflict(errorInfo: ReturnType<typeof readRefreshError>) {
  return (
    errorInfo.status === 409 &&
    (
      errorInfo.reason === 'REFRESH_TOKEN_ROTATED' ||
      errorInfo.code === 'CONFLICT' ||
      /REFRESH_TOKEN_ROTATED|already rotated|status code 409|обнов/i.test(String(errorInfo.message || ''))
    )
  );
}

async function waitForRotatedTokenFromOtherRuntime(
  previousRefreshToken: string,
  previousAccessToken?: string | null
): Promise<string | null> {
  // A second JS runtime (or a request finishing just before us) may have
  // already claimed the one-time refresh token. Wait for its atomic token
  // pair write instead of rotating the newly issued refresh token again.
  for (const waitMs of [250, 750, 1500, 2500]) {
    await delay(waitMs);
    const accessFromOtherRuntime = await getAccessTokenIfRefreshChanged(previousRefreshToken, previousAccessToken);
    if (accessFromOtherRuntime) return accessFromOtherRuntime;
  }
  return null;
}

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
  await Promise.all([
    secureRemove(ACCESS_KEY),
    secureRemove(REFRESH_KEY),
    secureRemove(DEVICE_SESSION_KEY),
    AsyncStorage.multiRemove([PROFILE_KEY, AUTH_API_BASE_URL_KEY]),
  ]);
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
  const entries = await AsyncStorage.multiGet([AUTH_API_BASE_URL_KEY]);
  const storedBaseUrl = entries[0]?.[1] || '';
  const [accessToken, refreshToken] = await Promise.all([
    migrateLegacyTokenIfNeeded(ACCESS_KEY),
    migrateLegacyTokenIfNeeded(REFRESH_KEY),
  ]);
  const hasTokens = Boolean(accessToken || refreshToken);

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
  return secureGet(ACCESS_KEY);
}

/**
 * Keeps normal foreground requests away from the access-token expiry edge.
 * Native background tracking uses its own long-lived scoped token and does
 * not depend on this application session after it has been started once.
 */
export async function getAccessTokenForRequest(): Promise<string | null> {
  const accessToken = await getAccessToken();
  const exp = decodeExp(accessToken);
  if (!accessToken || !exp) return accessToken;

  const now = Math.floor(Date.now() / 1000);
  if (exp - now > ACCESS_TOKEN_REFRESH_SKEW_SECONDS) return accessToken;

  const refreshed = await refreshToken();
  if (refreshed) return refreshed;
  return hasAuthSessionExpired() ? null : accessToken;
}

export async function getRefreshToken(): Promise<string | null> {
  if (!(await ensureTokenStorageScope())) return null;
  return secureGet(REFRESH_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string, profile?: any, deviceSessionId?: string | null): Promise<void> {
  await Promise.all([
    secureSet(ACCESS_KEY, accessToken),
    secureSet(REFRESH_KEY, refreshToken),
    deviceSessionId ? secureSet(DEVICE_SESSION_KEY, deviceSessionId) : Promise.resolve(),
    AsyncStorage.setItem(AUTH_API_BASE_URL_KEY, API_BASE_URL),
  ]);

  if (profile) {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } else {
    // No profile in response, clear a possibly stale profile.
    await AsyncStorage.removeItem(PROFILE_KEY);
  }

  refreshAttempts = 0;
  sessionExpiredActive = false;
  lastRefreshFailure = null;
}

export async function logout(): Promise<void> {
  await clearStoredAuthState();
  // Reset backoff to avoid warning spam after explicit logout.
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
  if (!exp) return false;
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

async function acquireRefreshLock(owner: string): Promise<boolean> {
  const now = Date.now();
  const raw = await AsyncStorage.getItem(REFRESH_LOCK_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.until && Number(parsed.until) > now && parsed?.owner !== owner) {
        return false;
      }
    } catch {
      // broken lock, overwrite below
    }
  }
  await AsyncStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ owner, until: now + REFRESH_LOCK_TTL_MS }));
  const confirmRaw = await AsyncStorage.getItem(REFRESH_LOCK_KEY);
  try {
    const confirm = JSON.parse(confirmRaw || '{}');
    return confirm.owner === owner;
  } catch {
    return false;
  }
}

async function releaseRefreshLock(owner: string) {
  const raw = await AsyncStorage.getItem(REFRESH_LOCK_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.owner === owner) {
      await AsyncStorage.removeItem(REFRESH_LOCK_KEY);
    }
  } catch {
    await AsyncStorage.removeItem(REFRESH_LOCK_KEY);
  }
}

async function postRefreshToken(storedRefreshToken: string) {
  const res = await axios.post(
    `${API_BASE_URL}/auth/token`,
    {
      refreshToken: storedRefreshToken,
      ...(await getAuthDevicePayload()),
    },
    { timeout: REFRESH_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
  );
  const payload = res.data?.data ?? res.data;
  const accessToken: string | undefined = payload?.accessToken;
  const newRefreshToken: string | undefined = payload?.refreshToken;
  const profile = payload?.profile;
  const deviceSessionId: string | undefined = payload?.deviceSessionId;

  if (!accessToken) throw new Error('Missing accessToken in refresh response');

  const refreshToStore = newRefreshToken ?? storedRefreshToken;
  await saveTokens(accessToken, refreshToStore, profile, deviceSessionId);
  refreshAttempts = 0;
  lastWarnTs = 0;
  setServerReachable();
  return accessToken;
}

async function getAccessTokenIfRefreshChanged(
  previousRefreshToken: string,
  previousAccessToken?: string | null
): Promise<string | null> {
  const currentRefresh = await getRefreshToken();
  if (!currentRefresh || currentRefresh === previousRefreshToken) return null;
  const currentAccess = await secureGet(ACCESS_KEY);
  if (!currentAccess || currentAccess === previousAccessToken) return null;
  return currentAccess;
}

export async function refreshToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const storedRefreshToken = await getRefreshToken();
  const storedAccessToken = await secureGet(ACCESS_KEY);
  if (!storedRefreshToken) {
    refreshAttempts = 0;
    lastRefreshFailure = null;
    return null;
  }

  if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
    const now = Date.now();
    if (now - lastWarnTs > 10_000) {
      console.warn('Достигнут максимум попыток обновления токена');
      lastWarnTs = now;
    }
    return null;
  }

  refreshAttempts++;

  refreshInFlight = (async () => {
    const lockOwner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let hasLock = false;
    try {
      hasLock = await acquireRefreshLock(lockOwner);
      if (!hasLock) {
        await delay(350);
        const accessFromOtherRuntime = await getAccessTokenIfRefreshChanged(storedRefreshToken, storedAccessToken);
        if (accessFromOtherRuntime) {
          return accessFromOtherRuntime;
        }
        hasLock = await acquireRefreshLock(lockOwner);
        if (!hasLock) {
          const recovered = await waitForRotatedTokenFromOtherRuntime(storedRefreshToken, storedAccessToken);
          if (recovered) return recovered;
          rememberRefreshFailure({
            kind: 'rotated',
            status: 409,
            message: 'Refresh is being completed by another application runtime',
          });
          return null;
        }
      }

      return await postRefreshToken(storedRefreshToken);
    } catch (e: any) {
      const refreshError = readRefreshError(e);
      const { status, message: msg } = refreshError;

      if (isRefreshTokenRotatedConflict(refreshError)) {
        const recovered = await waitForRotatedTokenFromOtherRuntime(storedRefreshToken, storedAccessToken);
        if (recovered) return recovered;
        rememberRefreshFailure({ kind: 'rotated', status, message: msg });
        return null;
      }

      console.error('[token] refresh error', { status, msg });
      if (status === 401 || status === 403) {
        const latestRefresh = await getRefreshToken();
        if (latestRefresh && latestRefresh !== storedRefreshToken) {
          const recovered = await waitForRotatedTokenFromOtherRuntime(storedRefreshToken, storedAccessToken);
          if (recovered) return recovered;
          rememberRefreshFailure({ kind: 'rotated', status: 409, message: 'Refresh token was rotated by another runtime' });
          return null;
        }
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
      if (hasLock) {
        await releaseRefreshLock(lockOwner);
      }
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
