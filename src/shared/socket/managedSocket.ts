import { io, type Socket } from 'socket.io-client';
import { AppState, Platform } from 'react-native';

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
  let focusCleanup: (() => void) | null = null;
  let focused = true;
  let lastSentFocused: boolean | null = null;

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

  const resolveFocusedState = () => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return true;
      const isVisible = document.visibilityState === 'visible';
      const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      return isVisible && hasFocus;
    }
    return AppState.currentState === 'active';
  };

  const emitPresenceFocus = (force = false) => {
    if (!socket?.connected) return;
    if (!force && lastSentFocused === focused) return;
    socket.emit('presence:focus', { focused });
    lastSentFocused = focused;
  };

  const updateFocusedState = (nextFocused: boolean) => {
    if (focused === nextFocused) return;
    focused = nextFocused;
    lastSentFocused = null;
    emitPresenceFocus();
  };

  const bindFocusTracking = () => {
    if (focusCleanup) return;
    focused = resolveFocusedState();
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        focusCleanup = () => {};
        return;
      }
      const sync = () => updateFocusedState(resolveFocusedState());
      window.addEventListener('focus', sync);
      window.addEventListener('blur', sync);
      document.addEventListener('visibilitychange', sync);
      focusCleanup = () => {
        window.removeEventListener('focus', sync);
        window.removeEventListener('blur', sync);
        document.removeEventListener('visibilitychange', sync);
      };
      return;
    }
    const sub = AppState.addEventListener('change', (state) => {
      updateFocusedState(state === 'active');
    });
    focusCleanup = () => sub.remove();
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
      lastSentFocused = null;
      emitPresenceFocus(true);
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

  bindFocusTracking();
  void connect();

  return {
    disconnect: () => {
      active = false;
      clearRetry();
      focusCleanup?.();
      focusCleanup = null;
      socket?.disconnect();
      socket = null;
    },
    getSocket: () => socket,
  };
}
