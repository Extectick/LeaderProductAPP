import type { ClientOrderAmendmentReview } from '@/utils/clientOrdersService';

/** A cached confirmation expires and can target another server version. Always
 * obtain a fresh preview AFTER all geo/price/line fields of the proposal are set. */
export async function prepareOrderAmendment<T extends Record<string, any>>(options: {
  clientOrderId: string; payload: T; clientRevision: number; required: boolean; online: boolean;
  read: (id: string, payload: any) => Promise<ClientOrderAmendmentReview>;
  confirm: (review: ClientOrderAmendmentReview) => Promise<boolean>;
}): Promise<T | null> {
  if (!options.required) return options.payload;
  if (!options.online) throw new Error('Для согласования изменений уже отправленного заказа нужна связь. Все правки сохранены на телефоне.');
  const packet = { ...options.payload, clientRevision: options.clientRevision, intent: 'SUBMIT',
    offlineReview: options.payload.offlineReview ?? { pricePolicy: 'ASK' } };
  const review = await options.read(options.clientOrderId, packet);
  if (!review || !/^[a-f0-9]{64}$/.test(review.baseContentToken) || !Array.isArray(review.changes)
    || !review.orderGuid || !Number.isInteger(review.serverRevision) || review.serverRevision < 1) throw new Error('Не удалось проверить актуальную версию. Правки сохранены.');
  if ((review.requiresConfirmation || review.confirmationToken) && !await options.confirm(review)) return null;
  return { ...options.payload, offlineReview: packet.offlineReview,
    integrity: { baseContentToken: review.baseContentToken, ...(review.confirmationToken ? { confirmationToken: review.confirmationToken } : {}) } };
}
