import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { sendTrackingPoints, TrackingPointInput } from '../utils/trackingApi';

const BACKGROUND_TASK_NAME = 'BACKGROUND_LOCATION_TRACKING';
const STORAGE_KEYS = {
  enabled: 'tracking:enabled',
  routeId: 'tracking:routeId',
};

type TrackingContextValue = {
  trackingEnabled: boolean;
  routeId?: number;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
};

const TrackingContext = createContext<TrackingContextValue | undefined>(undefined);

TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Location task error:', error);
    return;
  }

  const { locations } = data as Location.LocationTaskOptions & { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const token = await AsyncStorage.getItem('accessToken');
  if (!token) {
    console.warn('Skip sending tracking points: no access token');
    return;
  }

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
    // Простая отправка без буфера: один батч, старт/продолжение маршрута на сервере
    await sendTrackingPoints({
      startNewRoute: true,
      points,
    });
  } catch (e) {
    console.error('Failed to send tracking points from background:', e);
  }
});

export const TrackingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [routeId, setRouteId] = useState<number | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const [enabledRaw, routeIdRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.enabled),
        AsyncStorage.getItem(STORAGE_KEYS.routeId),
      ]);
      if (enabledRaw === 'true') {
        setTrackingEnabled(true);
      }
      if (routeIdRaw) {
        const parsed = Number(routeIdRaw);
        if (!Number.isNaN(parsed)) setRouteId(parsed);
      }

      if (enabledRaw === 'true') {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
            accuracy: Location.Accuracy.High,
            timeInterval: 30000,
            distanceInterval: 20,
            showsBackgroundLocationIndicator: false,
            pausesUpdatesAutomatically: false,
          });
        }
      }
    })();
  }, []);

  const startTracking = useCallback(async () => {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== Location.PermissionStatus.GRANTED) {
      throw new Error('Разрешение на доступ к геолокации не выдано');
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== Location.PermissionStatus.GRANTED) {
      throw new Error('Разрешение на фоновую геолокацию не выдано');
    }

    await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 30000,
      distanceInterval: 20,
      showsBackgroundLocationIndicator: false,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Отслеживание маршрута',
        notificationBody: 'Приложение собирает геоданные в фоне.',
      },
    });

    setTrackingEnabled(true);
    await AsyncStorage.setItem(STORAGE_KEYS.enabled, 'true');
  }, []);

  const stopTracking = useCallback(async () => {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
    }
    setTrackingEnabled(false);
    setRouteId(undefined);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.enabled),
      AsyncStorage.removeItem(STORAGE_KEYS.routeId),
    ]);
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
