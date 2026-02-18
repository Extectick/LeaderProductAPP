import { io, type Socket } from 'socket.io-client';

type ManagedSocketOptions = {
  url: string;
  loggerPrefix: string;
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken: () => Promise<string | null>;
  onSocketReady: (socket: Socket) => void;
  reconnectDelayMs?: number;
};

export type ManagedSocketConnection = {
  disconnect: () => void;
  getSocket: () => Socket | null;
};

const DEFAULT_RECONNECT_DELAY_MS = 1200;

export function createManagedSocketConnection(options: ManagedSocketOptions): ManagedSocketConnection {
  const reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  let active = true;
  let socket: Socket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let authRetrying = false;
  let loggedError = false;

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleReconnect = () => {
    clearRetry();
    retryTimer = setTimeout(() => {
      void connect();
    }, reconnectDelayMs);
  };

  async function connect() {
    authRetrying = false;
    loggedError = false;
    const token = await options.getAccessToken();
    if (!active) return;
    if (!token) {
      scheduleReconnect();
      return;
    }

    socket = io(options.url, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 8000,
    });

    socket.on('connect', () => {
      authRetrying = false;
      loggedError = false;
    });

    socket.on('connect_error', async (err: any) => {
      if (!loggedError) {
        loggedError = true;
        console.warn(`${options.loggerPrefix} connect_error`, err?.message || err);
      }
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('unauthorized') && !authRetrying) {
        authRetrying = true;
        try {
          await options.refreshAccessToken();
        } catch {
          // noop
        }
        authRetrying = false;
        socket?.disconnect();
        socket = null;
        scheduleReconnect();
      }
    });

    options.onSocketReady(socket);
  }

  void connect();

  return {
    disconnect: () => {
      active = false;
      clearRetry();
      socket?.disconnect();
      socket = null;
    },
    getSocket: () => socket,
  };
}
