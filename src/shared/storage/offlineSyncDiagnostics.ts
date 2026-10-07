import { captureException } from '@/src/shared/monitoring';
import { SQLiteReloadingError } from './sqliteLifecycle';

type SyncContext = { stage: string; entity?: string };
const contexts = new WeakMap<Error, SyncContext>();
const reported = new WeakSet<Error>();
const lastReports = new Map<string, number>();

/** Keep the original native exception/stack; attach only non-business metadata. */
export async function offlineSyncStage<T>(context: SyncContext, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    if (!contexts.has(error)) contexts.set(error, context);
    throw error;
  }
}

export function reportOfflineSyncFailure(cause: unknown, fallback: SyncContext) {
  if (cause instanceof SQLiteReloadingError) return;
  const error = cause instanceof Error ? cause : new Error(String(cause));
  if (reported.has(error)) return;
  reported.add(error);
  const context = contexts.get(error) ?? fallback;
  const key = `${context.stage}:${context.entity ?? ''}`;
  const now = Date.now();
  if (now - (lastReports.get(key) ?? 0) < 60_000) return;
  lastReports.set(key, now);
  // Monitoring scrubs exception text. Do not include rows, SQL parameters,
  // counterparty details, credentials or complete network responses.
  try {
    captureException(error, { tags: { offline_sync_stage: context.stage, offline_sync_entity: context.entity ?? 'catalog' } });
  } catch { /* Reporting must not interrupt retries or mask the original error. */ }
}
