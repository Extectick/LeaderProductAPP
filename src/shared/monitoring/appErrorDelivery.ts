import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { drainNativeAppErrors } from './nativeAppErrors';
import { API_BASE_URL } from '@/utils/config';
import { subscribeServerStatus } from '@/src/shared/network/serverStatus';
import { makeAppErrorPayload, nativeAppErrorPayload, readAppErrorPayload, type AppErrorInput, type AppErrorPayload, type NativeAppErrorRecord } from './appErrorPayload';

const prefix = 'app-error-reports:v1:' + encodeURIComponent(API_BASE_URL) + ':';
const ttl = 7 * 24 * 60 * 60_000;
const limit = 12;
const recent = new Map<string, number>();
let writes = Promise.resolve();
let receiver: { ownerId: number; wake: () => void } | null = null;

function activeOwner(id: unknown): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
}

async function pendingKeys(ownerId?: number) {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix)).sort().reverse();
  const keep: string[] = [];
  const remove: string[] = [];
  for (const key of keys) {
    const timestamp = Number(key.slice(prefix.length).split(':', 1)[0]);
    if (!timestamp || timestamp <= Date.now() - ttl || keep.length >= limit) remove.push(key);
    else keep.push(key);
  }
  if (remove.length) await AsyncStorage.multiRemove(remove);
  return keep.reverse().filter(key => !ownerId || key.slice(prefix.length).split(':')[1] === String(ownerId));
}

function persist(ownerId: number, payload: AppErrorPayload) {
  const key = prefix + Date.parse(payload.occurredAt) + ':' + ownerId + ':' + payload.eventId;
  const store = writes.then(async () => {
    await AsyncStorage.setItem(key, JSON.stringify(payload));
    const retained = await pendingKeys(ownerId);
    if (receiver?.ownerId === ownerId) receiver.wake();
    return retained.includes(key);
  });
  writes = store.then(() => {}, () => {});
  return store;
}

export async function queueNativeAppErrorReport(record: NativeAppErrorRecord): Promise<boolean> {
  try {
    const origin = new URL(API_BASE_URL).origin;
    const environment = origin === 'https://dev.lidprod.ru' ? 'development'
      : ['https://sibvod.ru', 'https://api.lidprod.ru'].includes(origin) ? 'production' : null;
    const ownerId = Number(record.ownerId);
    if (!environment || record.environment !== environment || !activeOwner(ownerId) || String(ownerId) !== record.ownerId ||
        receiver?.ownerId !== ownerId || record.occurredAt <= Date.now() - ttl || record.occurredAt > Date.now() + 600_000) return false;
    const payload = nativeAppErrorPayload(record);
    return Boolean(payload && await persist(ownerId, payload));
  } catch { return false; }
}

export async function queueAppErrorReport(input: AppErrorInput): Promise<void> {
  const ownerId = input.ownerId;
  if (!activeOwner(ownerId)) return;
  try {
    const payload = makeAppErrorPayload(input);
    if (!payload) return;
    const now = Date.now();
    const signature = JSON.stringify([ownerId, payload.source, payload.screen, payload.stage, payload.kind,
      payload.components.slice(0, 3), payload.jsFrames.slice(0, 3)]);
    for (const [key, timestamp] of recent) if (timestamp <= now - 60_000) recent.delete(key);
    // An error loop may enter a global handler hundreds of times per second.
    if (recent.has(signature) || recent.size >= 24) return;
    recent.set(signature, now);
    try { await persist(ownerId, payload); } catch { recent.delete(signature); }
  } catch { /* Reporting an exception must never raise another exception. */ }
}

export function startAppErrorDelivery(ownerId: number) {
  const controller = new AbortController();
  let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
  let busy = false;
  let requested = false;
  let retryAt = 0;
  let retryDelay = 15_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function wake() {
    requested = true;
    if (busy || !foreground || controller.signal.aborted || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void drain();
    }, Math.min(ttl, Math.max(0, retryAt - Date.now())));
  }
  function retry(minimum = 0) {
    retryAt = Date.now() + Math.max(minimum, retryDelay);
    retryDelay = Math.min(15 * 60_000, retryDelay * 2);
    requested = true;
  }
  async function drain() {
    if (!foreground || controller.signal.aborted) return;
    if (Date.now() < retryAt) { wake(); return; }
    busy = true;
    requested = false;
    try {
      for (const key of await pendingKeys(ownerId)) {
        if (!foreground || controller.signal.aborted) break;
        const json = await AsyncStorage.getItem(key);
        if (json === null) continue;
        const payload = readAppErrorPayload(json, key.slice(key.lastIndexOf(':') + 1));
        if (!payload) { await AsyncStorage.removeItem(key); continue; }
        // Defer importing the authenticated client: it imports the monitoring hooks itself.
        const { apiClient } = require('@/utils/apiClient') as typeof import('@/utils/apiClient');
        if (controller.signal.aborted || !foreground) break;
        const result = await apiClient<typeof payload>('/api/diagnostics/app-errors', {
          method: 'POST', body: payload, expectedUserId: ownerId, passive: true, signal: controller.signal, timeoutMs: 8_000,
        });
        if (controller.signal.aborted) break;
        if (result.status === 204 || [400, 413, 422].includes(result.status)) {
          await AsyncStorage.removeItem(key);
          retryAt = 0;
          retryDelay = 15_000;
        } else {
          retry(Math.max(result.retryAfterMs ?? 0, result.status === 404 ? 15 * 60_000 : 0));
          break;
        }
      }
    } catch { if (!controller.signal.aborted) retry(); }
    finally {
      busy = false;
      if (requested) wake();
    }
  }
  const session = { ownerId, wake };
  receiver = session;
  function importNativeReports() {
    if (controller.signal.aborted || !foreground) return;
    void drainNativeAppErrors(ownerId).catch(() => {});
  }
  importNativeReports();
  const app = AppState.addEventListener('change', state => {
    foreground = state === 'active';
    if (foreground) { importNativeReports(); wake(); }
  });
  const unsubscribe = subscribeServerStatus(status => { if (status.isReachable) wake(); });
  wake();
  return () => {
    if (receiver === session) receiver = null;
    controller.abort();
    if (timer !== undefined) clearTimeout(timer);
    app.remove();
    unsubscribe();
  };
}

export function useAppErrorDelivery(ownerId?: number | null) {
  useEffect(() => {
    if (activeOwner(ownerId)) return startAppErrorDelivery(ownerId);
  }, [ownerId]);
}
