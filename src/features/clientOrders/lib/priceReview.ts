import type { ClientOrder } from '@/utils/clientOrdersService';

export type PriceReviewChoice = 'USE_CURRENT' | 'KEEP_DRAFT';
export const PRICE_REVIEW_QUESTION = 'Обновить цены?';
export const PRICE_REVIEW_CHOICES = [
  { label: 'Обновить', policy: 'USE_CURRENT' },
  { label: 'Не изменять', policy: 'KEEP_DRAFT' },
] as const;

export type PriceReviewPrompt = { title: string; message?: string; choices: ReadonlyArray<{ label: string; policy: PriceReviewChoice }> };

export function priceReviewPrompt(orders: Array<ClientOrder | null | undefined>): PriceReviewPrompt {
  const details = orders.filter(hasPriceReview).map(order => order?.submissionErrorDetails?.errorDetails ?? order?.draftReview?.details);
  const missing = details.flatMap(detail => (Array.isArray(detail?.items) ? detail.items : []).filter((item: any) =>
    item.priceAvailable === false || item.currentPrice == null || !Number.isFinite(Number(item.currentPrice)) || Number(item.currentPrice) <= 0));
  const canUpdate = !missing.length && !details.some(detail => detail?.canUseCurrent === false);
  const canKeep = !details.some(detail => detail?.canKeepDraft === false);
  const names = [...new Set(missing.map((item: any) => item.productName || 'Товар'))];
  return {
    title: canUpdate ? PRICE_REVIEW_QUESTION : 'Актуальная цена не получена',
    message: canUpdate ? undefined : `${names.slice(0, 8).join('\n')}${names.length > 8 ? '\nИ другие позиции.' : ''}\nНулевые цены не будут применены. Можно явно оставить цены заказа или вернуться и выбрать другой вид цены.`,
    choices: PRICE_REVIEW_CHOICES.filter(choice => choice.policy === 'USE_CURRENT' ? canUpdate : canKeep)
      .map(choice => ({ ...choice, label: !canUpdate && choice.policy === 'KEEP_DRAFT' ? 'Оставить цены заказа' : choice.label })),
  };
}

export function hasPriceReview(order?: (ClientOrder & { offlineDraftStatus?: string }) | null) {
  const code = order?.submissionErrorDetails?.backendErrorCode || order?.draftReview?.code;
  return code ? code === 'PRICE_REVIEW_REQUIRED' : order?.offlineDraftStatus === 'PRICE_REVIEW';
}
