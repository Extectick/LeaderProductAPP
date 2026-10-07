import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { reloadAppSafely } from '@/src/shared/ota/appReloadLifecycle';

const RELOAD_TIMEOUT_MS = 8_000;
type StartupOtaPhase = 'waiting' | 'disabled' | 'applying' | 'ready' | 'error';
type StartupOtaState = { ready: boolean; phase: StartupOtaPhase };

/**
 * Native startup selects a cached/embedded bundle within its network deadline.
 * Never wait here for a background download or issue another check: the global
 * banner owns that work. Only apply an already pending update before entry.
 */
export function useStartupOtaUpdate(start: boolean): StartupOtaState {
  const updatesState = Updates.useUpdates();
  const enabled = Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;
  const [state, setState] = useState<StartupOtaState>({
    ready: !enabled, phase: enabled ? 'waiting' : 'disabled',
  });
  const reloadRef = useRef<Promise<void> | null>(null);
  const reloadDeadlineRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start || state.ready) return;
    if (!enabled) {
      setState({ ready: true, phase: 'disabled' });
      return;
    }
    const downloadedId = updatesState.downloadedUpdate?.updateId;
    const runningId = updatesState.currentlyRunning?.updateId || Updates.updateId;
    const alreadyRunning = Boolean(downloadedId && runningId && downloadedId === runningId);
    const nativeBusy = updatesState.isStartupProcedureRunning || updatesState.isChecking || updatesState.isDownloading;
    if (!reloadRef.current && (alreadyRunning || !updatesState.isUpdatePending || nativeBusy)) {
      // A download completing later must not restart an app the user is using.
      setState({ ready: true, phase: 'ready' });
      return;
    }

    let cancelled = false;
    setState({ ready: false, phase: 'applying' });
    // Reuse the operation if StrictMode replays the effect.
    const deadline = reloadDeadlineRef.current ??= Date.now() + RELOAD_TIMEOUT_MS;
    const reload = reloadRef.current ??= reloadAppSafely(() => Updates.reloadAsync());
    const finish = (error?: unknown) => {
      if (cancelled) return;
      clearTimeout(timer);
      if (error) console.warn('[ota] startup reload failed', error);
      setState({ ready: true, phase: error ? 'error' : 'ready' });
    };
    const timer = setTimeout(() => finish(new Error('OTA reload timed out')), Math.max(0, deadline - Date.now()));
    void reload.then(() => finish(), finish);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, start, state.ready, updatesState.currentlyRunning?.updateId,
    updatesState.downloadedUpdate?.updateId, updatesState.isChecking, updatesState.isDownloading,
    updatesState.isStartupProcedureRunning, updatesState.isUpdatePending]);

  return state;
}
