import type { ClientOrder } from '@/utils/clientOrdersService';
import { getPackageMultiplier, normalizeQuantityForPayload, type DraftOrder } from '../clientOrdersShared';

export function reviewFromError(error: unknown, warehouseGuid?: string | null): ClientOrder['draftReview'] {
  const value = error as { backendErrorCode?: string; message?: string; errorDetails?: any };
  if (!['STOCK_SHORTAGE', 'REFERENCE_STALE', 'PRICE_REVIEW_REQUIRED'].includes(value?.backendErrorCode || '')) return null;
  return { code: value.backendErrorCode!, message: value.message || 'Заказ требует проверки',
    warehouseGuid, checkedAt: new Date().toISOString(), details: value.errorDetails };
}

export function draftReviewItemMessages(draft: DraftOrder, review: ClientOrder['draftReview']) {
  const messages: Record<string, string[]> = {};
  if (review?.code !== 'STOCK_SHORTAGE' || review.warehouseGuid !== draft.warehouseGuid) return messages;
  for (const shortage of Array.isArray(review.details?.items) ? review.details.items : []) {
    if (!shortage || typeof shortage.productGuid !== 'string' || shortage.available == null) continue;
    const lines = draft.items.filter(item => !item.isCancelled && item.productGuid?.toLowerCase() === shortage.productGuid.toLowerCase());
    const required = lines.reduce((sum, item) => sum + normalizeQuantityForPayload(item) * getPackageMultiplier(item), 0);
    const available = Number(shortage.available);
    if (!Number.isFinite(available) || !Number.isFinite(required) || required <= available + 0.0001) continue;
    const format = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
    const message = `Заказано ${format(required)}, доступно ${format(available)}, не хватает ${format(required - available)} (в базовых единицах).`;
    for (const item of lines) messages[item.key] = [message];
  }
  return messages;
}
