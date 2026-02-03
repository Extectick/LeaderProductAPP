import { useEffect } from 'react';
import { AppState } from 'react-native';

import { pingPresence } from '@/utils/presenceService';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const sendPing = async () => {
      if (cancelled) return;
      try {
        await pingPresence();
      } catch (e) {
        console.warn('[presence] ping failed', (e as any)?.message || e);
      }
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(sendPing, HEARTBEAT_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void sendPing();
        start();
      } else {
        stop();
      }
    });

    void sendPing();
    start();

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [enabled]);
}
