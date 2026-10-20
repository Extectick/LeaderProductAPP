import { hasPriceReview, PRICE_REVIEW_CHOICES, PRICE_REVIEW_QUESTION } from '../src/features/clientOrders/lib/priceReview';

test('asks one short question with exactly the requested two choices', () => {
  expect(PRICE_REVIEW_QUESTION).toBe('Обновить цены?');
  expect(PRICE_REVIEW_CHOICES).toEqual([
    { label: 'Обновить', policy: 'USE_CURRENT' }, { label: 'Не изменять', policy: 'KEEP_DRAFT' },
  ]);
});
test.each([{ draftReview: { code: 'PRICE_REVIEW_REQUIRED' } },
  { submissionErrorDetails: { backendErrorCode: 'PRICE_REVIEW_REQUIRED' } },
  { offlineDraftStatus: 'PRICE_REVIEW' }])('recognizes price review from persisted order data: %j', order => {
  expect(hasPriceReview(order as any)).toBe(true);
});
test.each([null, undefined, {}, { draftReview: { code: 'STOCK_SHORTAGE' } }])('does not prompt for unrelated problems', order => {
  expect(hasPriceReview(order as any)).toBe(false);
});
test('does not mistake a stale local price status for the latest structured server error', () => {
  expect(hasPriceReview({ offlineDraftStatus: 'PRICE_REVIEW', submissionErrorDetails: { backendErrorCode: 'ORDER_CONTENT_CONFLICT' } } as any)).toBe(false);
});
