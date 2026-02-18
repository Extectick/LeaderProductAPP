import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { Socket } from 'socket.io-client';

import { getPresence, PresenceInfo } from '@/utils/presenceService';
import { API_BASE_URL } from '@/utils/config';
import { getAccessToken, refreshToken } from '@/utils/tokenService';
import { createManagedSocketConnection } from '@/src/shared/socket/managedSocket';

type PresenceMap = Record<number, PresenceInfo>;

export function usePresence(userIds: number[], opts?: { intervalMs?: number }) {
  const intervalMs = opts?.intervalMs ?? 20_000;
  const idsKey = useMemo(() => {
    const unique = Array.from(new Set(userIds.filter((id) => Number.isFinite(id))));
    return unique.join(',');
  }, [userIds]);
  const ids = useMemo(() => {
    if (!idsKey) return [] as number[];
    return idsKey
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
  }, [idsKey]);
  const [map, setMap] = useState<PresenceMap>({});

  useEffect(() => {
    if (!ids.length) {
      setMap((prev) => (Object.keys(prev).length ? {} : prev));
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
  }, [ids, idsKey, intervalMs]);

  useEffect(() => {
    if (!ids.length) return;

    let currentSocket: Socket | null = null;
    const tracked = new Set(ids);
    const handlePresenceChanged = (event: any) => {
      const userId = Number(event?.userId);
      if (!Number.isFinite(userId) || !tracked.has(userId)) return;
      setMap((prev) => ({
        ...prev,
        [userId]: {
          userId,
          isOnline: !!event?.isOnline,
          lastSeenAt: event?.lastSeenAt ?? prev[userId]?.lastSeenAt ?? null,
        },
      }));
    };

    const connection = createManagedSocketConnection({
      url: API_BASE_URL,
      loggerPrefix: '[presence-ws]',
      getAccessToken,
      refreshAccessToken: refreshToken,
      onSocketReady: (socket) => {
        currentSocket = socket;
        const subscribe = () => {
          socket.emit('presence:subscribe', { userIds: ids });
        };
        socket.on('connect', subscribe);
        if (socket.connected) {
          subscribe();
        }
        socket.on('presenceChanged', handlePresenceChanged);
      },
    });

    return () => {
      if (currentSocket?.connected) {
        currentSocket.emit('presence:unsubscribe', { userIds: ids });
      }
      currentSocket?.off('presenceChanged', handlePresenceChanged);
      connection.disconnect();
      currentSocket = null;
    };
  }, [ids, idsKey]);

  return map;
}
