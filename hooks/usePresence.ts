import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { getPresence, PresenceInfo } from '@/utils/presenceService';

type PresenceMap = Record<number, PresenceInfo>;

export function usePresence(userIds: number[], opts?: { intervalMs?: number }) {
  const intervalMs = opts?.intervalMs ?? 20_000;
  const ids = useMemo(
    () => Array.from(new Set(userIds.filter((id) => Number.isFinite(id)))),
    [userIds]
  );
  const [map, setMap] = useState<PresenceMap>({});

  useEffect(() => {
    if (!ids.length) {
      setMap({});
      return;
    }
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const data = await getPresence(ids);
        if (cancelled) return;
        const next: PresenceMap = {};
        data.forEach((p) => {
          next[p.userId] = p;
        });
        setMap(next);
      } catch (e) {
        console.warn('[presence] fetch failed', (e as any)?.message || e);
      }
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(load, intervalMs);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void load();
        start();
      } else {
        stop();
      }
    });

    void load();
    start();

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [ids.join(','), intervalMs]);

  return map;
}
