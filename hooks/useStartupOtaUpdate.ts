import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

const OTA_CHECK_TIMEOUT_MS = 15000;
const OTA_FETCH_TIMEOUT_MS = 90000;
const OTA_NATIVE_IDLE_TIMEOUT_MS = 30000;
const OTA_NATIVE_POLL_MS = 250;
const OTA_RETRY_DELAY_MS = 1000;
const OTA_MAX_CHECK_ATTEMPTS = 3;
const RELOAD_DELAY_MS = 900;
const RELOAD_CONFIRMATION_WAIT_MS = 1800;
const RELOAD_MAX_ATTEMPTS = 3;

type StartupOtaPhase =
  | 'waiting'
  | 'disabled'
  | 'checking'
  | 'downloading'
  | 'applying'
  | 'up-to-date'
  | 'error';

type StartupOtaState = {
  ready: boolean;
  phase: StartupOtaPhase;
  statusText: string;
  hintText: string;
  progress: number | null;
};

function clampProgress(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function isExpectedUpdatesDisabledError(error: unknown) {
  const code = (error as any)?.code;
  const message = String((error as any)?.message || '');
  return code === 'ERR_UPDATES_DISABLED' || message.includes('development mode');
}

function isTransientUpdatesBusyError(error: unknown) {
  const message = String((error as any)?.message || '').toLowerCase();
  return (
    message.includes('already') ||
    message.includes('in progress') ||
    message.includes('busy') ||
    message.includes('running')
  );
}

export function useStartupOtaUpdate(start: boolean): StartupOtaState {
  const updatesState = Updates.useUpdates();
  const [ready, setReady] = useState(Platform.OS === 'web');
  const [phase, setPhase] = useState<StartupOtaPhase>(Platform.OS === 'web' ? 'disabled' : 'waiting');
  const [manualProgress, setManualProgress] = useState<number | null>(null);
  const startedRef = useRef(false);
  const reloadTriggeredRef = useRef(false);
  const mountedRef = useRef(true);
  const latestUpdatesStateRef = useRef(updatesState);

  useEffect(() => {
    latestUpdatesStateRef.current = updatesState;
  }, [updatesState]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const finish = useCallback((nextPhase: StartupOtaPhase) => {
    if (!mountedRef.current) return;
    setPhase(nextPhase);
    setManualProgress(nextPhase === 'up-to-date' ? 1 : null);
    setReady(true);
  }, []);

  const applyDownloadedUpdate = useCallback(async () => {
    if (reloadTriggeredRef.current) return;
    reloadTriggeredRef.current = true;
    if (mountedRef.current) {
      setReady(false);
      setPhase('applying');
      setManualProgress(0.96);
    }
    await sleep(RELOAD_DELAY_MS);
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= RELOAD_MAX_ATTEMPTS; attempt += 1) {
      try {
        await Updates.reloadAsync();
        await sleep(RELOAD_CONFIRMATION_WAIT_MS);
      } catch (error) {
        lastError = error;
        await sleep(OTA_RETRY_DELAY_MS);
      }
    }
    reloadTriggeredRef.current = false;
    if (lastError) throw lastError;
    throw new Error('OTA reload did not restart the JS runtime');
  }, []);

  const hasPendingDownloadedUpdate = useCallback(() => {
    const state = latestUpdatesStateRef.current;
    return Boolean(state.isUpdatePending || state.downloadedUpdate);
  }, []);

  const waitForNativeUpdatesIdle = useCallback(
    async (isCancelled: () => boolean) => {
      const deadline = Date.now() + OTA_NATIVE_IDLE_TIMEOUT_MS;

      while (!isCancelled() && mountedRef.current) {
        const state = latestUpdatesStateRef.current;
        if (state.isUpdatePending || state.downloadedUpdate) return 'pending' as const;
        if (!state.isStartupProcedureRunning && !state.isChecking && !state.isDownloading) {
          return 'idle' as const;
        }
        if (Date.now() >= deadline) return 'timeout' as const;
        if (state.isDownloading) {
          setPhase('downloading');
          setManualProgress(null);
        } else {
          setPhase('checking');
          setManualProgress((current) => current ?? 0.22);
        }
        await sleep(OTA_NATIVE_POLL_MS);
      }

      return 'cancelled' as const;
    },
    []
  );

  const finishIfNoPendingUpdate = useCallback(
    (nextPhase: StartupOtaPhase) => {
      if (hasPendingDownloadedUpdate()) {
        void applyDownloadedUpdate().catch((error) => {
          if (!isExpectedUpdatesDisabledError(error)) {
            console.warn('[ota] reload failed', error);
          }
          finish('error');
        });
        return;
      }
      finish(nextPhase);
    },
    [applyDownloadedUpdate, finish, hasPendingDownloadedUpdate]
  );

  useEffect(() => {
    if (!start) return;
    if (Platform.OS === 'web') {
      finish('disabled');
      return;
    }
    if (!Updates.isEnabled) {
      finish('disabled');
    }
  }, [finish, start]);

  useEffect(() => {
    if (!start || !Updates.isEnabled || Platform.OS === 'web') return;
    if (!updatesState.isUpdatePending && !updatesState.downloadedUpdate) return;
    void applyDownloadedUpdate().catch((error) => {
      if (!isExpectedUpdatesDisabledError(error)) {
        console.warn('[ota] reload failed', error);
      }
      finish('error');
    });
  }, [applyDownloadedUpdate, finish, start, updatesState.isUpdatePending]);

  useEffect(() => {
    if (!start || startedRef.current) return;
    if (Platform.OS === 'web') return;
    if (!Updates.isEnabled) return;

    let cancelled = false;
    startedRef.current = true;

    void (async () => {
      try {
        setReady(false);
        setPhase('checking');
        setManualProgress(0.18);

        const nativeState = await waitForNativeUpdatesIdle(() => cancelled);
        if (cancelled || !mountedRef.current || reloadTriggeredRef.current) return;
        if (nativeState === 'pending') {
          await applyDownloadedUpdate();
          return;
        }

        let checkResult: Awaited<ReturnType<typeof Updates.checkForUpdateAsync>> | null = null;
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= OTA_MAX_CHECK_ATTEMPTS; attempt += 1) {
          try {
            checkResult = await withTimeout(
              Updates.checkForUpdateAsync(),
              OTA_CHECK_TIMEOUT_MS,
              'OTA update check timed out'
            );
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            if (isExpectedUpdatesDisabledError(error)) throw error;
            if (!isTransientUpdatesBusyError(error) && attempt >= OTA_MAX_CHECK_ATTEMPTS) {
              throw error;
            }

            const retryState = await waitForNativeUpdatesIdle(() => cancelled);
            if (cancelled || !mountedRef.current || reloadTriggeredRef.current) return;
            if (retryState === 'pending') {
              await applyDownloadedUpdate();
              return;
            }
            await sleep(OTA_RETRY_DELAY_MS);
          }
        }

        if (cancelled || !mountedRef.current || reloadTriggeredRef.current) return;
        if (!checkResult) {
          throw lastError || new Error('OTA update check failed');
        }

        if (!checkResult.isAvailable && !checkResult.isRollBackToEmbedded) {
          finishIfNoPendingUpdate('up-to-date');
          return;
        }

        setPhase('downloading');
        setManualProgress(0.45);

        const fetchResult = await withTimeout(
          Updates.fetchUpdateAsync(),
          OTA_FETCH_TIMEOUT_MS,
          'OTA update download timed out'
        );
        if (cancelled || !mountedRef.current || reloadTriggeredRef.current) return;

        if (fetchResult.isNew || fetchResult.isRollBackToEmbedded || hasPendingDownloadedUpdate()) {
          await applyDownloadedUpdate();
          return;
        }

        finishIfNoPendingUpdate('up-to-date');
      } catch (error) {
        if (cancelled || !mountedRef.current || reloadTriggeredRef.current) return;
        if (!isExpectedUpdatesDisabledError(error)) {
          console.warn('[ota] startup update check failed', error);
        }
        finish('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyDownloadedUpdate, finish, finishIfNoPendingUpdate, hasPendingDownloadedUpdate, start, waitForNativeUpdatesIdle]);

  const derivedPhase = useMemo<StartupOtaPhase>(() => {
    if (phase === 'applying' || updatesState.isRestarting) return 'applying';
    if (!ready && updatesState.isUpdatePending) return 'applying';
    if (!ready && updatesState.isDownloading) return 'downloading';
    if (!ready && updatesState.isChecking) return 'checking';
    return phase;
  }, [
    phase,
    ready,
    updatesState.isChecking,
    updatesState.isDownloading,
    updatesState.isRestarting,
    updatesState.isUpdatePending,
  ]);

  const progress = useMemo(() => {
    if (derivedPhase === 'downloading') {
      return clampProgress(updatesState.downloadProgress) ?? manualProgress ?? 0.45;
    }
    if (derivedPhase === 'checking') {
      return manualProgress ?? 0.18;
    }
    if (derivedPhase === 'applying') {
      return manualProgress ?? 0.96;
    }
    return manualProgress;
  }, [derivedPhase, manualProgress, updatesState.downloadProgress]);

  const runtimeLabel = Updates.runtimeVersion ? `Runtime ${Updates.runtimeVersion}.` : '';

  const copy = useMemo(() => {
    if (!start) {
      return {
        statusText: 'Подготовка обновлений',
        hintText: 'Ожидаем завершения базовой инициализации.',
      };
    }
    if (derivedPhase === 'checking') {
      return {
        statusText: 'Проверка OTA обновления',
        hintText: `${runtimeLabel} Проверяем, есть ли свежий интерфейс.`.trim(),
      };
    }
    if (derivedPhase === 'downloading') {
      return {
        statusText: 'Загрузка OTA обновления',
        hintText: 'Скачиваем новый интерфейс. APK переустанавливать не нужно.',
      };
    }
    if (derivedPhase === 'applying') {
      return {
        statusText: 'Применение OTA обновления',
        hintText: 'Перезапускаем приложение на новой версии интерфейса.',
      };
    }
    if (derivedPhase === 'error') {
      return {
        statusText: 'OTA временно недоступно',
        hintText: 'Запускаем приложение без ожидания обновления.',
      };
    }
    return {
      statusText: 'OTA обновлений нет',
      hintText: runtimeLabel || 'Интерфейс уже актуален.',
    };
  }, [derivedPhase, runtimeLabel, start]);

  return {
    ready,
    phase: derivedPhase,
    statusText: copy.statusText,
    hintText: copy.hintText,
    progress,
  };
}
