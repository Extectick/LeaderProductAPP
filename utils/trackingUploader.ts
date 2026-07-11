import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './apiClient';
import { SaveTrackingPointsRequest, SaveTrackingPointsResponse, TrackingPointInput } from './trackingApi';

const STORAGE_KEYS = {
  queue: 'tracking:queue',
  routeId: 'tracking:routeId',
  pendingEndRoute: 'tracking:pendingEndRoute',
};

const MAX_QUEUE_LENGTH = 1000;
const MAX_BATCH_POINTS = 200;
const RETRY_DELAY_MS = 30_000;
const AUTH_RETRY_DELAY_MS = 120_000;
const AUTH_ERROR_PAUSE_MS = 20_000;
const WARN_THROTTLE_MS = 15_000;
const PERIODIC_FLUSH_MS = 60_000;
const WATCHDOG_MS = 45_000;
const STUCK_WARN_THROTTLE_MS = 5 * 60_000;
const UPLOAD_TIMEOUT_MS = 15_000;
const UPLOAD_HARD_TIMEOUT_MS = 20_000;

type SendResult =
  | { ok: true; data?: SaveTrackingPointsResponse; status: number }
  | { ok: false; status: number; message?: string };

let hydrated = false;
let queue: TrackingPointInput[] = [];
let activeRouteId: number | undefined;
let pendingEndRoute = false;
let sending = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let sendPromise: Promise<void> | null = null;
let sendingStartedAt: number | null = null;
let lastWarnKey: string | null = null;
let lastWarnAt = 0;
let lastStuckWarnAt = 0;
let lastSuccessfulFlushAt: string | undefined;
let lastError:
  | {
      at: string;
      status?: number;
      message: string;
    }
  | undefined;

function log(_prefix: string, _message: string, _extra?: any) {
  // silence info logs in production
}

function warn(prefix: string, message: string, extra?: any) {
  if (extra !== undefined) console.warn(`${prefix} ${message}`, extra);
  else console.warn(`${prefix} ${message}`);
}

function warnThrottled(prefix: string, message: string, extra?: any) {
  const key = `${prefix}:${message}:${extra?.status ?? ''}:${extra?.message ?? ''}`;
  const now = Date.now();
  if (lastWarnKey === key && now - lastWarnAt < WARN_THROTTLE_MS) return;
  lastWarnKey = key;
  lastWarnAt = now;
  warn(prefix, message, extra);
}

function warnStuckThrottled(prefix: string, message: string) {
  const now = Date.now();
  if (now - lastStuckWarnAt < STUCK_WARN_THROTTLE_MS) return;
  lastStuckWarnAt = now;
  warn(prefix, message);
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

function parseBoolean(raw: string | null): boolean {
  return raw === 'true';
}

function makeClientPointId() {
  return `tp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function hydrate() {
  if (hydrated) return;
  const [queueRaw, routeRaw, pendingEndRaw] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.queue),
    AsyncStorage.getItem(STORAGE_KEYS.routeId),
    AsyncStorage.getItem(STORAGE_KEYS.pendingEndRoute),
  ]);
  queue = parseQueue(queueRaw);
  activeRouteId = parseRouteId(routeRaw);
  pendingEndRoute = parseBoolean(pendingEndRaw);
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

async function persistPendingEndRoute() {
  try {
    if (pendingEndRoute) {
      await AsyncStorage.setItem(STORAGE_KEYS.pendingEndRoute, 'true');
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.pendingEndRoute);
    }
  } catch (e) {
    warn('[tracking-upload]', 'persist pendingEndRoute failed', e);
  }
}

function ensurePeriodic() {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    void kickFlush('[tracking-upload:periodic]');
  }, PERIODIC_FLUSH_MS);
  (periodicTimer as any)?.unref?.();
}

function isAuthErrorStatus(status?: number) {
  return status === 401 || status === 403 || status === 409;
}

function scheduleRetry(logPrefix: string, delayMs = RETRY_DELAY_MS) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void kickFlush(logPrefix);
  }, delayMs);
  (retryTimer as any)?.unref?.();
}

async function sendTrackingBatch(payload: SaveTrackingPointsRequest): Promise<SendResult> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const response = await Promise.race([
      apiClient<SaveTrackingPointsRequest, SaveTrackingPointsResponse>('/tracking/points', {
        method: 'POST',
        body: payload,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Tracking upload timeout')), UPLOAD_HARD_TIMEOUT_MS);
        (timeout as any)?.unref?.();
      }),
    ]);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: response.message,
      };
    }
    return {
      ok: true,
      status: response.status,
      data: response.data,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      message: error?.message || 'Tracking upload failed',
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function processQueue(logPrefix: string) {
  await hydrate();
  ensurePeriodic();

  if (!queue.length) {
    log(logPrefix, 'flush skipped: queue empty');
    return;
  }

  if (isAuthErrorStatus(lastError?.status)) {
    const lastErrorAt = Date.parse(lastError?.at || '');
    if (Number.isFinite(lastErrorAt) && Date.now() - lastErrorAt < AUTH_ERROR_PAUSE_MS) {
      log(logPrefix, 'flush paused after recent auth error');
      scheduleRetry(logPrefix, AUTH_RETRY_DELAY_MS);
      return;
    }
  }

  log(logPrefix, 'flush start', { size: queue.length, routeId: activeRouteId });

  const batch = queue.slice(0, MAX_BATCH_POINTS);
  const closesRoute = pendingEndRoute && batch.length === queue.length;
  const payload: SaveTrackingPointsRequest = {
    points: batch,
    routeId: activeRouteId,
    startNewRoute: !activeRouteId,
    endRoute: closesRoute,
  };

  const result = await sendTrackingBatch(payload);

  if (!result.ok) {
    const retryDelay = isAuthErrorStatus(result.status) ? AUTH_RETRY_DELAY_MS : RETRY_DELAY_MS;
    lastError = {
      at: new Date().toISOString(),
      status: result.status,
      message: result.message || 'Tracking upload failed',
    };
    warnThrottled(logPrefix, 'batch failed, will retry later', { status: result.status, message: result.message });
    scheduleRetry(logPrefix, retryDelay);
    return;
  }

  lastWarnKey = null;
  lastWarnAt = 0;
  lastError = undefined;
  lastSuccessfulFlushAt = new Date().toISOString();
  queue = queue.slice(batch.length);
  await persistQueue();

  const nextRouteId =
    (result.data as any)?.data?.routeId ??
    (result.data as any)?.routeId;
  if (nextRouteId) {
    activeRouteId = closesRoute ? undefined : nextRouteId;
    await persistRouteId();
  }
  if (closesRoute) {
    pendingEndRoute = false;
    await persistPendingEndRoute();
  }

  log(logPrefix, 'batch sent', { left: queue.length, routeId: activeRouteId });

  log(logPrefix, 'flush success', { routeId: activeRouteId });
}

function kickFlush(logPrefix: string) {
  if (sending) {
    // если отправка зависла, но пришёл новый триггер — сбросим флаг по истечении watchdog
    if (sendingStartedAt && Date.now() - sendingStartedAt > WATCHDOG_MS) {
      warnStuckThrottled(logPrefix, 'flush stuck detected on re-entry, resetting sender');
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
    warnStuckThrottled(logPrefix, 'flush watchdog fired, resetting sender');
    sending = false;
    sendPromise = null;
    sendingStartedAt = null;
    scheduleRetry(logPrefix);
  }, WATCHDOG_MS);
  (watchdog as any)?.unref?.();

  sendPromise = processQueue(logPrefix)
    .catch((e) => {
      lastError = {
        at: new Date().toISOString(),
        message: e?.message || String(e || 'Tracking upload failed'),
      };
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

  const prepared = points.map((point) => ({
    ...point,
    clientPointId: point.clientPointId || makeClientPointId(),
  }));
  queue = [...queue, ...prepared].slice(-MAX_QUEUE_LENGTH);
  await persistQueue();

  const promise = kickFlush(logPrefix);
  if (!options?.fireAndForgetFlush) {
    return promise;
  }
}

export function flushTrackingQueue(logPrefix = '[tracking-upload]') {
  return kickFlush(logPrefix);
}

export async function resetTrackingUploadBackoff() {
  lastError = undefined;
  lastWarnKey = null;
  lastWarnAt = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export async function getTrackingRouteId(): Promise<number | undefined> {
  await hydrate();
  return activeRouteId;
}

export async function setTrackingRouteId(routeId: number | undefined, logPrefix = '[tracking-upload]') {
  await hydrate();
  activeRouteId = routeId;
  await persistRouteId();
  log(logPrefix, 'routeId set', { routeId });
}

export async function clearRouteIdIfIdle(logPrefix = '[tracking-upload]') {
  await hydrate();
  if (queue.length > 0 || pendingEndRoute) return;
  if (activeRouteId === undefined) return;
  activeRouteId = undefined;
  await persistRouteId();
  log(logPrefix, 'routeId cleared (idle)');
}

export async function getQueueDebug(): Promise<{
  length: number;
  routeId?: number;
  pendingEndRoute: boolean;
  sending: boolean;
  lastSuccessfulFlushAt?: string;
  lastError?: {
    at: string;
    status?: number;
    message: string;
  };
}> {
  await hydrate();
  return {
    length: queue.length,
    routeId: activeRouteId,
    pendingEndRoute,
    sending,
    lastSuccessfulFlushAt,
    lastError,
  };
}

export async function markTrackingRouteEnding(logPrefix = '[tracking-upload]') {
  await hydrate();
  if (activeRouteId === undefined) return;
  pendingEndRoute = true;
  await persistPendingEndRoute();
  log(logPrefix, 'route marked for closing', { routeId: activeRouteId });
}
