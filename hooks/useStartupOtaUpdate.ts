import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

const OTA_CHECK_TIMEOUT_MS = 15000;
const OTA_FETCH_TIMEOUT_MS = 90000;
const RELOAD_DELAY_MS = 250;

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

export function useStartupOtaUpdate(start: boolean): StartupOtaState {
  const updatesState = Updates.useUpdates();
  const [ready, setReady] = useState(Platform.OS === 'web');
  const [phase, setPhase] = useState<StartupOtaPhase>(Platform.OS === 'web' ? 'disabled' : 'waiting');
  const [manualProgress, setManualProgress] = useState<number | null>(null);
  const startedRef = useRef(false);
  const reloadTriggeredRef = useRef(false);
  const mountedRef = useRef(true);

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
    await Updates.reloadAsync();
  }, []);

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
    if (!updatesState.isUpdatePending) return;
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

        const checkResult = await withTimeout(
          Updates.checkForUpdateAsync(),
          OTA_CHECK_TIMEOUT_MS,
          'OTA update check timed out'
        );
        if (cancelled || !mountedRef.current || reloadTriggeredRef.current) return;

        if (!checkResult.isAvailable && !checkResult.isRollBackToEmbedded) {
          finish('up-to-date');
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

        if (fetchResult.isNew || fetchResult.isRollBackToEmbedded) {
          await applyDownloadedUpdate();
          return;
        }

        finish('up-to-date');
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
  }, [applyDownloadedUpdate, finish, start]);

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
