import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE_URL } from './config';
import { getAccessToken, refreshToken } from './tokenService';
import { SaveTrackingPointsRequest, SaveTrackingPointsResponse, TrackingPointInput } from './trackingApi';

const STORAGE_KEYS = {
  queue: 'tracking:queue',
  routeId: 'tracking:routeId',
};

const MAX_QUEUE_LENGTH = 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 30_000;
const PERIODIC_FLUSH_MS = 60_000;
const WATCHDOG_MS = 45_000;

type SendResult =
  | { ok: true; data?: SaveTrackingPointsResponse; status: number }
  | { ok: false; status: number; message?: string };

let hydrated = false;
let queue: TrackingPointInput[] = [];
let activeRouteId: number | undefined;
let sending = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let sendPromise: Promise<void> | null = null;
let sendingStartedAt: number | null = null;

function log(_prefix: string, _message: string, _extra?: any) {
  // silence info logs in production
}

function warn(prefix: string, message: string, extra?: any) {
  if (extra !== undefined) console.warn(`${prefix} ${message}`, extra);
  else console.warn(`${prefix} ${message}`);
}

function parseQueue(raw: string | null): TrackingPointInput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRouteId(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function hydrate() {
  if (hydrated) return;
  const [queueRaw, routeRaw] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.queue),
    AsyncStorage.getItem(STORAGE_KEYS.routeId),
  ]);
  queue = parseQueue(queueRaw);
  activeRouteId = parseRouteId(routeRaw);
  hydrated = true;
}

async function persistQueue() {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(queue));
  } catch (e) {
    warn('[tracking-upload]', 'persist queue failed', e);
  }
}

async function persistRouteId() {
  try {
    if (activeRouteId === undefined) {
      await AsyncStorage.removeItem(STORAGE_KEYS.routeId);
    } else {
      await AsyncStorage.setItem(STORAGE_KEYS.routeId, String(activeRouteId));
    }
  } catch (e) {
    warn('[tracking-upload]', 'persist routeId failed', e);
  }
}

function ensurePeriodic() {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    void kickFlush('[tracking-upload:periodic]');
  }, PERIODIC_FLUSH_MS);
}

function scheduleRetry(logPrefix: string) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void kickFlush(logPrefix);
  }, RETRY_DELAY_MS);
}

async function sendOnceAxios(token: string, payload: SaveTrackingPointsRequest, logPrefix: string): Promise<SendResult> {
  try {
    const resp = await axios.post<SaveTrackingPointsResponse>(
      `${API_BASE_URL}/tracking/points`,
      payload,
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const result: SendResult = { ok: true, status: resp.status, data: resp.data };
    return result;
  } catch (e: any) {
    const status: number | undefined = e?.response?.status;
    const message: string | undefined = e?.response?.data?.message || e?.message;
    const result: SendResult = { ok: false, status: status ?? 0, message };
    return result;
  }
}

async function sendWithRefresh(payload: SaveTrackingPointsRequest, logPrefix: string): Promise<SendResult> {
  let token = await getAccessToken();
  if (!token) token = await refreshToken();
  if (!token) return { ok: false, status: 401, message: 'Нет accessToken' };

  const first = await sendOnceAxios(token, payload, `${logPrefix} [try-1]`);
  if (first.ok || first.status !== 401) return first;

  warn(logPrefix, '401 received, refreshing');
  const refreshed = await refreshToken();
  const retryToken = refreshed || (await getAccessToken());
  if (!retryToken) {
    warn(logPrefix, 'refresh returned no token, aborting retry');
    return first;
  }

  log(logPrefix, 'retry with refreshed token', {
    tokenPreview: `${retryToken.slice(0, 8)}...${retryToken.slice(-6)}`,
  });
  return sendOnceAxios(retryToken, payload, `${logPrefix} [try-2]`);
}

async function processQueue(logPrefix: string) {
  await hydrate();
  ensurePeriodic();

  if (!queue.length) {
    log(logPrefix, 'flush skipped: queue empty');
    return;
  }

  log(logPrefix, 'flush start', { size: queue.length, routeId: activeRouteId });

  const batch = queue.slice();
  const payload: SaveTrackingPointsRequest = {
    points: batch,
    routeId: activeRouteId,
    startNewRoute: !activeRouteId,
  };

  const result = await sendWithRefresh(payload, logPrefix);

  if (!result.ok) {
    warn(logPrefix, 'batch failed, will retry later', { status: result.status, message: result.message });
    scheduleRetry(logPrefix);
    return;
  }

  queue = queue.slice(batch.length);
  await persistQueue();

  if (result.data?.routeId) {
    activeRouteId = result.data.routeId;
    await persistRouteId();
  }

  log(logPrefix, 'batch sent', { left: queue.length, routeId: activeRouteId });

  log(logPrefix, 'flush success', { routeId: activeRouteId });
}

function kickFlush(logPrefix: string) {
  if (sending) {
    // если отправка зависла, но пришёл новый триггер — сбросим флаг по истечении watchdog
    if (sendingStartedAt && Date.now() - sendingStartedAt > WATCHDOG_MS) {
      warn(logPrefix, 'flush stuck detected on re-entry, resetting sender');
      sending = false;
      sendPromise = null;
      sendingStartedAt = null;
    } else {
      return sendPromise || Promise.resolve();
    }
  }
  sending = true;
  sendingStartedAt = Date.now();
  let finished = false;
  const watchdog = setTimeout(() => {
    if (finished) return;
    warn(logPrefix, 'flush watchdog fired, resetting sender');
    sending = false;
    sendPromise = null;
    sendingStartedAt = null;
    scheduleRetry(logPrefix);
  }, WATCHDOG_MS);

  sendPromise = processQueue(logPrefix)
    .catch((e) => {
      warn(logPrefix, 'flush threw', e?.message || e);
      scheduleRetry(logPrefix);
    })
    .finally(() => {
      finished = true;
      clearTimeout(watchdog);
      sending = false;
      sendPromise = null;
      sendingStartedAt = null;
    });
  return sendPromise;
}

/**
 * Ставит точки в очередь, сохраняет и инициирует отправку.
 */
export async function enqueueTrackingPoints(
  points: TrackingPointInput[],
  logPrefix = '[tracking-upload]',
  options?: { fireAndForgetFlush?: boolean }
) {
  if (!points.length) return;
  await hydrate();
  ensurePeriodic();

  queue = [...queue, ...points].slice(-MAX_QUEUE_LENGTH);
  await persistQueue();

  const promise = kickFlush(logPrefix);
  if (!options?.fireAndForgetFlush) {
    return promise;
  }
}

export function flushTrackingQueue(logPrefix = '[tracking-upload]') {
  return kickFlush(logPrefix);
}

export async function getTrackingRouteId(): Promise<number | undefined> {
  await hydrate();
  return activeRouteId;
}

export async function clearRouteIdIfIdle(logPrefix = '[tracking-upload]') {
  await hydrate();
  if (queue.length > 0) return;
  if (activeRouteId === undefined) return;
  activeRouteId = undefined;
  await persistRouteId();
  log(logPrefix, 'routeId cleared (idle)');
}

export async function getQueueDebug(): Promise<{ length: number; routeId?: number }> {
  await hydrate();
  return { length: queue.length, routeId: activeRouteId };
}
