import { io, type Socket } from 'socket.io-client';
import { AppState, Platform } from 'react-native';
import { withDeadline } from '@/src/shared/network/withDeadline';

type ManagedSocketOptions = {
  url: string;
  loggerPrefix: string;
  getAccessToken: (signal?: AbortSignal) => Promise<string | null>;
  refreshAccessToken: (signal?: AbortSignal) => Promise<string | null>;
  onSocketReady: (socket: Socket) => void;
  reconnectDelayMs?: number;
};

export type ManagedSocketRecovery = {
  reason?: 'manual' | 'foreground' | 'online' | 'subscription';
  /** Only a failed application-level probe may replace a connected transport. */
  replaceConnected?: boolean;
};

export type ManagedSocketConnection = {
  disconnect: () => void;
  getSocket: () => Socket | null;
  /** Coalesced recovery; never creates a second concurrent transport. */
  recover?: (options?: ManagedSocketRecovery) => void;
};

const CONNECT_TIMEOUT_MS = 8_000;
const TOKEN_TIMEOUT_MS = 15_000;
const MAX_RETRY_MS = 30_000;

/** One owner for transport retries, foreground recovery and stale async work. */
export function createManagedSocketConnection(options: ManagedSocketOptions): ManagedSocketConnection {
  let alive = true;
  let generation = 0;
  let socket: Socket | null = null;
  let connecting = false;
  let failures = 0;
  let refreshRequired = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let attemptController: AbortController | null = null;
  let unbindSocket: (() => void) | null = null;
  const baseDelay = options.reconnectDelayMs ?? 1200;
  const foreground = () => Platform.OS === 'web'
    ? typeof document === 'undefined' || document.visibilityState !== 'hidden'
    : AppState.currentState === 'active';
  let visible = foreground();
  const focused = () => foreground() && (Platform.OS !== 'web' || typeof document === 'undefined'
    || typeof document.hasFocus !== 'function' || document.hasFocus());

  function clearRetry() { if (retryTimer !== null) clearTimeout(retryTimer); retryTimer = null; }
  function clearConnectTimer() { if (connectTimer !== null) clearTimeout(connectTimer); connectTimer = null; }
  function drop() {
    ++generation;
    attemptController?.abort(); attemptController = null;
    connecting = false;
    clearConnectTimer();
    unbindSocket?.(); unbindSocket = null;
    // Keep the old socket observable during its synchronous disconnect event.
    // Account observers can publish offline before this reference is replaced.
    socket?.disconnect();
    socket = null;
  }
  function schedule() {
    if (!alive || !visible || retryTimer !== null) return;
    const delay = Math.min(MAX_RETRY_MS, baseDelay * 2 ** Math.min(failures++, 5));
    retryTimer = setTimeout(() => { retryTimer = null; void connect(); }, delay);
  }
  function presence() { if (socket?.connected) socket.emit('presence:focus', { focused: focused() }); }

  async function connect() {
    if (!alive || !visible || connecting || socket?.connected) return;
    clearRetry();
    drop();
    connecting = true;
    attemptController = new AbortController();
    const signal = attemptController.signal;
    const own = generation;
    const current = () => alive && own === generation;
    try {
      const token = await withDeadline(refreshRequired ? options.refreshAccessToken(signal) : options.getAccessToken(signal), TOKEN_TIMEOUT_MS, signal);
      if (!current()) return;
      if (!token) { connecting = false; schedule(); return; }
      const next = io(options.url, {
        transports: ['websocket', 'polling'], auth: { token },
        // Retrying here and in Socket.IO at the same time can revive an old
        // namespace after resume. This owner alone rebuilds the transport.
        autoConnect: false, reconnection: false, forceNew: true, timeout: CONNECT_TIMEOUT_MS,
      });
      socket = next;
      const onConnect = () => {
        if (!current()) return;
        clearConnectTimer(); connecting = false; failures = 0; refreshRequired = false; presence();
      };
      const onDisconnect = () => {
        if (!current()) return;
        clearConnectTimer(); connecting = false; schedule();
      };
      const onError = (error: Error) => {
        if (!current()) return;
        if (process.env.EXPO_PUBLIC_SOCKET_DEBUG === 'true') console.warn(`${options.loggerPrefix} connection failed`);
        clearConnectTimer();
        const unauthorized = String(error?.message ?? '').toLowerCase().includes('unauthorized');
        if (unauthorized) refreshRequired = true;
        drop();
        // Hidden tabs never start retries, including an unauthorized handshake.
        schedule();
      };
      next.on('connect', onConnect);
      next.on('disconnect', onDisconnect);
      next.on('connect_error', onError);
      unbindSocket = () => {
        next.off('connect', onConnect); next.off('disconnect', onDisconnect); next.off('connect_error', onError);
      };
      options.onSocketReady(next);
      if (!current() || socket !== next) return;
      // A JS watchdog also covers native transports which never report an error.
      connectTimer = setTimeout(() => { if (current()) { drop(); schedule(); } }, CONNECT_TIMEOUT_MS);
      next.connect();
    } catch {
      if (current()) { drop(); schedule(); }
    }
  }
  function syncVisibility() {
    const next = foreground();
    if (next === visible) { presence(); return; }
    visible = next;
    if (!visible) {
      presence(); clearRetry();
      // Keep an established browser transport alive. Incomplete auth/handshake
      // work has no useful subscription yet and must not finish in background.
      if (Platform.OS !== 'web' || !socket?.connected) drop();
    } else { recover({reason:'foreground'}); presence(); }
  }
  const state = AppState.addEventListener('change', syncVisibility);
  if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', syncVisibility);
    window.addEventListener('blur', presence);
  }
  function recover(recovery:ManagedSocketRecovery = {}) {
    if (!alive || !visible || connecting) return;
    if (socket?.connected && !recovery.replaceConnected) return;
    // Foreground/network recovery should not sit behind an old 30s backoff.
    // connect() claims ownership synchronously before its first await.
    clearRetry(); failures = 0;
    if (recovery.replaceConnected) drop();
    void connect();
  }
  function onOnline() { recover({reason:'online'}); }
  void connect();
  return {
    getSocket: () => socket,
    recover,
    disconnect() {
      if (!alive) return;
      alive = false; clearRetry(); drop(); state.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', syncVisibility);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('focus', syncVisibility);
        window.removeEventListener('blur', presence);
      }
    },
  };
}
