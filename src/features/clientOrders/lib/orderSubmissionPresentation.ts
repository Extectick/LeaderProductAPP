import type { ClientOrder, SubmittedOrderVersion } from '@/utils/clientOrdersService';
import { getClientOrderItemsCount } from './orderItems';

export function submittedVersionOf(order?: ClientOrder | null): SubmittedOrderVersion | null {
  if (order?.submittedVersion?.orderGuid) return order.submittedVersion;
  if (!order || order.origin === 'device' || (!order.number1c && !(order.queuedAt && ['QUEUED', 'SENT_TO_1C'].includes(order.status)))
    || !['QUEUED', 'SYNCED', 'ERROR'].includes(order.syncState)) return null;
  return { orderGuid: order.guid, clientRevision: order.clientRevision ?? null, number1c: order.number1c ?? null,
    isPostedIn1c: !!order.isPostedIn1c, status: order.status, syncState: order.syncState, revision: order.revision,
    totalAmount: order.totalAmount == null ? null : Number(order.totalAmount), itemsCount: getClientOrderItemsCount(order), updatedAt: order.updatedAt ?? '' };
}

/** Only status metadata may cross into a newer local edit, never server lines/token. */
export function preserveSubmittedVersion(local: ClientOrder, server?: ClientOrder | null): ClientOrder {
  if (!server || !((local.clientOrderId && (local.clientOrderId === server.clientOrderId || local.clientOrderId === `legacy-server:${server.guid}`)) || local.guid === server.guid)) return local;
  const version = submittedVersionOf(server) ?? submittedVersionOf(local);
  return version ? { ...local, submittedVersion: version } : local;
}

export function amendmentStatusLabel(order?: ClientOrder | null): string | null {
  if (!order || order.origin !== 'device') return null;
  const version = submittedVersionOf(order);
  if (!version) return null;
  const prefix = version.number1c ? 'В 1С' : 'В API';
  const status = String((order as any).offlineDraftStatus || 'ON_DEVICE');
  if (['NEEDS_EDIT', 'SEND_ERROR', 'PRICE_REVIEW'].includes(status)) return `${prefix} · изменения не отправлены`;
  if (['READY_TO_SEND', 'SENDING', 'API_ACCEPTED'].includes(status)) return `${prefix} · изменения в обработке`;
  return `${prefix} · есть изменения на телефоне`;
}

export function persistedOrderSubmissionError(order?: ClientOrder | null, options?: { includeSubmittedVersion?: boolean }): string | null {
  if (!order) return null;
  const failure = order.submissionErrorDetails;
  const review = order.draftReview;
  const code = failure?.backendErrorCode || review?.code;
  const details = failure?.errorDetails || review?.details;
  let message = failure?.message || review?.message || order.lastExportError || order.last1cError || null;
  if (code === 'ORDER_CONTENT_CONFLICT' || code === 'LEGACY_DRAFT_CONFLICT') {
    message = 'Версия заказа в 1С/на сервере изменилась. Ваши правки сохранены. Нажмите отправку, чтобы сравнить и согласовать изменения.';
  } else if (code === 'ORDER_CHANGE_REVIEW_REQUIRED') {
    const changes = Array.isArray(details?.changes) ? details.changes : [];
    message = `Нужно подтвердить уменьшение или удаление позиций.${changes.length ? '\n' + changes.map((line: any) => `${line.productName}: ${line.before} → ${line.after ?? 'удалено'}`).join('\n') : ''}\nНажмите отправку для согласования.`;
  } else if (code === 'STOCK_SHORTAGE') {
    const items = Array.isArray(details?.items) ? details.items : [];
    message = `Недостаточно остатка.${items.length ? '\n' + items.map((line: any) => `${line.name || 'Товар'}: нужно ${line.required}, доступно ${line.available}`).join('\n') : ''}\nПроверьте отмеченные позиции или повторите проверку отправкой.`;
  }
  if (!message) return null;
  if (details?.draftSaved === true) message = `Черновик сохранён. ${message}`;
  const version = submittedVersionOf(order);
  return options?.includeSubmittedVersion !== false && version?.number1c
    ? `Заказ уже в 1С: ${version.number1c}. Последние изменения не отправлены.\n${message}` : message;
}
