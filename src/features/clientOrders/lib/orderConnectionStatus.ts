import type {PaginationMeta} from '@/utils/clientOrdersService';
import {isNetworkUnavailableError, ONEC_CONNECTION_UNAVAILABLE_MESSAGE, toUserErrorMessage} from '@/src/shared/errors/userErrorMessage';

/** undefined preserves the previous read outcome; null is confirmed recovery.
 * Pending/local data is not evidence of either a new outage or recovery. */
export function orderConnectionReadUpdate(meta: PaginationMeta): string | null | undefined {
  const source = meta.liveSource;
  if (source?.status === 'ok' && !meta.readState) return null;
  if (source?.status && !['pending', 'ok'].includes(source.status)) {
    return isNetworkUnavailableError(source.message)
      ? ONEC_CONNECTION_UNAVAILABLE_MESSAGE
      : toUserErrorMessage(source.message, 'Не удалось обновить документы из 1С.');
  }
  const read = meta.readState;
  if (read?.source === 'verified-snapshot' && read.checkedAt && !read.stale && !read.verificationRequired) return null;
  return undefined;
}
