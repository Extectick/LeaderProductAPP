import { AppState, Platform } from 'react-native';
import type { Socket } from 'socket.io-client';
import { jwtDecode } from 'jwt-decode';
import { API_BASE_URL } from '@/utils/config';
import { getAccessTokenForRequest, refreshToken } from '@/utils/tokenService';
import { createManagedSocketConnection, type ManagedSocketConnection } from '@/src/shared/socket/managedSocket';

const TOKEN_CHECK_INTERVAL_MS = 30_000;

/** The token itself is never logged or allowed to migrate this connection to another account. */
function usableToken(token: string | null, userId: number): token is string {
  if (!token || !Number.isSafeInteger(userId) || userId <= 0) return false;
  try {
    const claims = jwtDecode<{ userId?: number; exp?: number }>(token);
    return claims.userId === userId && typeof claims.exp === 'number' && Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now();
  } catch { return false; }
}

/**
 * Help event authorization is rechecked by the server for every event, not just on connect.
 * A live Socket.IO connection therefore needs proactive replacement when its JWT rotates.
 */
export function createHelpSocket(userId: number, onSocketReady: (socket: Socket) => void): ManagedSocketConnection {
  let alive = true;
  let connection: ManagedSocketConnection | null = null;
  let connectionToken: string | null = null;
  let generation = 0;
  let checking: Promise<void> | null = null;

  function dropConnection() {
    ++generation;
    const previous = connection;
    connection = null;
    connectionToken = null;
    previous?.disconnect();
  }

  function bind(token: string) {
    dropConnection();
    if (!alive) return;
    connectionToken = token;
    const ownGeneration = generation;
    const current = () => alive && generation === ownGeneration;
    // Managed reconnection also goes through this guard, including its connect_error refresh path.
    const scopedToken = async (forceRefresh = false) => {
      if (!current()) return null;
      let next: string | null;
      try {
        next = await getAccessTokenForRequest();
        if (!current()) return null;
        if (!usableToken(next, userId)) { dropConnection(); return null; }
        if (forceRefresh) {
          next = await refreshToken();
          if (!current()) return null;
          if (!usableToken(next, userId)) { dropConnection(); return null; }
        }
      } catch {
        if (current() && !usableToken(connectionToken, userId)) dropConnection();
        return null;
      }
      connectionToken = next;
      return next;
    };
    connection = createManagedSocketConnection({
      url: API_BASE_URL,
      loggerPrefix: '[help]',
      getAccessToken: () => scopedToken(),
      refreshAccessToken: () => scopedToken(true),
      onSocketReady(socket) {
        if (!current() || !usableToken(connectionToken, userId)) { socket.disconnect(); return; }
        onSocketReady(socket);
      },
    });
  }

  async function checkToken() {
    if (!alive) return;
    if (checking) return checking;
    const work = async () => {
      try {
        const token = await getAccessTokenForRequest();
        if (!alive) return;
        if (!usableToken(token, userId)) { dropConnection(); return; }
        if (!connection || token !== connectionToken) bind(token);
      } catch {
        if (alive && !usableToken(connectionToken, userId)) dropConnection();
      }
    };
    checking = work();
    try { await checking; } finally { checking = null; }
  }

  const interval = setInterval(() => { void checkToken(); }, TOKEN_CHECK_INTERVAL_MS);
  const appState = AppState.addEventListener('change', state => { if (state === 'active') void checkToken(); });
  const onFocus = () => { void checkToken(); };
  const onVisibility = () => { if (document.visibilityState === 'visible') void checkToken(); };
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
  }
  void checkToken();

  return {
    getSocket: () => alive ? connection?.getSocket() ?? null : null,
    disconnect() {
      if (!alive) return;
      alive = false;
      clearInterval(interval);
      appState.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibility);
      }
      dropConnection();
    },
  };
}
