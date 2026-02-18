import { useEffect, useMemo, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/utils/config';
import { getAccessToken, refreshToken } from '@/utils/tokenService';
import { createManagedSocketConnection } from '@/src/shared/socket/managedSocket';

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
  departmentIds?: number | number[]
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
    if (!appealId && !userId && !deptList.length) return;

    let currentSocket: Socket | null = null;

    const connection = createManagedSocketConnection({
      url: API_BASE_URL,
      loggerPrefix: '[appeals-ws]',
      getAccessToken,
      refreshAccessToken: refreshToken,
      onSocketReady: (socket) => {
        currentSocket = socket;
        const joinRoom = () => {
          const list = deptListRef.current;
          if (appealId) socket.emit('join', `appeal:${appealId}`);
          if (userId) socket.emit('join', `user:${userId}`);
          list.forEach((id) => socket.emit('join', `department:${id}`));
        };

        socket.on('connect', joinRoom);
        if (socket.connected) {
          joinRoom();
        }
        socket.onAny((event, payload) => {
          onEventRef.current({ event, eventType: event, ...(payload || {}) });
        });
      },
    });

    return () => {
      const socket = currentSocket;
      if (socket?.connected) {
        const list = deptListRef.current;
        if (appealId) socket.emit('leave', `appeal:${appealId}`);
        if (userId) socket.emit('leave', `user:${userId}`);
        list.forEach((id) => socket.emit('leave', `department:${id}`));
      }
      socket?.offAny();
      connection.disconnect();
      currentSocket = null;
    };
  }, [appealId, userId, deptKey, deptList.length]);
}
