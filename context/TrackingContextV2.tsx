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
  queueLength: number;
  lastUploadAt?: string;
  lastError?: string;
  trackingMode: TrackingMode;
  nativeDiagnostics: NativeTrackingDiagnostics;
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
  locationServicesEnabled: false,
};

const TrackingContext = createContext<TrackingContextValue | undefined>(undefined);

function statusFromDiagnostics(diagnostics: TrackingV2Diagnostics): TrackingStatusCode {
  if (diagnostics.lastError && diagnostics.enabled && !diagnostics.running) return 'error';
  if (diagnostics.permission === 'denied' || diagnostics.backgroundPermission === 'denied') return 'permissionDenied';
  if (diagnostics.enabled && diagnostics.running) return 'tracking';
  return 'idle';
}

function statusText(status: TrackingStatusCode, diagnostics: TrackingV2Diagnostics) {
  if (status === 'starting') return 'Запускаем надёжное фоновое отслеживание…';
  if (status === 'stopping') return 'Останавливаем отслеживание…';
  if (status === 'permissionDenied') return 'Разрешите геопозицию всегда в настройках Android';
  if (!diagnostics.locationServicesEnabled) return 'Геолокация телефона выключена';
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
    if (!auth?.isAuthenticated || !auth.profile) return;
    let cancelled = false;
    void restoreTrackingV2()
      .catch(() => false)
      .finally(() => { if (!cancelled) void refreshTrackingStatus(); });
    const timer = setInterval(() => { if (!cancelled) void refreshTrackingStatus(); }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled) void refreshTrackingStatus();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [auth?.isAuthenticated, auth?.profile, refreshTrackingStatus]);

  const trackingStatus = transientStatus || statusFromDiagnostics(diagnostics);
  const nativeDiagnostics = useMemo<NativeTrackingDiagnostics>(() => ({
    mode: diagnostics.available ? 'native' : 'inactive',
    lastRecordedAt: diagnostics.lastRecordedAt,
    lastSentAt: diagnostics.lastSentAt,
    retryAttempt: 0,
    discardedPoints: 0,
    secureStorage: true,
    tokenInvalid: false,
  }), [diagnostics]);

  const value = useMemo<TrackingContextValue>(() => ({
    trackingEnabled: diagnostics.enabled,
    trackingStatus,
    trackingStatusText: statusText(trackingStatus, diagnostics),
    queueLength: 0,
    lastUploadAt: diagnostics.lastSentAt,
    lastError: diagnostics.lastError,
    trackingMode: diagnostics.available ? 'native' : 'inactive',
    nativeDiagnostics,
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
