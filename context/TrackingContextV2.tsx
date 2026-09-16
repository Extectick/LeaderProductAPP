import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { AuthContext } from './AuthContext';
import {
  getTrackingV2Diagnostics,
  restoreTrackingV2,
  startTrackingV2,
  stopTrackingV2,
  type TrackingV2Diagnostics,
} from '@/utils/trackingV2Service';

type TrackingMode = 'native' | 'fallback' | 'inactive';
type TrackingStatusCode =
  | 'idle'
  | 'tracking'
  | 'uploading'
  | 'waitingNetwork'
  | 'needsTrackingAuth'
  | 'needsAuth'
  | 'permissionDenied'
  | 'serviceDenied'
  | 'starting'
  | 'stopping'
  | 'error';

type NativeTrackingDiagnostics = {
  mode: TrackingMode;
  lastRecordedAt?: string;
  lastSentAt?: string;
  nextRetryAt?: number;
  retryAttempt: number;
  discardedPoints: number;
  secureStorage?: boolean;
  tokenInvalid?: boolean;
};

type TrackingContextValue = {
  trackingEnabled: boolean;
  routeId?: number;
  trackingStatus: TrackingStatusCode;
  trackingStatusText: string;
  queueLength: number | null;
  lastUploadAt?: string;
  lastError?: string;
  trackingMode: TrackingMode;
  nativeDiagnostics: NativeTrackingDiagnostics;
  reliability: TrackingV2Diagnostics;
  refreshTrackingStatus: () => Promise<void>;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
};

const emptyDiagnostics: TrackingV2Diagnostics = {
  available: false,
  enabled: false,
  running: false,
  permission: 'undetermined',
  backgroundPermission: 'undetermined',
  activityRecognitionPermission: 'unavailable',
  locationServicesEnabled: false,
};

const TrackingContext = createContext<TrackingContextValue | undefined>(undefined);

function statusFromDiagnostics(diagnostics: TrackingV2Diagnostics): TrackingStatusCode {
  if (!diagnostics.enabled) return 'idle';
  if (diagnostics.commandError === 'DEVICE_AUTH_REQUIRED') return 'needsTrackingAuth';
  if (
    diagnostics.permission === 'denied'
    || diagnostics.backgroundPermission === 'denied'
    || diagnostics.activityRecognitionPermission === 'denied'
  ) return 'permissionDenied';
  if (!diagnostics.locationServicesEnabled) return 'serviceDenied';
  if (diagnostics.lastError && !diagnostics.running) return 'error';
  if (diagnostics.commandError === 'COMMAND_CHANNEL_UNAVAILABLE') return 'waitingNetwork';
  if (diagnostics.enabled && diagnostics.running) return 'tracking';
  if (diagnostics.enabled && !diagnostics.running) return 'serviceDenied';
  return 'idle';
}

function statusText(status: TrackingStatusCode, diagnostics: TrackingV2Diagnostics) {
  if (status === 'starting') return 'Запускаем надёжное фоновое отслеживание…';
  if (status === 'stopping') return 'Останавливаем отслеживание…';
  if (status === 'idle') return 'Отслеживание приостановлено';
  if (status === 'needsTrackingAuth') return 'Ключ устройства отклонён — восстановите отслеживание при наличии интернета';
  if (status === 'waitingNetwork') return 'Нет связи с API. Собранные точки остаются в очереди на телефоне';
  if (status === 'permissionDenied') {
    if (diagnostics.activityRecognitionPermission === 'denied') {
      return 'Разрешите физическую активность, чтобы GPS возобновлялся после остановки';
    }
    return 'Разрешите геопозицию всегда в настройках Android';
  }
  if (!diagnostics.locationServicesEnabled) return 'Геолокация телефона выключена';
  if (status === 'serviceDenied') return 'Фоновый сервис не запущен — восстановите отслеживание';
  if (status === 'error') return diagnostics.lastError || 'Не удалось запустить геотрекинг';
  if (status === 'tracking') return 'Геомаршрут записывается в фоне';
  return 'Отслеживание приостановлено';
}

export const TrackingProvider = ({ children }: { children: React.ReactNode }) => {
  const auth = useContext(AuthContext);
  const [diagnostics, setDiagnostics] = useState(emptyDiagnostics);
  const [transientStatus, setTransientStatus] = useState<TrackingStatusCode | null>(null);

  const refreshTrackingStatus = useCallback(async () => {
    const next = await getTrackingV2Diagnostics();
    setDiagnostics(next);
  }, []);

  const startTracking = useCallback(async () => {
    setTransientStatus('starting');
    try {
      await startTrackingV2();
    } finally {
      await refreshTrackingStatus();
      setTransientStatus(null);
    }
  }, [refreshTrackingStatus]);

  const stopTracking = useCallback(async () => {
    setTransientStatus('stopping');
    try {
      await stopTrackingV2();
    } finally {
      await refreshTrackingStatus();
      setTransientStatus(null);
    }
  }, [refreshTrackingStatus]);

  useEffect(() => {
    if (!auth?.isAuthenticated || !auth.profile) { setDiagnostics(emptyDiagnostics); return; }
    let cancelled = false;
    let repairing = false;
    const repair = async () => {
      if (cancelled || repairing || (AppState.currentState && AppState.currentState !== 'active')) return;
      repairing = true;
      try { await restoreTrackingV2(); }
      catch { /* Offline/revoked key: diagnostics explains the next user action. */ }
      finally {
        try {
          const next = await getTrackingV2Diagnostics();
          if (!cancelled) setDiagnostics(next);
        } catch { /* A native bridge failure must not become an unhandled rejection. */ }
        repairing = false;
      }
    };
    void repair();
    const timer = setInterval(() => { void repair(); }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void repair();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [auth?.isAuthenticated, auth?.profile?.id]);

  const trackingStatus = transientStatus || statusFromDiagnostics(diagnostics);
  const nativeDiagnostics = useMemo<NativeTrackingDiagnostics>(() => ({
    mode: diagnostics.available ? 'native' : 'inactive',
    lastRecordedAt: diagnostics.lastRecordedAt,
    lastSentAt: diagnostics.lastSentAt,
    nextRetryAt: diagnostics.nextRetryAt,
    retryAttempt: 0,
    discardedPoints: 0,
    secureStorage: true,
    tokenInvalid: diagnostics.commandError === 'DEVICE_AUTH_REQUIRED',
  }), [diagnostics]);

  const value = useMemo<TrackingContextValue>(() => ({
    trackingEnabled: diagnostics.enabled,
    trackingStatus,
    trackingStatusText: statusText(trackingStatus, diagnostics),
    // Traccar keeps its durable queue inside the native SDK and does not
    // expose its size through the React Native bridge. Null avoids reporting
    // the misleading "queue is empty" state.
    queueLength: null,
    lastUploadAt: diagnostics.lastSentAt,
    lastError: diagnostics.lastError,
    trackingMode: diagnostics.available ? 'native' : 'inactive',
    nativeDiagnostics,
    reliability: diagnostics,
    refreshTrackingStatus,
    startTracking,
    stopTracking,
  }), [diagnostics, nativeDiagnostics, refreshTrackingStatus, startTracking, stopTracking, trackingStatus]);

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
};

export function useTracking() {
  const context = useContext(TrackingContext);
  if (!context) throw new Error('useTracking must be used inside TrackingProvider');
  return context;
}
