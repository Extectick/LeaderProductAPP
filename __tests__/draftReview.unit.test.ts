import { draftReviewItemMessages, reviewFromError } from '../src/features/clientOrders/lib/draftReview';
import { emptyDraft } from '../src/features/clientOrders/clientOrdersShared';

const review: any = { code: 'STOCK_SHORTAGE', warehouseGuid: 'warehouse', details: { items: [{ productGuid: 'p', available: 9 }] } };
const line = (key: string, quantity: string, multiplier = 1): any => ({ key, productGuid: 'p', quantity,
  packageGuid: 'pack', packages: [{ guid: 'pack', multiplier }], isCancelled: false });
test('aggregates the same product across packages and highlights every affected line', () => {
  const draft = { ...emptyDraft(), warehouseGuid: 'warehouse', items: [line('a', '2', 3), line('b', '4')] };
  expect(draftReviewItemMessages(draft, review)).toEqual({ a: [expect.stringContaining('не хватает 1')], b: [expect.stringContaining('не хватает 1')] });
});
test('removes obsolete warnings after quantity correction or warehouse change; excludes cancelled lines', () => {
  const draft = { ...emptyDraft(), warehouseGuid: 'warehouse', items: [line('a', '9'), { ...line('b', '10'), isCancelled: true }] };
  expect(draftReviewItemMessages(draft, review)).toEqual({});
  expect(draftReviewItemMessages({ ...draft, warehouseGuid: 'other' }, review)).toEqual({});
});
test('tolerates malformed details and preserves structured backend errors', () => {
  const draft = { ...emptyDraft(), warehouseGuid: 'warehouse', items: [line('a', '12')] };
  expect(draftReviewItemMessages(draft, { ...review, details: { items: {} } })).toEqual({});
  expect(reviewFromError({ backendErrorCode: 'STOCK_SHORTAGE', message: 'Stock', errorDetails: review.details }, 'warehouse'))
    .toMatchObject({ code: 'STOCK_SHORTAGE', details: review.details, warehouseGuid: 'warehouse' });
});
