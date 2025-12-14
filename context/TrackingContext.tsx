import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

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

TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Location task error:', error);
    return;
  }

  const { locations } = data as Location.LocationTaskOptions & { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const points: TrackingPointInput[] = locations.map((loc) => ({
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    recordedAt: new Date(loc.timestamp).toISOString(),
    accuracy: loc.coords.accuracy ?? undefined,
    speed: loc.coords.speed ?? undefined,
    heading: loc.coords.heading ?? undefined,
    eventType: 'MOVE',
  }));

  try {
    // Добавляем точки в очередь и ждём завершения отправки, чтобы не зависать без логов
    await enqueueTrackingPoints(points, '[tracking-bg]');
  } catch (e) {
    console.warn('[tracking-bg] enqueue/send failed', e);
  }
});

export const TrackingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [routeId, setRouteId] = useState<number | undefined>(undefined);
  const keepAliveTimer = useRef<NodeJS.Timeout | null>(null);

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

  const ensureLocationTaskRunning = useCallback(
    async (logPrefix: string) => {
      if (!trackingEnabled) return;
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
        if (!hasStarted) {
          console.log(`${logPrefix} restarting location updates`);
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, locationOptions);
        }
      } catch (e) {
        console.warn(`${logPrefix} ensureLocationTaskRunning failed`, e);
      }
    },
    [trackingEnabled]
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
        await ensureLocationTaskRunning('[tracking-auto]');
        // пробуем выгрузить очередь, если что-то накопилось, используя сериализованную отправку
        await flushAndSync('[tracking]');
      }
    })();
  }, [flushAndSync, ensureLocationTaskRunning]);

  const startTracking = useCallback(async () => {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== Location.PermissionStatus.GRANTED) {
      throw new Error('Разрешение на доступ к геолокации не выдано');
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== Location.PermissionStatus.GRANTED) {
      throw new Error('Разрешение на фоновую геолокацию не выдано');
    }

    try {
      await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, locationOptions);
    } catch (e) {
      console.error('[tracking] failed to start location updates (manual)', e);
      throw e;
    }

    setTrackingEnabled(true);
    await AsyncStorage.setItem(STORAGE_KEYS.enabled, 'true');
    // сразу пробуем отправить накопившуюся очередь
    await flushAndSync('[tracking]');
    await ensureLocationTaskRunning('[tracking-start]');
  }, [flushAndSync, ensureLocationTaskRunning]);

  // Дополнительный триггер флуша при смене состояния приложения (активно/фон)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') {
        flushAndSync('[tracking-appstate]');
        void ensureLocationTaskRunning('[tracking-appstate]');
      }
    });
    return () => sub.remove();
  }, [flushAndSync, ensureLocationTaskRunning]);

  // Переодический keep-alive для фонового таска
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
    setTrackingEnabled(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.enabled);
    await flushAndSync('[tracking-stop]');
    await clearRouteIdIfIdle('[tracking-stop]');
    await syncRouteId();
  }, [flushAndSync, syncRouteId]);

  // Диагностика очереди при фокусе
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void (async () => {
          const dbg = await getQueueDebug();
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
