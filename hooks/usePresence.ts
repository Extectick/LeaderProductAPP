import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';

import { getPresence, PresenceInfo } from '@/utils/presenceService';
import { API_BASE_URL } from '@/utils/config';
import { getAccessToken, refreshToken } from '@/utils/tokenService';

type PresenceMap = Record<number, PresenceInfo>;

export function usePresence(userIds: number[], opts?: { intervalMs?: number }) {
  const intervalMs = opts?.intervalMs ?? 20_000;
  const ids = useMemo(
    () => Array.from(new Set(userIds.filter((id) => Number.isFinite(id)))),
    [userIds]
  );
  const idsKey = useMemo(() => ids.join(','), [ids]);
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
  }, [ids, idsKey, intervalMs]);

  useEffect(() => {
    if (!ids.length) return;

    let active = true;
    let socket: Socket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let authRetrying = false;
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

    const connect = async () => {
      const token = await getAccessToken();
      if (!active) return;
      if (!token) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          void connect();
        }, 1200);
        return;
      }

      socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionDelay: 800,
        reconnectionDelayMax: 5000,
        timeout: 8000,
      });

      socket.on('connect', () => {
        socket?.emit('presence:subscribe', { userIds: ids });
      });
      socket.on('presenceChanged', handlePresenceChanged);
      socket.on('connect_error', async (err: any) => {
        const msg = String(err?.message || '');
        if (msg.toLowerCase().includes('unauthorized') && !authRetrying) {
          authRetrying = true;
          try {
            await refreshToken();
          } catch {}
          socket?.disconnect();
          socket = null;
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => {
            authRetrying = false;
            void connect();
          }, 1200);
        }
      });
    };

    void connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket?.connected) {
        socket.emit('presence:unsubscribe', { userIds: ids });
      }
      socket?.off('presenceChanged', handlePresenceChanged);
      socket?.disconnect();
    };
  }, [ids, idsKey]);

  return map;
}
