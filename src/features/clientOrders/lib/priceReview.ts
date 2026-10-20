import type { ClientOrder } from '@/utils/clientOrdersService';

export type PriceReviewChoice = 'USE_CURRENT' | 'KEEP_DRAFT';
export const PRICE_REVIEW_QUESTION = 'Обновить цены?';
export const PRICE_REVIEW_CHOICES = [
  { label: 'Обновить', policy: 'USE_CURRENT' },
  { label: 'Не изменять', policy: 'KEEP_DRAFT' },
] as const;

export function hasPriceReview(order?: (ClientOrder & { offlineDraftStatus?: string }) | null) {
  const code = order?.submissionErrorDetails?.backendErrorCode || order?.draftReview?.code;
  return code ? code === 'PRICE_REVIEW_REQUIRED' : order?.offlineDraftStatus === 'PRICE_REVIEW';
}
