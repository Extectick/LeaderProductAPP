import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, NativeModules, Platform } from 'react-native';
import { jwtDecode } from 'jwt-decode';
import { apiClient } from '@/utils/apiClient';
import { getAccessTokenForRequest, hasAuthSessionExpired } from '@/utils/tokenService';
import { subscribeServerStatus, getServerStatus } from '@/src/shared/network/serverStatus';
import { captureException } from '@/src/shared/monitoring';
import { drainOrderOutbox, type OutboxTransport } from './orderOutboxCore';
import * as database from './orderOutboxDatabase';
import { subscribeOrderOutboxChange } from './orderOutboxEvents';
import { emitOrderOutboxChange } from './orderOutboxEvents';
import { initializeOrderApiScope } from './orderOutboxScope';
import { getCatalogDatabase } from '@/src/features/productCatalog/data/catalogDatabase';

const native = Platform.OS === 'android' ? NativeModules.LeaderOrderOutbox : null;
let activeUser: string | null = null;
let generation = 0;
let running: Promise<void> | null = null;
let rerun = false;
let wakeup: ReturnType<typeof setTimeout> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let cleanup: (() => void) | null = null;
let abort: AbortController | null = null;
let asyncEnabled = false;
let capabilityKnown = false;
let capabilityCache: { userId: string; checkedAt: number; value: { enabled: boolean; protocol: string } } | null = null;
export function isAsyncOrderOutboxEnabled() { return Platform.OS !== 'web' && asyncEnabled; }

async function currentSessionUser() {
  if (hasAuthSessionExpired()) return null;
  const [token, profileJson] = await Promise.all([getAccessTokenForRequest(), AsyncStorage.getItem('profile')]);
  if (!token || !profileJson) return null;
  try {
    const profile = JSON.parse(profileJson);
    const jwt = jwtDecode<{ userId?: unknown }>(token);
    return jwt.userId != null && String(jwt.userId) === String(profile.id) ? String(profile.id) : null;
  } catch { return null; }
}
function transport(userId: string, signal: AbortSignal, isCurrent: () => boolean): OutboxTransport {
  async function request<T>(path: string, method: 'GET' | 'POST' | 'PUT', body?: any) {
    if (!isCurrent()) throw Object.assign(new Error('Пользователь изменился'), { name: 'AccountChangedError' });
    const result = await apiClient<any, T>(path, { method, body, signal, expectedUserId: userId, timeoutMs: 15_000, networkRetryCount: 0 });
    if (!result.ok || !result.data) throw Object.assign(new Error(result.message || 'API не ответил'), {
      status: result.status, backendErrorCode: result.backendErrorCode, errorDetails: result.errorDetails,
    });
    return result.data;
  }
  return {
    capabilities: () => request('/api/client-orders/submissions/capabilities', 'GET'),
    upload: async items => (await request<{ results: any[] }>('/api/client-orders/submissions/batch', 'POST', {
      items: items.map(({ clientOrderId, payloadHash, payload }) => ({ clientOrderId, payloadHash, payload })),
    })).results,
    statuses: async ids => (await request<{ results: any[] }>('/api/client-orders/submissions/status', 'POST', { ids })).results,
    order: receipt => request(`/api/client-orders/submissions/${encodeURIComponent(receipt.submissionId)}/order`, 'GET'),
  };
}

export async function runOrderOutboxInBackground() {
  if (Platform.OS === 'web') return;
  if (running) { rerun = true; return running; }
  const operationGeneration = generation;
  abort = new AbortController();
  const signal = abort.signal;
  running = (async () => {
    const userId = await currentSessionUser();
    if (!userId) { await native?.setPending(false); return; }
    if ((activeUser && activeUser !== userId) || operationGeneration !== generation) return;
    const isCurrent = () => generation === operationGeneration && !signal.aborted && (!activeUser || activeUser === userId);
    try {
      const localDatabase = await getCatalogDatabase();
      if (!localDatabase) return;
      await initializeOrderApiScope(localDatabase);
      const api = transport(userId, signal, isCurrent);
      const capability = capabilityCache?.userId === userId && Date.now() - capabilityCache.checkedAt < 30_000
        ? capabilityCache.value : await api.capabilities();
      if (!isCurrent()) return;
      capabilityCache = { userId, checkedAt: Date.now(), value: capability };
      capabilityKnown = true;
      const enabled = capability.enabled && capability.protocol === 'client-order-inbox-v1';
      if (asyncEnabled !== enabled) { asyncEnabled = enabled; emitOrderOutboxChange({ userId }); }
      if (!await database.hasPendingOrderUploads(userId) && !(await database.readAcceptedUploads(userId)).length) return;
      await drainOrderOutbox({ userId, isCurrent, transport: { ...api, capabilities: async () => capability }, store: {
        claim: database.claimOrderUploads, accept: database.acceptOrderUpload, fail: database.failOrderUpload,
        accepted: database.readAcceptedUploads, status: database.updateSubmissionStatus, complete: database.completeOrderUpload,
      } });
    } finally {
      if (isCurrent()) await native?.setPending((asyncEnabled || !capabilityKnown) && await database.hasPendingOrderUploads(userId));
    }
  })().catch(error => {
    if ([403,404].includes(error?.status)) {
      capabilityKnown = true; asyncEnabled = false;
      if (activeUser) capabilityCache = { userId: activeUser, checkedAt: Date.now(), value: { enabled: false, protocol: 'client-order-inbox-v1' } };
      void native?.setPending(false)?.catch(() => {});
    }
    // Expected offline/HTTP failures remain in the durable queue, not global alerts.
    if (!signal.aborted && ![401,403,404].includes(error?.status)
      && !/network|fetch|связ|API не|сервер|abort/i.test(String(error?.message))) captureException(error, { where: 'order-outbox' });
  }).finally(() => {
    running = null;
    abort = null;
    if (rerun && activeUser) { rerun = false; kickOrderOutbox(); }
  });
  return running;
}
export function kickOrderOutbox() {
  if (!activeUser || Platform.OS === 'web') return;
  if (wakeup) return;
  wakeup = setTimeout(() => {
    wakeup = null;
    void runOrderOutboxInBackground();
  }, 250);
}
export async function retryOrderOutboxNow() {
  if (!activeUser) return;
  await database.expediteOrderUploads(activeUser);
  kickOrderOutbox();
}
export function startOrderOutbox(userId: string) {
  if (Platform.OS === 'web' || activeUser === userId) return;
  stopOrderOutbox();
  activeUser = userId;
  const changed = subscribeOrderOutboxChange(event => {
    if (event.userId !== activeUser) return;
    void database.hasPendingOrderUploads(userId).then(pending => native?.setPending((asyncEnabled || !capabilityKnown) && pending)).catch(() => {});
    if (getServerStatus().isReachable) kickOrderOutbox();
  });
  const network = subscribeServerStatus(status => { if (status.isReachable) void retryOrderOutboxNow().catch(() => {}); });
  const app = AppState.addEventListener('change', state => { if (state === 'active') kickOrderOutbox(); });
  timer = setInterval(() => { if (AppState.currentState === 'active') kickOrderOutbox(); }, 15_000);
  cleanup = () => { changed(); network(); app.remove(); };
  kickOrderOutbox();
}
export function stopOrderOutbox() {
  generation++;
  activeUser = null;
  asyncEnabled = false;
  capabilityKnown = false;
  capabilityCache = null;
  abort?.abort();
  if (timer) clearInterval(timer);
  if (wakeup) clearTimeout(wakeup);
  timer = wakeup = null;
  cleanup?.(); cleanup = null;
  void native?.setPending(false)?.catch(() => {});
}
