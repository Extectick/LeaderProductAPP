import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';

import {
  getTrackingStatus,
  issueNativeTrackingToken,
  revokeNativeTrackingToken,
  startTrackingSession,
  stopTrackingSession,
  TrackingPointInput,
} from '@/utils/trackingApi';
import { API_BASE_URL } from '@/utils/config';
import { getAuthDevicePayload } from '@/utils/tokenService';
import {
  getNativeTrackingStatus,
  isNativeTrackingAvailable,
  startNativeTracking,
  stopNativeTracking,
} from '@/utils/nativeTrackingService';
import {
  clearRouteIdIfIdle,
  enqueueTrackingPoints,
  flushTrackingQueue,
  getQueueDebug,
  getTrackingRouteId,
  markTrackingRouteEnding,
  setTrackingRouteId,
} from '@/utils/trackingUploader';
import { addMonitoringBreadcrumb, captureException } from '@/src/shared/monitoring';

const BACKGROUND_TASK_NAME = 'BACKGROUND_LOCATION_TRACKING';
const BACKGROUND_TASK_REPAIR_COOLDOWN_MS = 5 * 60_000;
const STORAGE_KEYS = {
  enabled: 'tracking:enabled',
};

let notificationsModule: typeof import('expo-notifications') | null = null;
let backgroundTaskRetryAfter = 0;
let lastBackgroundTaskWarnAt = 0;
let backgroundTaskStartPromise: Promise<boolean> | null = null;
let backgroundTaskEnsurePromise: Promise<boolean> | null = null;

function isExpoGo() {
  const ownership = (Constants as any).appOwnership;
  const execution = (Constants as any).executionEnvironment;
  return ownership === 'expo' || execution === 'storeClient';
}

async function getNotificationsModule(logPrefix: string) {
  if (Platform.OS === 'web') return null;
  if (isExpoGo()) return null;
  if (notificationsModule) return notificationsModule;
  try {
    const mod = await import('expo-notifications');
    notificationsModule = mod;
    return mod;
  } catch (e) {
    console.warn(`${logPrefix} expo-notifications unavailable`, e);
    return null;
  }
}

type TrackingContextValue = {
  trackingEnabled: boolean;
  routeId?: number;
  trackingStatus: TrackingStatusCode;
  trackingStatusText: string;
  queueLength: number;
  lastUploadAt?: string;
  lastError?: string;
  refreshTrackingStatus: () => Promise<void>;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
};

type TrackingStatusCode =
  | 'idle'
  | 'tracking'
  | 'uploading'
  | 'waitingNetwork'
  | 'needsAuth'
  | 'permissionDenied'
  | 'serviceDenied'
  | 'starting'
  | 'stopping'
  | 'error';

const TrackingContext = createContext<TrackingContextValue | undefined>(undefined);

function getTrackingStatusText(
  status: TrackingStatusCode,
  queueLength: number,
  lastError?: string
) {
  if (status === 'starting') return 'Запускаем отслеживание...';
  if (status === 'stopping') return 'Останавливаем отслеживание...';
  if (status === 'uploading') return queueLength > 0 ? `Отправляем точки: ${queueLength}` : 'Отправляем координаты...';
  if (status === 'waitingNetwork') return 'Нет связи с сервером, точки сохраняются на устройстве';
  if (status === 'needsAuth') return 'Нужно заново войти в аккаунт, чтобы отправлять координаты';
  if (status === 'permissionDenied') return 'Нет разрешения на постоянную геолокацию';
  if (status === 'serviceDenied') return 'Нет доступа к сервису отслеживания';
  if (status === 'error') return lastError || 'Есть проблема с отслеживанием маршрута';
  if (status === 'tracking') return queueLength > 0 ? `Запись включена, в очереди ${queueLength}` : 'Запись координат включена';
  return 'Отслеживание выключено';
}

const locationOptions: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 15000,
  distanceInterval: 0, // форсим таймер даже без движения
  showsBackgroundLocationIndicator: false,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle: 'Отслеживание маршрута',
    notificationBody: 'Приложение собирает геоданные в фоне.',
  },
};

const foregroundLocationOptions: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 15000,
  distanceInterval: 0,
};

function mapLocationToPoint(loc: Location.LocationObject): TrackingPointInput {
  const recordedAt = new Date(loc.timestamp);
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    recordedAt: recordedAt.toISOString(),
    recordedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    recordedTimezoneOffsetMinutes: -recordedAt.getTimezoneOffset(),
    accuracy: loc.coords.accuracy ?? undefined,
    speed: loc.coords.speed ?? undefined,
    heading: loc.coords.heading ?? undefined,
    eventType: 'MOVE',
  };
}

async function enqueueLocations(locations: Location.LocationObject[], logPrefix: string) {
  if (!locations || locations.length === 0) return;
  const points: TrackingPointInput[] = locations.map(mapLocationToPoint);
  try {
    await enqueueTrackingPoints(points, logPrefix);
  } catch (e) {
    captureException(e, { where: 'TrackingContext:enqueueLocations', logPrefix });
    console.warn(`${logPrefix} enqueue/send failed`, e);
  }
}

function isTaskNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /TaskNotFoundException|Task .* not found|not found for app ID/i.test(message);
}

function isTaskStorageRepairableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /SharedPreferences|getAll\(\)|NullPointerException|startLocationUpdatesAsync/i.test(message);
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function unregisterBackgroundLocationTask(logPrefix: string) {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
    if (!registered) return;
    await TaskManager.unregisterTaskAsync(BACKGROUND_TASK_NAME);
  } catch (error) {
    if (!isTaskNotFoundError(error)) {
      console.warn(`${logPrefix} unregister location task failed`, error);
    }
  }
}

function markBackgroundTaskRepairCooldown(logPrefix: string, error: unknown) {
  backgroundTaskRetryAfter = Date.now() + BACKGROUND_TASK_REPAIR_COOLDOWN_MS;
  const now = Date.now();
  if (now - lastBackgroundTaskWarnAt > 30_000) {
    lastBackgroundTaskWarnAt = now;
    console.warn(`${logPrefix} background location task unavailable, foreground fallback is active`, error);
  }
}

function isBackgroundTaskInCooldown() {
  return Date.now() < backgroundTaskRetryAfter;
}

function backgroundCooldownMessage() {
  const seconds = Math.max(1, Math.ceil((backgroundTaskRetryAfter - Date.now()) / 1000));
  return `Фоновое отслеживание временно недоступно, повтор через ${seconds} сек. Пока приложение открыто, координаты продолжают сохраняться.`;
}

async function stopBackgroundLocationTaskIfRunning() {
  let hasStarted = false;
  try {
    hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  } catch (error) {
    if (!isTaskNotFoundError(error) && !isTaskStorageRepairableError(error)) {
      throw error;
    }
  }

  if (!hasStarted) return;

  try {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
  } catch (error) {
    if (!isTaskNotFoundError(error)) {
      throw error;
    }
  }
}

async function startBackgroundLocationTaskWithRepair(logPrefix: string) {
  if (isBackgroundTaskInCooldown()) {
    return false;
  }

  if (backgroundTaskStartPromise) {
    return backgroundTaskStartPromise;
  }

  backgroundTaskStartPromise = (async () => {
    try {
      await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, locationOptions);
      backgroundTaskRetryAfter = 0;
      return true;
    } catch (firstError) {
      if (!isTaskStorageRepairableError(firstError) && !isTaskNotFoundError(firstError)) {
        throw firstError;
      }

      addMonitoringBreadcrumb('tracking_task_repair', { logPrefix });
      console.warn(`${logPrefix} repairing background location task`, firstError);

      await stopBackgroundLocationTaskIfRunning().catch(() => undefined);
      await unregisterBackgroundLocationTask(logPrefix);
      await delay(250);

      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, locationOptions);
        backgroundTaskRetryAfter = 0;
        return true;
      } catch (secondError) {
        if (!isTaskStorageRepairableError(secondError) && !isTaskNotFoundError(secondError)) {
          throw secondError;
        }
        markBackgroundTaskRepairCooldown(logPrefix, secondError);
        return false;
      }
    }
  })().finally(() => {
    backgroundTaskStartPromise = null;
  });

  return backgroundTaskStartPromise;
}

TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
  if (error) {
    captureException(error, { where: 'TrackingContext:backgroundTask' });
    console.error('Location task error:', error);
    return;
  }

  const { locations } = data as Location.LocationTaskOptions & { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;
  await enqueueLocations(locations, '[tracking-bg]');
});

export const TrackingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [routeId, setRouteId] = useState<number | undefined>(undefined);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatusCode>('idle');
  const [queueLength, setQueueLength] = useState(0);
  const [lastUploadAt, setLastUploadAt] = useState<string | undefined>(undefined);
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const trackingTransitionRef = useRef<'starting' | 'stopping' | null>(null);
  const keepAliveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const foregroundSubscription = useRef<Location.LocationSubscription | null>(null);
  const nativeTrackingActiveRef = useRef(false);

  const stopForegroundWatch = useCallback(() => {
    if (foregroundSubscription.current) {
      foregroundSubscription.current.remove();
      foregroundSubscription.current = null;
    }
  }, []);

  const startForegroundWatch = useCallback(
    async (logPrefix: string) => {
      if (Platform.OS === 'web') return;
      if (nativeTrackingActiveRef.current) return;
      if (foregroundSubscription.current) return;
      if (isNativeTrackingAvailable()) {
        try {
          const nativeStatus = await getNativeTrackingStatus();
          if (nativeStatus.enabled && nativeStatus.running) {
            nativeTrackingActiveRef.current = true;
            stopForegroundWatch();
            return;
          }
        } catch {
          // If native status is unavailable, keep JS foreground tracking as a fallback.
        }
      }
      try {
        foregroundSubscription.current = await Location.watchPositionAsync(
          foregroundLocationOptions,
          (loc) => {
            if (nativeTrackingActiveRef.current) {
              stopForegroundWatch();
              return;
            }
            void enqueueLocations([loc], logPrefix);
          }
        );
      } catch (e) {
        console.warn(`${logPrefix} foreground watch failed`, e);
      }
    },
    [stopForegroundWatch]
  );

  const startNativeTrackingIfAvailable = useCallback(
    async (nextRouteId?: number, logPrefix = '[tracking-native]') => {
      if (!isNativeTrackingAvailable()) {
        nativeTrackingActiveRef.current = false;
        return false;
      }
      try {
        const devicePayload = await getAuthDevicePayload();
        const issued = await issueNativeTrackingToken(devicePayload);
        if (!issued.ok || !issued.data?.token) {
          console.warn(`${logPrefix} token issue failed`, issued.message || issued.status);
          nativeTrackingActiveRef.current = false;
          return false;
        }
        const status = await startNativeTracking({
          apiBaseUrl: API_BASE_URL,
          token: issued.data.token,
          routeId: nextRouteId,
          intervalMs: foregroundLocationOptions.timeInterval,
        });
        nativeTrackingActiveRef.current = status.available !== false && status.enabled !== false && status.running !== false;
        if (nativeTrackingActiveRef.current) {
          stopForegroundWatch();
        }
        addMonitoringBreadcrumb('tracking_native_started', { routeId: nextRouteId });
        return nativeTrackingActiveRef.current;
      } catch (error) {
        nativeTrackingActiveRef.current = false;
        captureException(error, { where: 'TrackingContext:startNativeTrackingIfAvailable' });
        console.warn(`${logPrefix} native tracking start failed`, error);
        return false;
      }
    },
    [stopForegroundWatch]
  );

  const stopNativeTrackingIfAvailable = useCallback(async (logPrefix = '[tracking-native]') => {
    nativeTrackingActiveRef.current = false;
    if (!isNativeTrackingAvailable()) return;
    try {
      await stopNativeTracking();
    } catch (error) {
      console.warn(`${logPrefix} native tracking stop failed`, error);
    }
    try {
      const devicePayload = await getAuthDevicePayload();
      await revokeNativeTrackingToken(devicePayload);
    } catch (error) {
      console.warn(`${logPrefix} native token revoke failed`, error);
    }
  }, []);

  const ensureNativeTrackingRunning = useCallback(
    async (logPrefix = '[tracking-native]') => {
      if (!isNativeTrackingAvailable()) {
        nativeTrackingActiveRef.current = false;
        return false;
      }
      try {
        const status = await getNativeTrackingStatus();
        if (status.enabled && status.running) {
          nativeTrackingActiveRef.current = true;
          stopForegroundWatch();
          return true;
        }
        nativeTrackingActiveRef.current = false;
        const storedRouteId = await getTrackingRouteId();
        return startNativeTrackingIfAvailable(storedRouteId, logPrefix);
      } catch (error) {
        nativeTrackingActiveRef.current = false;
        console.warn(`${logPrefix} native tracking status failed`, error);
        return false;
      }
    },
    [startNativeTrackingIfAvailable, stopForegroundWatch]
  );

  const syncRouteId = useCallback(async () => {
    const stored = await getTrackingRouteId();
    setRouteId(stored);
  }, []);

  const syncUploadDebug = useCallback(async () => {
    const debug = await getQueueDebug();
    let nativeQueueLength = 0;
    let nativeLastSentAt: string | undefined;
    let nativeRunning = false;
    let nativeLastError: string | undefined;
    try {
      const nativeStatus = await getNativeTrackingStatus();
      nativeQueueLength = Number(nativeStatus.queueLength || 0);
      nativeLastSentAt = nativeStatus.lastSentAt || undefined;
      nativeRunning = Boolean(nativeStatus.enabled && nativeStatus.running);
      nativeLastError = nativeStatus.lastError || undefined;
    } catch {
      // Native status is best-effort; JS queue remains the source for Expo fallback.
    }
    setQueueLength(debug.length + nativeQueueLength);
    setLastUploadAt(nativeLastSentAt || debug.lastSuccessfulFlushAt);
    return { ...debug, nativeRunning, nativeLastError };
  }, []);

  const refreshTrackingStatus = useCallback(async () => {
    const debug = await syncUploadDebug();

    if (trackingTransitionRef.current) {
      return;
    }

    if (!trackingEnabled) {
      setTrackingStatus('idle');
      setLastError(undefined);
      return;
    }

    try {
      const status = await getTrackingStatus();
      if (status.ok && status.data) {
        if (trackingEnabled && status.data.activeRoute?.id && debug.routeId !== status.data.activeRoute.id) {
          await setTrackingRouteId(status.data.activeRoute.id, '[tracking-status]');
          setRouteId(status.data.activeRoute.id);
        } else {
          await syncRouteId();
        }
        setLastError(undefined);
        if (!trackingEnabled) {
          setTrackingStatus('idle');
        } else if (debug.sending) {
          setTrackingStatus('uploading');
        } else if (debug.length > 0 || debug.pendingEndRoute) {
          setTrackingStatus('waitingNetwork');
        } else if (trackingEnabled && isBackgroundTaskInCooldown() && !debug.nativeRunning) {
          setTrackingStatus('error');
          setLastError(backgroundCooldownMessage());
        } else {
          setTrackingStatus('tracking');
        }
        return;
      }

      if (status.status === 401) {
        setTrackingStatus('needsAuth');
      } else if (status.status === 403) {
        setTrackingStatus('serviceDenied');
      } else if (status.status === 0) {
        setTrackingStatus('waitingNetwork');
      } else {
        setTrackingStatus('error');
      }
      setLastError(status.message || debug.lastError?.message);
    } catch (error: any) {
      setTrackingStatus('error');
      setLastError(error?.message || 'Не удалось получить статус отслеживания');
    }
  }, [syncRouteId, syncUploadDebug, trackingEnabled]);

  const flushAndSync = useCallback(
    async (logPrefix: string) => {
      await flushTrackingQueue(logPrefix);
      await syncUploadDebug();
      await syncRouteId();
    },
    [syncRouteId, syncUploadDebug]
  );

  const ensureBackgroundPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  }, []);

  const ensureNotificationPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    const apiLevel =
      typeof Platform.Version === 'number'
        ? Platform.Version
        : parseInt(String(Platform.Version), 10);
    if (!Number.isFinite(apiLevel) || apiLevel < 33) return true;

    const Notifications = await getNotificationsModule('[tracking-notify]');
    if (!Notifications) return true;
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  }, []);

  const hardDisableTracking = useCallback(
    async (logPrefix: string) => {
      addMonitoringBreadcrumb('tracking_hard_disable', { logPrefix });
      trackingTransitionRef.current = null;
      await stopNativeTrackingIfAvailable(logPrefix);
      await stopBackgroundLocationTaskIfRunning();
      stopForegroundWatch();
      setTrackingEnabled(false);
      setTrackingStatus('idle');
      setLastError(undefined);
      await AsyncStorage.removeItem(STORAGE_KEYS.enabled);
      await flushAndSync(logPrefix);
      await clearRouteIdIfIdle(logPrefix);
      await syncRouteId();
    },
    [flushAndSync, stopForegroundWatch, syncRouteId, stopNativeTrackingIfAvailable]
  );

  const ensureLocationTaskRunning = useCallback(
    async (logPrefix: string, force = false) => {
      if (backgroundTaskEnsurePromise) {
        return backgroundTaskEnsurePromise;
      }

      backgroundTaskEnsurePromise = (async () => {
      if (!trackingEnabled && !force) return false;
      if (isBackgroundTaskInCooldown()) {
        setTrackingStatus('error');
        setLastError(backgroundCooldownMessage());
        return false;
      }
      try {
        const notifOk = await ensureNotificationPermission();
        if (!notifOk) {
          await hardDisableTracking(logPrefix);
          return false;
        }
        const bgOk = await ensureBackgroundPermission();
        if (!bgOk) {
          await hardDisableTracking(logPrefix);
          return false;
        }
        let hasStarted = false;
        try {
          hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
        } catch (checkError) {
          if (!isTaskStorageRepairableError(checkError) && !isTaskNotFoundError(checkError)) {
            throw checkError;
          }
          addMonitoringBreadcrumb('tracking_task_check_repair', { logPrefix });
          console.warn(`${logPrefix} repairing location task after status check failure`, checkError);
          await unregisterBackgroundLocationTask(logPrefix);
          hasStarted = false;
        }
        if (!hasStarted) {
          addMonitoringBreadcrumb('tracking_task_restart', { logPrefix });
          console.log(`${logPrefix} restarting location updates`);
          const started = await startBackgroundLocationTaskWithRepair(logPrefix);
          if (!started) {
            setTrackingStatus('error');
            setLastError(backgroundCooldownMessage());
            return false;
          }
        }
        return true;
      } catch (e) {
        if (isTaskNotFoundError(e)) {
          stopForegroundWatch();
          setTrackingEnabled(false);
          await AsyncStorage.removeItem(STORAGE_KEYS.enabled);
          return false;
        }
        if (isTaskStorageRepairableError(e)) {
          markBackgroundTaskRepairCooldown(logPrefix, e);
          setTrackingStatus('error');
          setLastError(backgroundCooldownMessage());
          return false;
        }
        captureException(e, { where: 'TrackingContext:ensureLocationTaskRunning', logPrefix });
        console.warn(`${logPrefix} ensureLocationTaskRunning failed`, e);
        setTrackingStatus('error');
        setLastError(e instanceof Error ? e.message : String(e || 'Не удалось запустить фоновое отслеживание'));
        return false;
      }
      })().finally(() => {
        backgroundTaskEnsurePromise = null;
      });

      return backgroundTaskEnsurePromise;
    },
    [trackingEnabled, ensureBackgroundPermission, ensureNotificationPermission, hardDisableTracking, stopForegroundWatch]
  );

  useEffect(() => {
    (async () => {
      const [enabledRaw, storedRouteId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.enabled),
        getTrackingRouteId(),
      ]);
      if (enabledRaw === 'true') {
        trackingTransitionRef.current = 'starting';
        setTrackingEnabled(true);
        setTrackingStatus('starting');
        setLastError(undefined);
      }
      if (storedRouteId !== undefined) {
        setRouteId(storedRouteId);
      }

      if (enabledRaw === 'true') {
        const notifOk = await ensureNotificationPermission();
        if (!notifOk) {
          await hardDisableTracking('[tracking-auto]');
          return;
        }
        const bgOk = await ensureBackgroundPermission();
        if (!bgOk) {
          await hardDisableTracking('[tracking-auto]');
          return;
        }
        const backgroundStarted = await ensureLocationTaskRunning('[tracking-auto]', true);
        const nativeStarted = await startNativeTrackingIfAvailable(storedRouteId, '[tracking-auto]');
        if (AppState.currentState === 'active' && !nativeStarted) {
          await startForegroundWatch('[tracking-fg]');
        }
        // пробуем выгрузить очередь, если что-то накопилось, используя сериализованную отправку
        await flushAndSync('[tracking]');
        await syncUploadDebug();
        if (backgroundStarted || nativeStarted) {
          setTrackingStatus('tracking');
        }
        trackingTransitionRef.current = null;
      }
    })();
  }, [
    flushAndSync,
    syncUploadDebug,
    ensureLocationTaskRunning,
    startForegroundWatch,
    stopForegroundWatch,
    ensureBackgroundPermission,
    ensureNotificationPermission,
    hardDisableTracking,
    startNativeTrackingIfAvailable,
  ]);

  const startTracking = useCallback(async () => {
    addMonitoringBreadcrumb('tracking_start_requested');
    trackingTransitionRef.current = 'starting';
    setTrackingStatus('starting');
    setLastError(undefined);
    const notifOk = await ensureNotificationPermission();
    if (!notifOk) {
      setTrackingStatus('permissionDenied');
      await hardDisableTracking('[tracking-start]');
      throw new Error('Нужно разрешение на уведомления для фонового трекинга.');
    }

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== Location.PermissionStatus.GRANTED) {
      setTrackingStatus('permissionDenied');
      await hardDisableTracking('[tracking-start]');
      throw new Error('Разрешение на доступ к геолокации не выдано');
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== Location.PermissionStatus.GRANTED) {
      setTrackingStatus('permissionDenied');
      if (Platform.OS === 'android') {
        await hardDisableTracking('[tracking-start]');
        throw new Error('Нужно разрешение "Всегда". Включите его в настройках приложения.');
      } else {
        await hardDisableTracking('[tracking-start]');
        throw new Error('Разрешение на фоновую геолокацию не выдано');
      }
    }

    let startedRouteId: number | undefined;
    const session = await startTrackingSession();
    if (session.ok && session.route?.id) {
      startedRouteId = session.route.id;
      await setTrackingRouteId(session.route.id, '[tracking-start]');
      setRouteId(session.route.id);
    } else if (session.status === 401) {
      setTrackingStatus('needsAuth');
      setLastError(session.message);
      await hardDisableTracking('[tracking-start]');
      throw new Error(session.message || 'Нужно заново войти в аккаунт.');
    } else if (session.status === 403) {
      setTrackingStatus('serviceDenied');
      setLastError(session.message);
      await hardDisableTracking('[tracking-start]');
      throw new Error(session.message || 'Нет доступа к отслеживанию маршрута.');
    } else {
      setTrackingStatus('waitingNetwork');
      setLastError(session.message || 'Сервер недоступен, координаты будут сохранены на устройстве.');
    }

    setTrackingEnabled(true);
    await AsyncStorage.setItem(STORAGE_KEYS.enabled, 'true');

    let backgroundStarted = false;
    let nativeStarted = false;
    let backgroundStartError: string | undefined;
    try {
      backgroundStarted = await startBackgroundLocationTaskWithRepair('[tracking-start]');
    } catch (e) {
      if (isTaskStorageRepairableError(e)) {
        markBackgroundTaskRepairCooldown('[tracking-start]', e);
        backgroundStartError = backgroundCooldownMessage();
      } else {
        captureException(e, { where: 'TrackingContext:startTracking:startLocationUpdates' });
        console.error('[tracking] failed to start location updates (manual)', e);
        backgroundStartError = e instanceof Error ? e.message : String(e || 'Не удалось запустить фоновое отслеживание');
      }
      setTrackingStatus('error');
      setLastError(backgroundStartError);
    }
    nativeStarted = await startNativeTrackingIfAvailable(startedRouteId, '[tracking-start]');

    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await enqueueLocations([current], '[tracking-start]');
    } catch (e) {
      console.warn('[tracking-start] initial location fetch failed', e);
    }

    // сразу пробуем отправить накопившуюся очередь
    await flushAndSync('[tracking]');
    if (!backgroundStarted) {
      backgroundStarted = await ensureLocationTaskRunning('[tracking-start]', true);
    }
    if (nativeStarted) {
      stopForegroundWatch();
    } else {
      await startForegroundWatch('[tracking-start]');
    }
    await refreshTrackingStatus();
    if (backgroundStarted || nativeStarted) {
      setTrackingStatus('tracking');
    } else {
      setTrackingStatus('error');
      setLastError(backgroundStartError || 'Фоновое отслеживание пока не запустилось, приложение повторит попытку автоматически.');
    }
    trackingTransitionRef.current = null;
    addMonitoringBreadcrumb('tracking_start_done');
  }, [ensureNotificationPermission, flushAndSync, ensureLocationTaskRunning, startForegroundWatch, stopForegroundWatch, hardDisableTracking, refreshTrackingStatus, startNativeTrackingIfAvailable]);

  // Дополнительный триггер флеша при смене состояния приложения (активно/фон)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') {
        flushAndSync('[tracking-appstate]');
        void ensureLocationTaskRunning('[tracking-appstate]');
        void ensureNativeTrackingRunning('[tracking-appstate]');
      }
      if (state === 'active') {
        if (trackingEnabled) {
          void (async () => {
            const notifOk = await ensureNotificationPermission();
            if (!notifOk) {
              await hardDisableTracking('[tracking-appstate]');
              return;
            }
            const bgOk = await ensureBackgroundPermission();
            if (!bgOk) {
              await hardDisableTracking('[tracking-appstate]');
              return;
            }
            const nativeOk = await ensureNativeTrackingRunning('[tracking-appstate]');
            if (nativeOk) {
              stopForegroundWatch();
              return;
            }
            await startForegroundWatch('[tracking-fg]');
          })();
        }
      } else {
        stopForegroundWatch();
      }
    });
    return () => sub.remove();
  }, [
    flushAndSync,
    ensureLocationTaskRunning,
    ensureNativeTrackingRunning,
    startForegroundWatch,
    stopForegroundWatch,
    trackingEnabled,
    ensureBackgroundPermission,
    ensureNotificationPermission,
    hardDisableTracking,
  ]);

  // Периодический keep-alive для фонового таска
  useEffect(() => {
    if (!trackingEnabled) {
      if (keepAliveTimer.current) {
        clearInterval(keepAliveTimer.current);
        keepAliveTimer.current = null;
      }
      return;
    }
    keepAliveTimer.current = setInterval(() => {
      void ensureLocationTaskRunning('[tracking-keepalive]');
      void ensureNativeTrackingRunning('[tracking-keepalive]');
    }, 60_000);
    return () => {
      if (keepAliveTimer.current) {
        clearInterval(keepAliveTimer.current);
        keepAliveTimer.current = null;
      }
    };
  }, [trackingEnabled, ensureLocationTaskRunning, ensureNativeTrackingRunning]);

  useEffect(() => {
    void refreshTrackingStatus();
    const timer = setInterval(() => {
      void refreshTrackingStatus();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refreshTrackingStatus]);

  const stopTracking = useCallback(async () => {
    addMonitoringBreadcrumb('tracking_stop_requested');
    trackingTransitionRef.current = 'stopping';
    setTrackingStatus('stopping');
    setLastError(undefined);
    const stoppingRouteId = routeId ?? (await getTrackingRouteId());
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await enqueueTrackingPoints([{ ...mapLocationToPoint(current), eventType: 'STOP' }], '[tracking-stop]');
    } catch (e) {
      console.warn('[tracking-stop] final location fetch failed', e);
    }
    await stopNativeTrackingIfAvailable('[tracking-stop]');
    await markTrackingRouteEnding('[tracking-stop]');
    await stopBackgroundLocationTaskIfRunning();
    stopForegroundWatch();
    setTrackingEnabled(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.enabled);
    await flushAndSync('[tracking-stop]');
    const stopped = await stopTrackingSession(stoppingRouteId);
    if (stopped.ok) {
      setLastError(undefined);
    } else if (stopped.status === 401) {
      setTrackingStatus('needsAuth');
      setLastError(stopped.message);
    } else if (stopped.status === 403) {
      setTrackingStatus('serviceDenied');
      setLastError(stopped.message);
    } else if (stopped.status === 0) {
      setTrackingStatus('waitingNetwork');
      setLastError(stopped.message || 'Сервер недоступен, остановка будет синхронизирована позже.');
    } else {
      setTrackingStatus('error');
      setLastError(stopped.message || 'Не удалось остановить серверную сессию отслеживания.');
    }
    await clearRouteIdIfIdle('[tracking-stop]');
    await syncRouteId();
    await syncUploadDebug();
    setTrackingEnabled(false);
    setTrackingStatus('idle');
    setLastError(undefined);
    trackingTransitionRef.current = null;
    addMonitoringBreadcrumb('tracking_stop_done');
  }, [flushAndSync, routeId, syncRouteId, syncUploadDebug, stopForegroundWatch, stopNativeTrackingIfAvailable]);

  // Диагностика очереди при фокусе
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void (async () => {
          await getQueueDebug();
          // оставляем возможность быстро проверить очередь в отладке
          // console.log('[tracking-debug] queue', dbg);
        })();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <TrackingContext.Provider
      value={{
        trackingEnabled,
        routeId,
        trackingStatus,
        trackingStatusText: getTrackingStatusText(trackingStatus, queueLength, lastError),
        queueLength,
        lastUploadAt,
        lastError,
        refreshTrackingStatus,
        startTracking,
        stopTracking,
      }}
    >
      {children}
    </TrackingContext.Provider>
  );
};

export function useTracking(): TrackingContextValue {
  const ctx = useContext(TrackingContext);
  if (!ctx) {
    throw new Error('useTracking must be used within TrackingProvider');
  }
  return ctx;
}














