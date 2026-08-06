import { useEffect } from 'react';
import { AppState } from 'react-native';

import { pingPresence } from '@/utils/presenceService';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_FAILURE_MAX_INTERVAL_MS = 5 * 60_000;

export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let sending = false;
    let failureCount = 0;

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = (delayMs: number) => {
      stop();
      if (cancelled || AppState.currentState !== 'active') return;
      timer = setTimeout(() => void sendPing(), delayMs);
    };

    const sendPing = async () => {
      if (cancelled || sending || AppState.currentState !== 'active') return;
      sending = true;
      try {
        await pingPresence();
        failureCount = 0;
        schedule(HEARTBEAT_INTERVAL_MS);
      } catch (e) {
        failureCount += 1;
        const retryDelay = Math.min(
          HEARTBEAT_FAILURE_MAX_INTERVAL_MS,
          HEARTBEAT_INTERVAL_MS * (2 ** failureCount)
        );
        if (failureCount === 1 || retryDelay === HEARTBEAT_FAILURE_MAX_INTERVAL_MS) {
          console.warn('[presence] ping failed', (e as any)?.message || e);
        }
        schedule(retryDelay);
      } finally {
        sending = false;
      }
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        failureCount = 0;
        stop();
        void sendPing();
      } else {
        stop();
      }
    });

    void sendPing();

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [enabled]);
}
