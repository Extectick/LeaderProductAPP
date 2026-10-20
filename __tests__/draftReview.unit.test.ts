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

const priceReview: any = { code: 'PRICE_REVIEW_REQUIRED', details: { items: [
  { productGuid: 'p', lineGuid: 'changed', oldPrice: 110, currentPrice: 120 },
] } };
test('highlights only the exact price-changed line, not every copy of its product', () => {
  const draft = { ...emptyDraft(), items: [
    { ...line('changed', '1'), lineGuid: 'CHANGED', basePrice: 110 },
    { ...line('other', '1'), lineGuid: 'other', basePrice: 110 },
  ] };
  expect(draftReviewItemMessages(draft, priceReview)).toEqual({ changed: ['Цена изменилась: 110 ₽ → 120 ₽'] });
});
test('matches legacy product-only price details and displays prices for the selected package', () => {
  const draft = { ...emptyDraft(), items: [{ ...line('pack', '1', 5), basePrice: 110 }] };
  const details = { ...priceReview, details: { items: [{ productGuid: 'P', oldPrice: 110, currentPrice: 120 }] } };
  expect(draftReviewItemMessages(draft, details)).toEqual({ pack: ['Цена изменилась: 550 ₽ → 600 ₽'] });
});
test.each([{ manualPrice: '115' }, { isCancelled: true }, { basePrice: 120 }, { basePrice: null }])(
  'does not highlight cancelled, manually priced, or already corrected rows: %j', patch => {
    const draft = { ...emptyDraft(), items: [{ ...line('changed', '1'), lineGuid: 'changed', basePrice: 110, ...patch }] };
    expect(draftReviewItemMessages(draft, priceReview)).toEqual({});
  });
test.each([null, {}, { productGuid: 'p', oldPrice: 'bad', currentPrice: 120 },
  { productGuid: 'p', oldPrice: 110, currentPrice: 110 }])('ignores invalid price details: %j', change => {
  const draft = { ...emptyDraft(), items: [{ ...line('a', '1'), basePrice: 110 }] };
  expect(draftReviewItemMessages(draft, { ...priceReview, details: { items: [change] } })).toEqual({});
});
