import { NativeModules, Platform } from 'react-native';
import type { AppErrorScreen, NativeAppErrorRecord } from './appErrorPayload';

interface NativeStore {
  setIdentity(id: string): void;
  setRuntime(runtime: string, update: string): void;
  setScreen(screen: string): void;
  pending(owner: string): Promise<string>;
  acknowledge(owner: string, id: string): Promise<void>;
}

function nativeStore(): NativeStore | undefined {
  return Platform.OS === 'android' ? NativeModules.LeaderAppErrors : undefined;
}

export function updateNativeAppErrorIdentity(id: number | null) {
  try { nativeStore()?.setIdentity(id ? String(id) : ''); } catch { /* Optional on older APKs. */ }
}

export function updateNativeAppErrorRuntime(runtime: string, update: string) {
  try { nativeStore()?.setRuntime(runtime, update); } catch { /* Reporting is best effort. */ }
}

export function updateNativeAppErrorScreen(screen: AppErrorScreen) {
  try { nativeStore()?.setScreen(screen); } catch { /* Reporting is best effort. */ }
}

export async function drainNativeAppErrors(ownerId: number): Promise<void> {
  try {
    const store = nativeStore();
    if (!store || !Number.isSafeInteger(ownerId) || ownerId <= 0) return;
    const owner = String(ownerId);
    const records: NativeAppErrorRecord[] = JSON.parse(await store.pending(owner));
    const { queueNativeAppErrorReport } = require('./appErrorDelivery') as typeof import('./appErrorDelivery');
    for (const record of records) {
      if (record.ownerId === owner && await queueNativeAppErrorReport(record)) {
        await store.acknowledge(owner, record.eventId);
      }
    }
  } catch { /* Leave any unacknowledged records in the native store for retry. */ }
}
