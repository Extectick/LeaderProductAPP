import type { ClientOrder, SubmittedOrderVersion } from '@/utils/clientOrdersService';
import { submissionHash } from '../offline/orderSubmissionProtocol';
import { getClientOrderItemsCount } from './orderItems';

// Packets are immutable in the outbox and in the hydrated draft list.
const inputHashes = new WeakMap<object, string>();
export function orderBusinessInputHash(payload?: Record<string, unknown> | null): string | undefined {
  if (!payload || !Array.isArray(payload.items) || !payload.items.length) return undefined;
  const cached = inputHashes.get(payload);
  if (cached) return cached;
  if (!payload.items.every(item => item?.lineGuid && item?.productGuid)) return undefined;
  // Keep all commercial fields, including future fields and line order. Exclude
  // submission metadata, which differs even between identical SAVE and SUBMIT.
  const { clientRevision, intent, integrity, geoEvents, saveReason, legacyServerGuid,
    legacyServerRevision, ...content } = payload;
  const hash = submissionHash({ ...content, offlineReview: { pricePolicy: 'ASK', ...(payload.offlineReview || {}) } });
  inputHashes.set(payload, hash);
  return hash;
}

export function submittedVersionOf(order?: ClientOrder | null): SubmittedOrderVersion | null {
  if (order?.submittedVersion?.orderGuid) return order.submittedVersion;
  if (!order || order.origin === 'device' || (!order.number1c && !(order.queuedAt && ['QUEUED', 'SENT_TO_1C'].includes(order.status)))
    || !['QUEUED', 'SYNCED', 'ERROR'].includes(order.syncState)) return null;
  const receipt = order.acceptedClientOperation;
  const fingerprint = order.acceptedInputFingerprint;
  const inputHash = receipt?.intent === 'SUBMIT' && receipt.clientRevision === order.clientRevision
    ? orderBusinessInputHash(receipt.payload)
    : fingerprint && fingerprint.orderGuid === order.guid && fingerprint.clientRevision === order.clientRevision
      ? fingerprint.hash : undefined;
  return { ...(inputHash ? {businessInputHash: inputHash} : {}), orderGuid: order.guid, clientRevision: order.clientRevision ?? null, number1c: order.number1c ?? null,
    isPostedIn1c: !!order.isPostedIn1c, status: order.status, syncState: order.syncState, revision: order.revision,
    totalAmount: order.totalAmount == null ? null : Number(order.totalAmount), itemsCount: getClientOrderItemsCount(order), updatedAt: order.updatedAt ?? '' };
}

/** Only status metadata may cross into a newer local edit, never server lines/token. */
export function preserveSubmittedVersion(local: ClientOrder, server?: ClientOrder | null, payload?: Record<string, unknown>): ClientOrder {
  const previous = submittedVersionOf(local);
  if (server && !((local.clientOrderId && (local.clientOrderId === server.clientOrderId || local.clientOrderId === `legacy-server:${server.guid}`)) || local.guid === server.guid)) return local;
  const latest = submittedVersionOf(server) ?? previous;
  if (!latest) return local;
  const sameRevision = previous?.orderGuid === latest.orderGuid && previous.clientRevision === latest.clientRevision;
  const hash = latest.businessInputHash || (sameRevision ? previous?.businessInputHash : undefined);
  const version = hash && !latest.businessInputHash ? {...latest, businessInputHash: hash} : latest;
  return { ...local, submittedVersion: version, ...(payload ? {localInputHash: orderBusinessInputHash(payload)} : {}) };
}

export function amendmentStatusLabel(order?: ClientOrder | null): string | null {
  if (!order || order.origin !== 'device') return null;
  const version = submittedVersionOf(order);
  if (!version) return null;
  const prefix = version.number1c ? (version.isPostedIn1c ? 'Проведён в 1С' : 'Сохранён в 1С') : 'В API';
  const status = String((order as any).offlineDraftStatus || 'ON_DEVICE');
  if (['NEEDS_EDIT', 'SEND_ERROR', 'PRICE_REVIEW'].includes(status)) return `${prefix} · изменения не отправлены`;
  if (['READY_TO_SEND', 'SENDING', 'API_ACCEPTED'].includes(status)) return `${prefix} · изменения в обработке`;
  if (!version.businessInputHash || !order.localInputHash) return `${prefix} · локальная копия не сверена`;
  return version.businessInputHash === order.localInputHash ? prefix : `${prefix} · есть изменения на телефоне`;
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
  if (options?.includeSubmittedVersion === false || !version?.number1c) return message;
  // A confirmed write can still carry a posting error. That does not mean its
  // contents were rejected or that a newer local amendment exists.
  if (order.origin !== 'device' && order.syncState === 'SYNCED'
    && !order.lastExportError && !failure && !review) {
    return `Заказ сохранён в 1С: ${version.number1c}.\n${message}`;
  }
  return `Заказ уже в 1С: ${version.number1c}. Последние изменения не отправлены.\n${message}`;
}
