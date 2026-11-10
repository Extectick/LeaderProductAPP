// utils/tokenService.ts
import { acceptOwnProfile, persistOwnProfile, resetOwnProfileSession, ownProfileFence, ownProfileFenceMatches, type OwnProfileFence } from '@/src/features/profile/model/ownProfileCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { API_BASE_URL } from './config';
import { setServerReachable, setServerUnavailable } from '@/src/shared/network/serverStatus';
import { clearServicesAccessCache } from '@/src/features/services/storage/servicesAccessCache';
import { SERVER_CONNECTION_UNAVAILABLE_MESSAGE } from '@/src/shared/errors/userErrorMessage';
import { withDeadline } from '@/src/shared/network/withDeadline';
import {withAuthWebLock} from './authWebLock';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const AUTH_API_BASE_URL_KEY = 'authApiBaseUrl';
const DEVICE_SESSION_KEY = 'deviceSessionId';
const INSTALL_ID_KEY = 'authInstallId';
const REFRESH_LOCK_KEY = 'authRefreshLock';

let refreshAttempts = 0;
let refreshInFlight: Promise<string | null> | null = null;
let lastWarnTs = 0;
let nextRefreshAttemptAt = 0;
let lastRefreshResumeAt = -Infinity;
let sessionExpiredActive = false;
let lastRefreshFailure: RefreshFailure | null = null;
let authGeneration = 0;
let authWrites: Promise<void> = Promise.resolve();

/** Serialize token writes/clears; a late refresh must not overtake a new login. */
function mutateCredentials<T>(operation:()=>Promise<T>):Promise<T> {
  const result=authWrites.then(()=>withAuthWebLock('credentials',operation));
  authWrites=result.then(()=>undefined,()=>undefined);
  return result;
}

async function finishCredentialWrites(operations:Promise<unknown>[]) {
  // A rejection must not release the queue while sibling writes are still
  // running: otherwise they could overwrite the next login after it completes.
  const results=await Promise.allSettled(operations);
  const failure=results.find(result=>result.status==='rejected');
  if(failure?.status==='rejected')throw failure.reason;
}

function beginAuthSessionChange() {
  ++authGeneration;
  refreshInFlight=null;
  lastRefreshResumeAt = -Infinity;
  resetOwnProfileSession();
  return authGeneration;
}

const REFRESH_TIMEOUT_MS = 10_000;
const AUTH_STORAGE_READ_TIMEOUT_MS = 5_000;
const REFRESH_LOCK_TTL_MS = 15_000;
const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 90;
const REFRESH_RETRY_BASE_MS = 5_000;
const REFRESH_RETRY_MAX_MS = 2 * 60_000;

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

// Only reads are raced. A late storage read cannot resume this operation after timeout.
const readStored = (key: string) => withDeadline(AsyncStorage.getItem(key), AUTH_STORAGE_READ_TIMEOUT_MS);
const readScope = () => withDeadline(AsyncStorage.multiGet([AUTH_API_BASE_URL_KEY]), AUTH_STORAGE_READ_TIMEOUT_MS);

async function secureGet(key: string): Promise<string | null> {
  if (!canUseSecureStore()) return readStored(key);
  try {
    return await withDeadline(SecureStore.getItemAsync(key), AUTH_STORAGE_READ_TIMEOUT_MS);
  } catch (error) {
    // A stalled native store is not permission to use a possibly stale fallback.
    if (error instanceof Error && error.name === 'TimeoutError') throw error;
    return readStored(key);
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
  const generation=authGeneration;
  const secureValue = await secureGet(key);
  if(generation!==authGeneration)return null;
  if (secureValue) return secureValue;
  const legacyValue = await readStored(key);
  if (!legacyValue||generation!==authGeneration) return null;
  return mutateCredentials(async()=>{
    if(generation!==authGeneration)return null;
    const existing=await secureGet(key);
    if(generation!==authGeneration)return null;
    if(existing)return existing;
    const currentLegacy=await readStored(key);
    if(!currentLegacy||generation!==authGeneration)return null;
    await secureSet(key,currentLegacy);
    if(canUseSecureStore())await AsyncStorage.removeItem(key);
    return generation===authGeneration?currentLegacy:null;
  });
}

function makeInstallId() {
  return `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getInstallId(): Promise<string> {
  const existing = await readStored(INSTALL_ID_KEY);
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
  previousAccessToken?: string | null,
  generation=authGeneration
): Promise<string | null> {
  // A second JS runtime (or a request finishing just before us) may have
  // already claimed the one-time refresh token. Wait for its atomic token
  // pair write instead of rotating the newly issued refresh token again.
  for (const waitMs of [250, 750, 1500, 2500]) {
    await delay(waitMs);
    if(generation!==authGeneration)return null;
    const accessFromOtherRuntime = await getAccessTokenIfRefreshChanged(previousRefreshToken, previousAccessToken,generation);
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

function scheduleRefreshRetry() {
  const exponent = Math.max(0, Math.min(refreshAttempts - 1, 6));
  nextRefreshAttemptAt = Date.now() + Math.min(REFRESH_RETRY_MAX_MS, REFRESH_RETRY_BASE_MS * (2 ** exponent));
}

async function clearStoredAuthState(): Promise<void> {
  await finishCredentialWrites([
    secureRemove(ACCESS_KEY),
    secureRemove(REFRESH_KEY),
    secureRemove(DEVICE_SESSION_KEY),
    AsyncStorage.multiRemove([AUTH_API_BASE_URL_KEY]),
    persistOwnProfile(null),
  ]);
  await clearServicesAccessCache();
  refreshAttempts = 0;
  lastWarnTs = 0;
  nextRefreshAttemptAt = 0;
}

async function invalidateAuthSession(reason: string, status?: number, expectedRefresh?:string|null, generation=authGeneration) {
  return mutateCredentials(async()=>{
    if(generation!==authGeneration)return false;
    if(expectedRefresh!==undefined&&await secureGet(REFRESH_KEY)!==expectedRefresh)return false;
    if(generation!==authGeneration)return false;
    const shouldNotify=!sessionExpiredActive;
    sessionExpiredActive=true;
    const invalidating=beginAuthSessionChange();
    // The rejection is confirmed for this exact token. Failed disk cleanup
    // cannot keep it authorized in memory; a later login still owns the queue.
    await clearStoredAuthState().catch(()=>{});
    // A login may have queued while removal was in flight. Its writes run next;
    // do not emit a stale expiry event or replace its failure/backoff state.
    if(invalidating!==authGeneration)return false;
    setServerReachable();
    if(status)rememberRefreshFailure({kind:'invalid',status,message:reason});
    if(shouldNotify){
      notifyAuthSessionExpired({reason,status,at:Date.now()});
    }
    return true;
  });
}

async function ensureTokenStorageScope(knownBaseUrl?: string): Promise<boolean> {
  const generation=authGeneration;
  const storedBaseUrl = knownBaseUrl ?? ((await readScope())[0]?.[1] || '');
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
    // Preserve the backend of pre-outbox SQLite drafts before clearing auth.
    if (!await AsyncStorage.getItem('orderOutboxLegacyApiBaseUrl')) await AsyncStorage.setItem('orderOutboxLegacyApiBaseUrl', storedBaseUrl);
    await invalidateAuthSession('api_base_url_changed',undefined,refreshToken,generation);
    return false;
  }

  return true;
}

export async function getAccessToken(): Promise<string | null> {
  if(sessionExpiredActive)return null;
  const storedBaseUrl = (await readScope())[0]?.[1] || '';
  // A scoped, populated store needs only a fresh access-token read. Reading
  // and migrating both tokens on every Help account fence triples native I/O.
  // Never retain this value across calls: another runtime may rotate or clear it.
  if (storedBaseUrl === API_BASE_URL) {
    const accessToken = await secureGet(ACCESS_KEY);
    if (accessToken) return accessToken;
  }
  // Missing/legacy tokens and unknown/changed API scopes keep the full repair
  // path, including refresh-only sessions and the final fresh access read.
  if (!(await ensureTokenStorageScope(storedBaseUrl))) return null;
  return secureGet(ACCESS_KEY);
}

/**
 * Keeps normal foreground requests away from the access-token expiry edge.
 * Native background tracking uses its own long-lived scoped token and does
 * not depend on this application session after it has been started once.
 */
export async function getAccessTokenForRequest(): Promise<string | null> {
  const generation=authGeneration;
  await authWrites;
  const accessToken = await getAccessToken();
  if(generation!==authGeneration)return null;
  const exp = decodeExp(accessToken);
  if (!accessToken || !exp) return accessToken;

  const now = Math.floor(Date.now() / 1000);
  if (exp - now > ACCESS_TOKEN_REFRESH_SKEW_SECONDS) return accessToken;

  const refreshed = await refreshToken();
  if(generation!==authGeneration)return null;
  if(refreshed&&differentTokenAccounts(accessToken,refreshed))return null;
  if (refreshed) return refreshed;
  // Another tab can change accounts without incrementing this runtime's epoch.
  // A failed refresh must not fall back to credentials captured before it.
  if(await secureGet(ACCESS_KEY)!==accessToken||generation!==authGeneration)return null;
  return hasAuthSessionExpired() ? null : accessToken;
}

export async function getRefreshToken(): Promise<string | null> {
  if(sessionExpiredActive)return null;
  if (!(await ensureTokenStorageScope())) return null;
  return secureGet(REFRESH_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string, profile?: any, deviceSessionId?: string | null, profileFence?: OwnProfileFence): Promise<void> {
  const generation=profileFence?authGeneration:beginAuthSessionChange();
  await commitTokens(accessToken,refreshToken,profile,deviceSessionId,profileFence,generation);
}

async function commitTokens(accessToken:string,refreshToken:string,profile:any,deviceSessionId:string|null|undefined,profileFence:OwnProfileFence|undefined,generation:number,expectedRefresh?:string) {
  return mutateCredentials(async()=>{
    if(generation!==authGeneration)return false;
    if(expectedRefresh!==undefined&&await secureGet(REFRESH_KEY)!==expectedRefresh)return false;
    if(generation!==authGeneration)return false;
    await finishCredentialWrites([
      secureSet(ACCESS_KEY, accessToken),
      secureSet(REFRESH_KEY, refreshToken),
      deviceSessionId ? secureSet(DEVICE_SESSION_KEY, deviceSessionId) : Promise.resolve(),
      AsyncStorage.setItem(AUTH_API_BASE_URL_KEY, API_BASE_URL),
    ]);
    if(generation!==authGeneration)return false;

    // A refresh response can predate an avatar/profile mutation. Never restore it
    // over the newer snapshot; rotating tokens does not change the profile session.
    if (!profileFence || ownProfileFenceMatches(profileFence)) {
      if (profile && acceptOwnProfile(profile, true)) await persistOwnProfile(profile);
      else if (!profileFence) await persistOwnProfile(null);
    }
    if(generation!==authGeneration)return false;

    refreshAttempts = 0;
    sessionExpiredActive = false;
    lastRefreshFailure = null;
    nextRefreshAttemptAt = 0;
    return generation===authGeneration;
  });
}

export async function logout(): Promise<void> {
  const generation=beginAuthSessionChange();
  await mutateCredentials(async()=>{
    if(generation!==authGeneration)return;
    await clearStoredAuthState();
    if(generation!==authGeneration)return;
    // Reset backoff to avoid warning spam after explicit logout.
    refreshAttempts = 0;
    lastWarnTs = 0;
    nextRefreshAttemptAt = 0;
    sessionExpiredActive = false;
    lastRefreshFailure = null;
  });
}

export function resetRefreshBackoff() {
  refreshAttempts = 0;
  lastWarnTs = 0;
  nextRefreshAttemptAt = 0;
}

/**
 * A foreground/online/manual retry may expedite a transient network failure.
 * This only releases backoff: the caller still uses the shared refresh flight,
 * credential queue and session fences. Repeated lifecycle signals coalesce.
 */
export function resumeAuthRefresh(): boolean {
  const now = Date.now();
  if (sessionExpiredActive || refreshInFlight || nextRefreshAttemptAt <= now
    || now - lastRefreshResumeAt < REFRESH_RETRY_BASE_MS) return false;
  const transient = lastRefreshFailure?.kind === 'network'
    || (lastRefreshFailure?.kind === 'server' && (lastRefreshFailure.status ?? 0) >= 500);
  if (!transient) return false;
  lastRefreshResumeAt = now;
  nextRefreshAttemptAt = 0;
  lastWarnTs = 0;
  // Preserve the exponential penalty if the expedited attempt also fails.
  return true;
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
  void reason;
  setServerUnavailable(SERVER_CONNECTION_UNAVAILABLE_MESSAGE);
}

async function acquireRefreshLock(owner: string): Promise<boolean> {
  const now = Date.now();
  const raw = await readStored(REFRESH_LOCK_KEY);
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
  const confirmRaw = await readStored(REFRESH_LOCK_KEY);
  try {
    const confirm = JSON.parse(confirmRaw || '{}');
    return confirm.owner === owner;
  } catch {
    return false;
  }
}

async function releaseRefreshLock(owner: string) {
  const raw = await readStored(REFRESH_LOCK_KEY);
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

async function postRefreshToken(storedRefreshToken: string,generation:number) {
  const profileFence = ownProfileFence();
  const device=await getAuthDevicePayload();
  if(generation!==authGeneration)return null;
  const res = await axios.post(
    `${API_BASE_URL}/auth/token`,
    {
      refreshToken: storedRefreshToken,
      ...device,
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
  if(!await commitTokens(accessToken, refreshToStore, profile, deviceSessionId, profileFence,generation,storedRefreshToken)||generation!==authGeneration)return null;
  refreshAttempts = 0;
  lastWarnTs = 0;
  nextRefreshAttemptAt = 0;
  setServerReachable();
  return accessToken;
}

async function getAccessTokenIfRefreshChanged(
  previousRefreshToken: string,
  previousAccessToken?: string | null,
  generation=authGeneration
): Promise<string | null> {
  const currentRefresh = await getRefreshToken();
  if (!currentRefresh || currentRefresh === previousRefreshToken) return null;
  const currentAccess = await secureGet(ACCESS_KEY);
  if(generation!==authGeneration)return null;
  if (!currentAccess || currentAccess === previousAccessToken) return null;
  if(previousAccessToken&&differentTokenAccounts(previousAccessToken,currentAccess))return null;
  return currentAccess;
}

function differentTokenAccounts(previous:string,current:string) {
  try {
    const before=jwtDecode<{userId?:number|string}>(previous).userId;
    const after=jwtDecode<{userId?:number|string}>(current).userId;
    return before!=null&&after!=null&&String(before)!==String(after);
  }catch{return false;}
}

export async function refreshToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  if(sessionExpiredActive)return null;
  const generation=authGeneration;

  // Publish the flight before the first storage await. Concurrent consumers must
  // not both attempt to rotate the same one-time refresh token.
  const work = Promise.resolve().then(async () => {
    let storedRefreshToken: string | null = null;
    let storedAccessToken: string | null = null;
    const lockOwner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let hasLock = false;
    try {
      await authWrites;
      if(generation!==authGeneration)return null;
      storedRefreshToken = await getRefreshToken();
      storedAccessToken = await secureGet(ACCESS_KEY);
      if(generation!==authGeneration)return null;
      if (!storedRefreshToken) {
        refreshAttempts = 0;
        lastRefreshFailure = null;
        return null;
      }

      if (nextRefreshAttemptAt > Date.now()) {
        const now = Date.now();
        if (now - lastWarnTs > 10_000) {
          console.warn('Обновление токена отложено до восстановления соединения');
          lastWarnTs = now;
        }
        return null;
      }

      refreshAttempts++;

      return await withAuthWebLock('refresh',async()=>{
        if(generation!==authGeneration)return null;
        hasLock = await acquireRefreshLock(lockOwner);
        if (!hasLock) {
          await delay(350);
          const accessFromOtherRuntime = await getAccessTokenIfRefreshChanged(storedRefreshToken!, storedAccessToken,generation);
          if (accessFromOtherRuntime) {
            return accessFromOtherRuntime;
          }
          hasLock = await acquireRefreshLock(lockOwner);
          if (!hasLock) {
            const recovered = await waitForRotatedTokenFromOtherRuntime(storedRefreshToken!, storedAccessToken,generation);
            if (recovered) return recovered;
            if(generation!==authGeneration)return null;
            rememberRefreshFailure({
              kind: 'rotated',
              status: 409,
              message: 'Refresh is being completed by another application runtime',
            });
            return null;
          }
        }

        // The snapshot may have been rotated while waiting for either lock.
        // Reuse its completed successor instead of sending the spent token.
        const currentRefresh=await getRefreshToken();
        if(generation!==authGeneration||!currentRefresh)return null;
        if(currentRefresh!==storedRefreshToken){
          return await getAccessTokenIfRefreshChanged(storedRefreshToken!,storedAccessToken,generation)
            ?? await waitForRotatedTokenFromOtherRuntime(storedRefreshToken!,storedAccessToken,generation);
        }
        return await postRefreshToken(currentRefresh,generation);
      });
    } catch (e: any) {
      if(generation!==authGeneration)return null;
      const refreshError = readRefreshError(e);
      const { status, message: msg } = refreshError;

      if (e instanceof Error && (e.name === 'TimeoutError'||e.name==='AbortError')) {
        // Storage temporarily failed to answer. Preserve credentials and allow
        // another attempt; do not classify this as invalid authentication.
        rememberRefreshFailure({ kind: 'unknown', status: 503, message: 'Credential storage is temporarily unavailable' });
        return null;
      }
      if (storedRefreshToken && isRefreshTokenRotatedConflict(refreshError)) {
        const recovered = await waitForRotatedTokenFromOtherRuntime(storedRefreshToken, storedAccessToken,generation);
        if (recovered) return recovered;
        if(generation!==authGeneration)return null;
        rememberRefreshFailure({ kind: 'rotated', status, message: msg });
        return null;
      }

      if (status === 401 || status === 403) {
        const latestRefresh = await getRefreshToken();
        if(generation!==authGeneration)return null;
        if (storedRefreshToken && latestRefresh && latestRefresh !== storedRefreshToken) {
          const recovered = await getAccessTokenIfRefreshChanged(storedRefreshToken,storedAccessToken,generation)
            ?? await waitForRotatedTokenFromOtherRuntime(storedRefreshToken, storedAccessToken,generation);
          if (recovered) return recovered;
          if(generation!==authGeneration)return null;
          rememberRefreshFailure({ kind: 'rotated', status: 409, message: 'Refresh token was rotated by another runtime' });
          return null;
        }
        // Expected session expiry already notifies AuthProvider, which opens
        // login. console.error here incorrectly opens the development LogBox.
        await invalidateAuthSession(msg,status,storedRefreshToken,generation);
        return null;
      }
      console.error('[token] refresh error', { status, msg });
      if (!status) {
        rememberRefreshFailure({ kind: 'network', message: msg });
        scheduleRefreshRetry();
        await handleBackendUnavailable(msg);
      } else if (status >= 500) {
        rememberRefreshFailure({ kind: 'server', status, message: msg });
        scheduleRefreshRetry();
        setServerUnavailable(SERVER_CONNECTION_UNAVAILABLE_MESSAGE);
      } else {
        rememberRefreshFailure({ kind: 'unknown', status, message: msg });
        scheduleRefreshRetry();
      }
      return null;
    } finally {
      if (hasLock) {
        // A storage read timeout must not replace the refresh result. The
        // existing lease expires on its own if releasing it is unavailable.
        await releaseRefreshLock(lockOwner).catch(()=>{});
      }
    }
  });
  // Recovery inside the catch above also reads storage/acquires a browser lock.
  // Its failure must remain transient rather than escape as an unhandled error.
  const flight = work.catch(()=>{
    if(generation===authGeneration){
      rememberRefreshFailure({kind:'unknown',status:503,message:'Credential storage is temporarily unavailable'});
      scheduleRefreshRetry();
    }
    return null;
  }).then(value=>generation===authGeneration?value:null).finally(() => {
    if (refreshInFlight === flight) refreshInFlight = null;
  });
  refreshInFlight = flight;
  return flight;
}
