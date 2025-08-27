import { useEffect } from 'react';
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
    let ws: WebSocket | null = null;
    let isActive = true;

    async function connect() {
      const token = await getAccessToken();
      if (!isActive) return;

      const base = API_BASE_URL.replace(/^http/, 'ws');
      const path = appealId ? `/ws/appeals/${appealId}` : '/ws/appeals';
      const url = `${base}${path}${token ? `?token=${token}` : ''}`;

      ws = new WebSocket(url);

      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          onEvent(payload);
        } catch {
          onEvent({ type: 'unknown' });
        }
      };

      ws.onclose = () => {
        if (isActive) {
          setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      isActive = false;
      if (ws) ws.close();
    };
  }, [appealId, onEvent]);
}

