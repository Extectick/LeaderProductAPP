import React from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { getInstallId, logUpdateEvent } from '@/utils/updateService';

const RESUME_BACKGROUND_MIN_MS = 60_000;
const RESUME_CHECK_INTERVAL_MS = 5 * 60_000;
const ACTIVE_CHECK_INTERVAL_MS = 60_000;
const INITIAL_ACTIVE_CHECK_DELAY_MS = 2_000;
const OTA_CHECK_TIMEOUT_MS = 15_000;
const OTA_FETCH_TIMEOUT_MS = 90_000;
const OTA_ERROR_BACKOFF_BASE_MS = 2 * 60_000;
const OTA_ERROR_BACKOFF_MAX_MS = 15 * 60_000;

export type OtaUpdatePhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'restarting'
  | 'error'
  | 'disabled';

export type OtaUpdateStatus = {
  phase: OtaUpdatePhase;
  progress: number | null;
  errorMessage: string | null;
  lastCheckedAt: number | null;
  targetVersionLabel: string | null;
  targetUpdateId: string | null;
  failureCount: number;
  readyToReload: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  isRestarting: boolean;
};

type OtaUpdateStatusContextValue = OtaUpdateStatus & {
  requestCheck: (source?: string) => Promise<boolean>;
  reloadUpdate: () => Promise<void>;
};

const noopAsync = async () => false;
const noopReload = async () => undefined;

const initialStatus: OtaUpdateStatus = {
  phase: Platform.OS === 'web' ? 'disabled' : 'idle',
  progress: null,
  errorMessage: null,
  lastCheckedAt: null,
  targetVersionLabel: null,
  targetUpdateId: null,
  failureCount: 0,
  readyToReload: false,
  isChecking: false,
  isDownloading: false,
  isRestarting: false,
};

const OtaUpdateStatusContext = React.createContext<OtaUpdateStatusContextValue>({
  ...initialStatus,
  requestCheck: noopAsync,
  reloadUpdate: noopReload,
});

function clampProgress(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function isExpectedUpdatesDisabledError(error: unknown) {
  const code = (error as any)?.code;
  const message = String((error as any)?.message || '').toLowerCase();
  return (
    code === 'ERR_UPDATES_DISABLED' ||
    message.includes('development mode') ||
    message.includes('development builds') ||
    message.includes('not supported in development')
  );
}

function hasPendingUpdate(state: ReturnType<typeof Updates.useUpdates>) {
  return Boolean(state.isUpdatePending);
}

function readUpdateId(source: unknown): string | null {
  const updateId = String((source as any)?.updateId || '').trim();
  return updateId || null;
}

function readUpdateLabel(source: unknown): string | null {
  const manifest = (source as any)?.manifest;
  const metadata = manifest?.metadata;
  const extra = manifest?.extra;
  const candidates = [
    metadata?.displayVersion,
    metadata?.releaseKey,
    extra?.displayVersion,
    extra?.releaseKey,
    readUpdateId(source),
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }
  return null;
}

function isDownloadedUpdateAlreadyRunning(state: ReturnType<typeof Updates.useUpdates>) {
  const downloadedUpdateId = readUpdateId(state.downloadedUpdate);
  const runningUpdateId = readUpdateId((state as any).currentlyRunning) || String((Updates as any).updateId || '').trim();
  return Boolean(downloadedUpdateId && runningUpdateId && downloadedUpdateId === runningUpdateId && !state.isUpdatePending);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function OtaUpdateStatusProvider({
  children,
  enabled = true,
}: {
  children?: React.ReactNode;
  enabled?: boolean;
}) {
  const updatesState = Updates.useUpdates();
  const [phase, setPhase] = React.useState<OtaUpdatePhase>(initialStatus.phase);
  const [manualProgress, setManualProgress] = React.useState<number | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = React.useState<number | null>(null);
  const [targetVersionLabel, setTargetVersionLabel] = React.useState<string | null>(null);
  const [targetUpdateId, setTargetUpdateId] = React.useState<string | null>(null);
  const [failureCount, setFailureCount] = React.useState(0);
  const mountedRef = React.useRef(true);
  const checkingRef = React.useRef(false);
  const latestUpdatesStateRef = React.useRef(updatesState);
  const inactiveAtRef = React.useRef<number | null>(null);
  const lastCheckAtRef = React.useRef(0);
  const failureCountRef = React.useRef(0);
  const nextAutoCheckAtRef = React.useRef(0);
  const otaReadyLoggedForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    latestUpdatesStateRef.current = updatesState;
  }, [updatesState]);

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updatesEnabled = Platform.OS !== 'web' && Updates.isEnabled && enabled;
  const versionName =
    Application.nativeApplicationVersion ||
    Constants.nativeAppVersion ||
    Constants.expoConfig?.version ||
    '0.0.0';
  const versionCode = Number(
    Application.nativeBuildVersion ||
      Constants.nativeBuildVersion ||
      Constants.expoConfig?.android?.versionCode ||
      Constants.expoConfig?.ios?.buildNumber ||
      0
  );

  const logOtaEvent = React.useCallback(
    async (eventType: 'OTA_READY' | 'OTA_RELOAD') => {
      if (!updatesEnabled || !versionCode) return;
      const deviceId = await getInstallId();
      await logUpdateEvent({
        eventType,
        platform: Platform.OS as 'android' | 'ios',
        versionCode,
        versionName,
        deviceId,
      });
    },
    [updatesEnabled, versionCode, versionName]
  );

  React.useEffect(() => {
    if (!updatesEnabled) {
      setPhase(Platform.OS === 'web' ? 'disabled' : 'idle');
      setManualProgress(null);
      return;
    }
    if (isDownloadedUpdateAlreadyRunning(updatesState)) {
      setPhase('idle');
      setManualProgress(null);
      setTargetVersionLabel(null);
      setTargetUpdateId(null);
      return;
    }
    if (hasPendingUpdate(updatesState)) {
      setPhase('ready');
      setManualProgress(1);
      setErrorMessage(null);
      setTargetVersionLabel(readUpdateLabel(updatesState.downloadedUpdate));
      setTargetUpdateId(readUpdateId(updatesState.downloadedUpdate));
      return;
    }
    if (updatesState.isDownloading) {
      setPhase('downloading');
      setManualProgress(null);
      setErrorMessage(null);
      return;
    }
    if (updatesState.isChecking) {
      setPhase((current) => (current === 'ready' ? current : 'checking'));
      setManualProgress((current) => current ?? 0.12);
      return;
    }
    setPhase((current) => {
      if (current === 'ready' || current === 'restarting' || current === 'error') return current;
      return 'idle';
    });
  }, [
    enabled,
    updatesEnabled,
    updatesState.downloadedUpdate,
    updatesState.isChecking,
    updatesState.isDownloading,
    updatesState.isUpdatePending,
  ]);

  React.useEffect(() => {
    if (phase !== 'ready') return;
    const key = targetUpdateId || targetVersionLabel || 'ready';
    if (otaReadyLoggedForRef.current === key) return;
    otaReadyLoggedForRef.current = key;
    void logOtaEvent('OTA_READY');
  }, [logOtaEvent, phase, targetUpdateId, targetVersionLabel]);

  const requestCheck = React.useCallback(
    async (source = 'manual') => {
      if (!updatesEnabled || checkingRef.current || phase === 'ready' || phase === 'restarting') {
        return false;
      }

      const isManual = source === 'manual' || source === 'catalog';
      if (!isManual && nextAutoCheckAtRef.current > Date.now()) {
        return false;
      }

      checkingRef.current = true;
      const now = Date.now();
      lastCheckAtRef.current = now;
      setLastCheckedAt(now);
      setErrorMessage(null);
      setPhase('checking');
      setManualProgress(0.12);

      try {
        if (hasPendingUpdate(latestUpdatesStateRef.current)) {
          if (!mountedRef.current) return true;
          setPhase('ready');
          setManualProgress(1);
          setTargetVersionLabel(readUpdateLabel(latestUpdatesStateRef.current.downloadedUpdate));
          setTargetUpdateId(readUpdateId(latestUpdatesStateRef.current.downloadedUpdate));
          return true;
        }

        const checkResult = await withTimeout(
          Updates.checkForUpdateAsync(),
          OTA_CHECK_TIMEOUT_MS,
          'OTA update check timed out'
        );
        if (!mountedRef.current) return false;

        if (!checkResult.isAvailable && !checkResult.isRollBackToEmbedded) {
          setPhase('idle');
          setManualProgress(null);
          setTargetVersionLabel(null);
          setTargetUpdateId(null);
          failureCountRef.current = 0;
          nextAutoCheckAtRef.current = 0;
          setFailureCount(0);
          return false;
        }

        setPhase('downloading');
        setManualProgress(0.2);
        setTargetVersionLabel(readUpdateLabel(checkResult));
        setTargetUpdateId(readUpdateId(checkResult));

        const fetchResult = await withTimeout(
          Updates.fetchUpdateAsync(),
          OTA_FETCH_TIMEOUT_MS,
          'OTA update download timed out'
        );
        if (!mountedRef.current) return true;

        if (fetchResult.isNew || fetchResult.isRollBackToEmbedded || hasPendingUpdate(latestUpdatesStateRef.current)) {
          setPhase('ready');
          setManualProgress(1);
          setTargetVersionLabel(readUpdateLabel(fetchResult) || readUpdateLabel(checkResult));
          setTargetUpdateId(readUpdateId(fetchResult) || readUpdateId(checkResult));
          failureCountRef.current = 0;
          nextAutoCheckAtRef.current = 0;
          setFailureCount(0);
          return true;
        }

        setPhase('idle');
        setManualProgress(null);
        setTargetVersionLabel(null);
        setTargetUpdateId(null);
        failureCountRef.current = 0;
        nextAutoCheckAtRef.current = 0;
        setFailureCount(0);
        return false;
      } catch (error) {
        if (!mountedRef.current) return false;
        if (!isExpectedUpdatesDisabledError(error)) {
          console.warn('[ota-status] check failed', source, error);
        }
        if (!isExpectedUpdatesDisabledError(error)) {
          failureCountRef.current += 1;
          const backoff = Math.min(
            OTA_ERROR_BACKOFF_MAX_MS,
            OTA_ERROR_BACKOFF_BASE_MS * Math.max(1, 2 ** (failureCountRef.current - 1))
          );
          nextAutoCheckAtRef.current = Date.now() + backoff;
          setFailureCount(failureCountRef.current);
        }
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось проверить OTA обновление.');
        setPhase(isExpectedUpdatesDisabledError(error) ? 'disabled' : 'error');
        setManualProgress(null);
        return false;
      } finally {
        checkingRef.current = false;
      }
    },
    [phase, updatesEnabled]
  );

  React.useEffect(() => {
    if (!updatesEnabled) return undefined;

    const isActive = () => AppState.currentState === 'active';
    const runActiveCheck = (source: string) => {
      if (!mountedRef.current || !isActive()) return;
      const now = Date.now();
      if (source !== 'initial' && now - lastCheckAtRef.current < ACTIVE_CHECK_INTERVAL_MS) return;
      void requestCheck(source);
    };

    const initialTimer = setTimeout(() => {
      runActiveCheck('initial');
    }, INITIAL_ACTIVE_CHECK_DELAY_MS);
    (initialTimer as any)?.unref?.();

    const activeInterval = setInterval(() => {
      runActiveCheck('active');
    }, ACTIVE_CHECK_INTERVAL_MS);
    (activeInterval as any)?.unref?.();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const now = Date.now();
      if (nextState !== 'active') {
        inactiveAtRef.current = now;
        return;
      }

      const inactiveFor = inactiveAtRef.current ? now - inactiveAtRef.current : 0;
      const checkAge = now - lastCheckAtRef.current;
      if (inactiveFor < RESUME_BACKGROUND_MIN_MS && checkAge < RESUME_CHECK_INTERVAL_MS) return;
      if (checkAge < RESUME_CHECK_INTERVAL_MS) return;

      void requestCheck('resume');
    });

    return () => {
      clearTimeout(initialTimer);
      clearInterval(activeInterval);
      subscription.remove();
    };
  }, [requestCheck, updatesEnabled]);

  const reloadUpdate = React.useCallback(async () => {
    if (!updatesEnabled) return;
    setPhase('restarting');
    setManualProgress(1);
    setErrorMessage(null);
    await logOtaEvent('OTA_RELOAD');
    await Updates.reloadAsync();
  }, [logOtaEvent, updatesEnabled]);

  const progress = phase === 'downloading'
    ? clampProgress(updatesState.downloadProgress) ?? manualProgress ?? 0.2
    : phase === 'checking'
      ? manualProgress ?? 0.12
      : phase === 'ready' || phase === 'restarting'
        ? 1
        : manualProgress;

  const value = React.useMemo<OtaUpdateStatusContextValue>(
    () => ({
      phase,
      progress,
      errorMessage,
      lastCheckedAt,
      readyToReload: phase === 'ready',
      targetVersionLabel,
      targetUpdateId,
      failureCount,
      isChecking: phase === 'checking',
      isDownloading: phase === 'downloading',
      isRestarting: phase === 'restarting',
      requestCheck,
      reloadUpdate,
    }),
    [errorMessage, failureCount, lastCheckedAt, phase, progress, reloadUpdate, requestCheck, targetUpdateId, targetVersionLabel]
  );

  return (
    <OtaUpdateStatusContext.Provider value={value}>
      {children}
    </OtaUpdateStatusContext.Provider>
  );
}

export function useOtaUpdateStatus() {
  return React.useContext(OtaUpdateStatusContext);
}
