export const OFFLINE_SYNC_RETRY_MESSAGE = 'Не удалось загрузить данные';

/** A preparation error; the original details are retained in diagnostics only. */
export class OfflineSyncError extends Error {}

export function offlineSyncErrorMessage(_error: unknown): string {
  // Native exceptions, SQL, server payloads and unknown errors are diagnostic
  // details, not UI copy. Keep the previous snapshot and offer a manual retry.
  return OFFLINE_SYNC_RETRY_MESSAGE;
}
