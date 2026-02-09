import { useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/utils/config';
import { getAccessToken, refreshToken } from '@/utils/tokenService';

interface AppealEvent {
  type: string;
  [key: string]: any;
}

/**
 * Подписка на обновления обращений через WebSocket.
 * Если указан appealId — слушаем события конкретного обращения,
 * иначе получаем общие события по всем обращениям.
 */
export function useAppealUpdates(
  appealId: number | undefined,
  onEvent: (event: AppealEvent) => void,
  userId?: number,
  departmentIds?: number | number[],
) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const deptList = useMemo(() => {
    const ids = Array.isArray(departmentIds) ? departmentIds : departmentIds ? [departmentIds] : [];
    return Array.from(new Set(ids.filter(Boolean) as number[])).sort((a, b) => a - b);
  }, [departmentIds]);

  const deptKey = deptList.join(',');
  const deptListRef = useRef<number[]>(deptList);

  useEffect(() => {
    deptListRef.current = deptList;
  }, [deptList]);

  useEffect(() => {
    let socket: Socket | null = null;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let loggedError = false;
    let authRetrying = false;

    async function connect() {
      const token = await getAccessToken();
      if (!active) return;
      if (!token) {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, 1200);
        return;
      }

      socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        auth: token ? { token } : undefined,
        reconnection: true,
        reconnectionDelay: 800,
        reconnectionDelayMax: 5000,
        timeout: 8000,
      });

      const joinRoom = () => {
        const list = deptListRef.current;
        if (appealId) socket?.emit('join', `appeal:${appealId}`);
        if (userId) socket?.emit('join', `user:${userId}`);
        list.forEach((id) => socket?.emit('join', `department:${id}`));
      };

      socket.on('connect', joinRoom);
      socket.on('connect_error', async (err: any) => {
        if (!loggedError) {
          loggedError = true;
          console.warn('[ws] connect_error', err?.message || err);
        }
        const msg = String(err?.message || '');
        if (msg.toLowerCase().includes('unauthorized') && !authRetrying) {
          authRetrying = true;
          try {
            await refreshToken();
          } catch {}
          if (socket) {
            socket.disconnect();
            socket = null;
          }
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, 1200);
        }
      });

      socket.onAny((event, payload) => {
        onEventRef.current({ type: event, ...(payload || {}) });
      });
    }

    void connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket?.connected) {
        const list = deptListRef.current;
        if (appealId) socket.emit('leave', `appeal:${appealId}`);
        if (userId) socket.emit('leave', `user:${userId}`);
        list.forEach((id) => socket?.emit('leave', `department:${id}`));
      }
      socket?.disconnect();
    };
  }, [appealId, userId, deptKey]);
}
