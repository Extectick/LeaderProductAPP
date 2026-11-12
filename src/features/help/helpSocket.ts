import { AppState, Platform } from 'react-native';
import { withDeadline } from '@/src/shared/network/withDeadline';
import type { Socket } from 'socket.io-client';
import { jwtDecode } from 'jwt-decode';
import { API_BASE_URL } from '@/utils/config';
import { getAccessTokenForRequest, refreshToken, resumeAuthRefresh } from '@/utils/tokenService';
import { createManagedSocketConnection, type ManagedSocketConnection, type ManagedSocketRecovery } from '@/src/shared/socket/managedSocket';

const TOKEN_CHECK_INTERVAL_MS = 30_000;

/** The token itself is never logged or allowed to migrate this connection to another account. */
function usableToken(token: string | null, userId: number): token is string {
  if (!token || !Number.isSafeInteger(userId) || userId <= 0) return false;
  try {
    const claims = jwtDecode<{ userId?: number; exp?: number }>(token);
    return claims.userId === userId && typeof claims.exp === 'number' && Number.isFinite(claims.exp) && claims.exp * 1000 > Date.now();
  } catch { return false; }
}

function expiredAccountToken(token:string|null,userId:number):boolean {
  if(!token)return false;
  try{
    const claims=jwtDecode<{userId?:number;exp?:number}>(token);
    return claims.userId===userId&&typeof claims.exp==='number'&&Number.isFinite(claims.exp)&&claims.exp*1000<=Date.now();
  }catch{return false;}
}

/**
 * Help event authorization is rechecked by the server for every event, not just on connect.
 * A live Socket.IO connection therefore needs proactive replacement when its JWT rotates.
 */
export function createHelpSocket(userId: number, onSocketReady: (socket: Socket) => void): ManagedSocketConnection {
  let alive = true;
  const lifetime = new AbortController();
  let connection: ManagedSocketConnection | null = null;
  let connectionToken: string | null = null;
  let generation = 0;
  let checking: Promise<void> | null = null;
  let checkingWake:{requested:boolean;expedited:boolean}|null = null;
  let recoveryRequested:{options:ManagedSocketRecovery;socket:Socket|null}|null = null;
  let checkGeneration = 0;
  let checkController:AbortController|null = null;

  function dropConnection() {
    ++generation;
    recoveryRequested=null;
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
    const scopedToken = async (forceRefresh = false, signal?: AbortSignal) => {
      const valid = () => current() && !signal?.aborted;
      let waiting = true;
      if (!valid()) return null;
      let next: string | null;
      try {
        next = await withDeadline((async () => {
          const token = await getAccessTokenForRequest();
          if (!waiting || !valid() || !usableToken(token, userId)) return null;
          return forceRefresh ? refreshToken() : token;
        })(), 12_000, signal ?? lifetime.signal);
        if (!valid()) return null;
        if (!usableToken(next, userId)) { dropConnection(); return null; }
      } catch {
        if (valid() && !usableToken(connectionToken, userId)) dropConnection();
        return null;
      } finally { waiting = false; }
      connectionToken = next;
      return next;
    };
    connection = createManagedSocketConnection({
      url: API_BASE_URL,
      loggerPrefix: '[help]',
      getAccessToken: signal => scopedToken(false, signal),
      refreshAccessToken: signal => scopedToken(true, signal),
      onSocketReady(socket) {
        if (!current() || !usableToken(connectionToken, userId)) { socket.disconnect(); return; }
        onSocketReady(socket);
      },
    });
  }

  async function checkToken(wake?:{expedited:boolean}) {
    if (!alive || !foreground()) return;
    if (checking) {
      if(wake&&checkingWake){checkingWake.requested=true;checkingWake.expedited ||= wake.expedited;}
      return checking;
    }
    const controller=new AbortController();checkController=controller;
    const wakeAttempt={requested:Boolean(wake),expedited:wake?.expedited??false};checkingWake=wakeAttempt;
    const deadline=Date.now()+12_000;
    const ownCheck=++checkGeneration,ownConnection=generation;
    const current=()=>alive&&!controller.signal.aborted&&ownCheck===checkGeneration&&ownConnection===generation&&foreground();
    const work = async () => {
      try {
        const read=async()=>{
          try{return{ok:true as const,token:await withDeadline(getAccessTokenForRequest(),Math.max(1,deadline-Date.now()),controller.signal)};}
          catch(error){return{ok:false as const,error};}
        };
        let result=await read();
        if (!current()) return;
        // A resumed read can join the refresh flight started before background.
        // If that flight now establishes transient backoff, allow exactly one
        // expedited successor within this check's original deadline. The auth
        // owner still rejects invalid/rotation/429 and rate-limited resets.
        const retryable=!result.ok||result.token===null||expiredAccountToken(result.token,userId);
        if(retryable&&wakeAttempt.requested&&!wakeAttempt.expedited&&Date.now()<deadline&&resumeAuthRefresh()){
          wakeAttempt.expedited=true;
          result=await read();
        }
        if (!current()) return;
        if(!result.ok)throw result.error;
        const token=result.token;
        if (!usableToken(token, userId)) { dropConnection(); return; }
        if (!connection || token !== connectionToken) {
          recoveryRequested = null;
          bind(token);
        } else if (recoveryRequested || !connection.getSocket()?.connected) {
          const pending=recoveryRequested;recoveryRequested = null;
          // The failed ACK belongs to one transport. A managed reconnect may
          // already have replaced it while this token check awaited storage.
          const recovery=pending?{...pending.options,replaceConnected:Boolean(pending.options.replaceConnected&&pending.socket&&pending.socket===connection.getSocket())}:undefined;
          connection.recover?.(recovery);
        }
      } catch {
        if (current() && !usableToken(connectionToken, userId)) dropConnection();
      }
    };
    const pending=work();checking = pending;
    try { await pending; } finally {
      if(checking===pending){checking = null;checkingWake=null;}
      if(checkController===controller)checkController=null;
    }
  }

  const foreground = () => Platform.OS === 'web' ? typeof document === 'undefined' || document.visibilityState !== 'hidden' : AppState.currentState === 'active';
  const pauseCheck=()=>{
    ++checkGeneration;checkController?.abort();checkController=null;checking=null;checkingWake=null;
    recoveryRequested=null;
  };
  const recover=(options:ManagedSocketRecovery={reason:'manual'})=>{
    if(!alive||!foreground())return;
    const wake=options.reason!=='subscription'?{expedited:resumeAuthRefresh()}:undefined;
    const socket=connection?.getSocket()??null;
    const replaceConnected=Boolean(socket&&(options.replaceConnected||recoveryRequested?.socket===socket&&recoveryRequested.options.replaceConnected));
    recoveryRequested={options:{...options,replaceConnected},socket};
    void checkToken(wake);
  };
  const interval = setInterval(() => { if (foreground()) void checkToken(); }, TOKEN_CHECK_INTERVAL_MS);
  const onVisibility = () => {if(foreground())recover({reason:'foreground'});else pauseCheck();};
  const appState = AppState.addEventListener('change', onVisibility);
  const onFocus = () => {if(foreground())recover({reason:'foreground'});};
  const onOnline = () => recover({reason:'online'});
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
  }
  void checkToken();

  return {
    getSocket: () => alive ? connection?.getSocket() ?? null : null,
    recover,
    disconnect() {
      if (!alive) return;
      alive = false;
      lifetime.abort();
      pauseCheck();
      clearInterval(interval);
      appState.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisibility);
      }
      dropConnection();
    },
  };
}
