import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

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
  distanceInterval: 0, // С„РѕСЂСЃРёРј С‚Р°Р№РјРµСЂ РґР°Р¶Рµ Р±РµР· РґРІРёР¶РµРЅРёСЏ
  showsBackgroundLocationIndicator: false,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle: 'РћС‚СЃР»РµР¶РёРІР°РЅРёРµ РјР°СЂС€СЂСѓС‚Р°',
    notificationBody: 'РџСЂРёР»РѕР¶РµРЅРёРµ СЃРѕР±РёСЂР°РµС‚ РіРµРѕРґР°РЅРЅС‹Рµ РІ С„РѕРЅРµ.',
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
  const keepAliveTimer = useRef<NodeJS.Timeout | null>(null);
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
    [trackingEnabled, ensureBackgroundPermission, hardDisableTracking]
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
        const bgOk = await ensureBackgroundPermission();
        if (!bgOk) {
          await hardDisableTracking('[tracking-auto]');
          return;
        }
        await ensureLocationTaskRunning('[tracking-auto]');
        if (AppState.currentState === 'active') {
          await startForegroundWatch('[tracking-fg]');
        }
        // РїСЂРѕР±СѓРµРј РІС‹РіСЂСѓР·РёС‚СЊ РѕС‡РµСЂРµРґСЊ, РµСЃР»Рё С‡С‚Рѕ-С‚Рѕ РЅР°РєРѕРїРёР»РѕСЃСЊ, РёСЃРїРѕР»СЊР·СѓСЏ СЃРµСЂРёР°Р»РёР·РѕРІР°РЅРЅСѓСЋ РѕС‚РїСЂР°РІРєСѓ
        await flushAndSync('[tracking]');
      }
    })();
  }, [
    flushAndSync,
    ensureLocationTaskRunning,
    startForegroundWatch,
    ensureBackgroundPermission,
    hardDisableTracking,
  ]);

  const startTracking = useCallback(async () => {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== Location.PermissionStatus.GRANTED) {
      await hardDisableTracking('[tracking-start]');
      throw new Error('Р Р°Р·СЂРµС€РµРЅРёРµ РЅР° РґРѕСЃС‚СѓРї Рє РіРµРѕР»РѕРєР°С†РёРё РЅРµ РІС‹РґР°РЅРѕ');
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== Location.PermissionStatus.GRANTED) {
      if (Platform.OS === 'android') {
        await hardDisableTracking('[tracking-start]');
        throw new Error('Нужно разрешение "Всегда". Включите его в настройках приложения.');
      } else {
        await hardDisableTracking('[tracking-start]');
        throw new Error('Р Р°Р·СЂРµС€РµРЅРёРµ РЅР° С„РѕРЅРѕРІСѓСЋ РіРµРѕР»РѕРєР°С†РёСЋ РЅРµ РІС‹РґР°РЅРѕ');
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
    // СЃСЂР°Р·Сѓ РїСЂРѕР±СѓРµРј РѕС‚РїСЂР°РІРёС‚СЊ РЅР°РєРѕРїРёРІС€СѓСЋСЃСЏ РѕС‡РµСЂРµРґСЊ
    await flushAndSync('[tracking]');
    await ensureLocationTaskRunning('[tracking-start]');
    await startForegroundWatch('[tracking-start]');
  }, [flushAndSync, ensureLocationTaskRunning, startForegroundWatch, hardDisableTracking]);

  // Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Р№ С‚СЂРёРіРіРµСЂ С„Р»СѓС€Р° РїСЂРё СЃРјРµРЅРµ СЃРѕСЃС‚РѕСЏРЅРёСЏ РїСЂРёР»РѕР¶РµРЅРёСЏ (Р°РєС‚РёРІРЅРѕ/С„РѕРЅ)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') {
        flushAndSync('[tracking-appstate]');
        void ensureLocationTaskRunning('[tracking-appstate]');
      }
      if (state === 'active') {
        if (trackingEnabled) {
          void (async () => {
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
    hardDisableTracking,
  ]);

  // РџРµСЂРµРѕРґРёС‡РµСЃРєРёР№ keep-alive РґР»СЏ С„РѕРЅРѕРІРѕРіРѕ С‚Р°СЃРєР°
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

  // Р”РёР°РіРЅРѕСЃС‚РёРєР° РѕС‡РµСЂРµРґРё РїСЂРё С„РѕРєСѓСЃРµ
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void (async () => {
          const dbg = await getQueueDebug();
          // РѕСЃС‚Р°РІР»СЏРµРј РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ Р±С‹СЃС‚СЂРѕ РїСЂРѕРІРµСЂРёС‚СЊ РѕС‡РµСЂРµРґСЊ РІ РѕС‚Р»Р°РґРєРµ
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

