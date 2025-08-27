import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/utils/config';
import { getAccessToken } from '@/utils/tokenService';

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
) {
  useEffect(() => {
    let socket: Socket | null = null;
    let active = true;

    async function connect() {
      const token = await getAccessToken();
      if (!active) return;

      socket = io(API_BASE_URL, {
        transports: ['websocket'],
        auth: token ? { token } : undefined,
      });

      const joinRoom = () => {
        if (appealId) socket?.emit('join', `appeal:${appealId}`);
      };

      socket.on('connect', joinRoom);
      joinRoom();

      socket.onAny((event, payload) => {
        onEvent({ type: event, ...(payload || {}) });
      });
    }

    void connect();

    return () => {
      active = false;
      if (appealId) socket?.emit('leave', `appeal:${appealId}`);
      socket?.disconnect();
    };
  }, [appealId, onEvent]);
}

