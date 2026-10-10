import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { backupClientOrderDraft, type ClientOrder } from '@/utils/clientOrdersService';
import { getServerStatus } from '@/src/shared/network/serverStatus';

type Entry = { clientOrderId: string; clientRevision: number; payload: object; order: ClientOrder };

/** Recovery copies only. This hook cannot submit orders or mutate the SQLite queue. */
export function useDraftBackups(userId: string, entries: Entry[], enabled: boolean) {
  const entriesRef = React.useRef(entries);
  entriesRef.current = entries;
  const scheduleRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    if (!enabled || userId === 'anonymous') return;
    const storageKey = `client-order-backup-acks:v1:${userId}`;
    let cancelled = false;
    let busy = false;
    let ready = false;
    let retryAfter = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let acks: Record<string, number> = {};
    const blocked = new Map<string, number>();
    const schedule = (delay = 1500) => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), Math.max(delay, retryAfter - Date.now()));
    };
    const flush = async () => {
      if (cancelled || busy || !ready) return;
      if (!entriesRef.current.length) return;
      if (!getServerStatus().isReachable || (AppState.currentState && AppState.currentState !== 'active')) return;
      busy = true;
      try {
        for (const entry of entriesRef.current) {
          if (cancelled || !getServerStatus().isReachable) break;
          if ((acks[entry.clientOrderId] || 0) >= entry.clientRevision
            || blocked.get(entry.clientOrderId) === entry.clientRevision) continue;
          try {
            const result = await backupClientOrderDraft(entry.clientOrderId, entry.clientRevision, entry.payload, entry.order);
            if (cancelled) return;
            acks[entry.clientOrderId] = result.clientRevision;
          } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 409 || status === 400 || status === 413) blocked.set(entry.clientOrderId, entry.clientRevision);
            else { retryAfter = Date.now() + 30_000; break; }
          }
        }
        if (!cancelled) {
          const ids = new Set(entriesRef.current.map(entry => entry.clientOrderId));
          acks = Object.fromEntries(Object.entries(acks).filter(([id]) => ids.has(id)));
          await AsyncStorage.setItem(storageKey, JSON.stringify(acks));
        }
      } catch { /* Ack cache is disposable. The durable order stays in SQLite. */ }
      finally {
        busy = false;
        if (entriesRef.current.some(entry => (acks[entry.clientOrderId] || 0) < entry.clientRevision
          && blocked.get(entry.clientOrderId) !== entry.clientRevision)) schedule(30_000);
      }
    };
    const request = () => schedule();
    scheduleRef.current = request;
    void AsyncStorage.getItem(storageKey).then(raw => {
      try {
        const value = raw ? JSON.parse(raw) : {};
        acks = Object.fromEntries(Object.entries(value || {}).filter(([, revision]) => Number.isSafeInteger(revision) && Number(revision) > 0)) as Record<string, number>;
      } catch { acks = {}; }
    }).catch(() => {}).finally(() => { ready = true; schedule(); });
    const subscription = typeof AppState.addEventListener === 'function'
      ? AppState.addEventListener('change', state => { if (state === 'active') schedule(); }) : null;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (scheduleRef.current === request) scheduleRef.current = null;
      subscription?.remove();
    };
  }, [enabled, userId]);
  React.useEffect(() => { scheduleRef.current?.(); }, [entries]);
}
