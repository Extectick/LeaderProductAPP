import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';

import { TrackingPointInput } from '@/utils/trackingApi';
import {
  clearRouteIdIfIdle,
  enqueueTrackingPoints,
  flushTrackingQueue,
  getQueueDebug,
  getTrackingRouteId,
} from '@/utils/trackingUploader';

const BACKGROUND_TASK_NAME = 'BACKGROUND_LOCATION_TRACKING';
const STORAGE_KEYS = {
  enabled: 'tracking:enabled',
};

let notificationsModule: typeof import('expo-notifications') | null = null;

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
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
};

const TrackingContext = createContext<TrackingContextValue | undefined>(undefined);

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
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    recordedAt: new Date(loc.timestamp).toISOString(),
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
    console.warn(`${logPrefix} enqueue/send failed`, e);
  }
}

TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
  if (error) {
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
  const keepAliveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const foregroundSubscription = useRef<Location.LocationSubscription | null>(null);

  const stopForegroundWatch = useCallback(() => {
    if (foregroundSubscription.current) {
      foregroundSubscription.current.remove();
      foregroundSubscription.current = null;
    }
  }, []);

  const startForegroundWatch = useCallback(
    async (logPrefix: string) => {
      if (Platform.OS === 'web') return;
      if (foregroundSubscription.current) return;
      try {
        foregroundSubscription.current = await Location.watchPositionAsync(
          foregroundLocationOptions,
          (loc) => {
            void enqueueLocations([loc], logPrefix);
          }
        );
      } catch (e) {
        console.warn(`${logPrefix} foreground watch failed`, e);
      }
    },
    []
  );

  const syncRouteId = useCallback(async () => {
    const stored = await getTrackingRouteId();
    setRouteId(stored);
  }, []);

  const flushAndSync = useCallback(
    async (logPrefix: string) => {
      await flushTrackingQueue(logPrefix);
      await syncRouteId();
    },
    [syncRouteId]
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
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
      }
      stopForegroundWatch();
      setTrackingEnabled(false);
      await AsyncStorage.removeItem(STORAGE_KEYS.enabled);
      await flushAndSync(logPrefix);
      await clearRouteIdIfIdle(logPrefix);
      await syncRouteId();
    },
    [flushAndSync, stopForegroundWatch, syncRouteId]
  );

  const ensureLocationTaskRunning = useCallback(
    async (logPrefix: string) => {
      if (!trackingEnabled) return;
      try {
        const notifOk = await ensureNotificationPermission();
        if (!notifOk) {
          await hardDisableTracking(logPrefix);
          return;
        }
        const bgOk = await ensureBackgroundPermission();
        if (!bgOk) {
          await hardDisableTracking(logPrefix);
          return;
        }
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
        if (!hasStarted) {
          console.log(`${logPrefix} restarting location updates`);
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, locationOptions);
        }
      } catch (e) {
        console.warn(`${logPrefix} ensureLocationTaskRunning failed`, e);
      }
    },
    [trackingEnabled, ensureBackgroundPermission, ensureNotificationPermission, hardDisableTracking]
  );

  useEffect(() => {
    (async () => {
      const [enabledRaw, storedRouteId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.enabled),
        getTrackingRouteId(),
      ]);
      if (enabledRaw === 'true') {
        setTrackingEnabled(true);
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
        await ensureLocationTaskRunning('[tracking-auto]');
        if (AppState.currentState === 'active') {
          await startForegroundWatch('[tracking-fg]');
        }
        // пробуем выгрузить очередь, если что-то накопилось, используя сериализованную отправку
        await flushAndSync('[tracking]');
      }
    })();
  }, [
    flushAndSync,
    ensureLocationTaskRunning,
    startForegroundWatch,
    ensureBackgroundPermission,
    ensureNotificationPermission,
    hardDisableTracking,
  ]);

  const startTracking = useCallback(async () => {
    const notifOk = await ensureNotificationPermission();
    if (!notifOk) {
      await hardDisableTracking('[tracking-start]');
      throw new Error('Нужно разрешение на уведомления для фонового трекинга.');
    }

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== Location.PermissionStatus.GRANTED) {
      await hardDisableTracking('[tracking-start]');
      throw new Error('Разрешение на доступ к геолокации не выдано');
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== Location.PermissionStatus.GRANTED) {
      if (Platform.OS === 'android') {
        await hardDisableTracking('[tracking-start]');
        throw new Error('Нужно разрешение "Всегда". Включите его в настройках приложения.');
      } else {
        await hardDisableTracking('[tracking-start]');
        throw new Error('Разрешение на фоновую геолокацию не выдано');
      }
    }

    try {
      await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, locationOptions);
    } catch (e) {
      console.error('[tracking] failed to start location updates (manual)', e);
      await hardDisableTracking('[tracking-start]');
      throw e;
    }

    setTrackingEnabled(true);
    await AsyncStorage.setItem(STORAGE_KEYS.enabled, 'true');

    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await enqueueLocations([current], '[tracking-start]');
    } catch (e) {
      console.warn('[tracking-start] initial location fetch failed', e);
    }

    // сразу пробуем отправить накопившуюся очередь
    await flushAndSync('[tracking]');
    await ensureLocationTaskRunning('[tracking-start]');
    await startForegroundWatch('[tracking-start]');
  }, [ensureNotificationPermission, flushAndSync, ensureLocationTaskRunning, startForegroundWatch, hardDisableTracking]);

  // Дополнительный триггер флеша при смене состояния приложения (активно/фон)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') {
        flushAndSync('[tracking-appstate]');
        void ensureLocationTaskRunning('[tracking-appstate]');
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
    }, 60_000);
    return () => {
      if (keepAliveTimer.current) {
        clearInterval(keepAliveTimer.current);
        keepAliveTimer.current = null;
      }
    };
  }, [trackingEnabled, ensureLocationTaskRunning]);

  const stopTracking = useCallback(async () => {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    }
    stopForegroundWatch();
    setTrackingEnabled(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.enabled);
    await flushAndSync('[tracking-stop]');
    await clearRouteIdIfIdle('[tracking-stop]');
    await syncRouteId();
  }, [flushAndSync, syncRouteId, stopForegroundWatch]);

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














