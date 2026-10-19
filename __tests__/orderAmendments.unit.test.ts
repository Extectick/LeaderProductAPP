import { prepareOrderAmendment } from '../src/features/clientOrders/lib/orderAmendmentReview';
import { amendmentStatusLabel, persistedOrderSubmissionError, preserveSubmittedVersion } from '../src/features/clientOrders/lib/orderSubmissionPresentation';
import { emptyDraft, getClientOrderDisplayNumber, getOrderDisplayStatusLabel, validateDraft, buildNewItem } from '../src/features/clientOrders/clientOrdersShared';
import { draftReviewItemMessages, reviewFromError } from '../src/features/clientOrders/lib/draftReview';
const accepted: any = { guid: 'order-guid', clientOrderId: 'client-id-123', clientRevision: 29, revision: 3,
  source: 'MANAGER_APP', origin: 'merged', syncState: 'SYNCED', status: 'CONFIRMED', number1c: 'НОУТ-126165', isPostedIn1c: true,
  totalAmount: 36548, items: Array.from({ length: 16 }, () => ({})) };
const local: any = { ...accepted, origin: 'device', number1c: null, status: 'DRAFT', syncState: 'DRAFT',
  clientRevision: 30, offlineDraftStatus: 'NEEDS_EDIT', contentToken: 'old-base', totalAmount: 43028, items: Array.from({ length: 19 }, () => ({})),
  submissionErrorDetails: { backendErrorCode: 'ORDER_CONTENT_CONFLICT', message: 'Старая версия', errorDetails: { kind: 'ORDER_CONTENT_CONFLICT' } } };
test('shows accepted 16 lines and pending 19 as independent facts, never replaces edits with old ACK', () => {
  const merged = preserveSubmittedVersion(local, accepted);
  expect(merged).toMatchObject({ clientRevision: 30, contentToken: 'old-base', totalAmount: 43028,
    submittedVersion: { clientRevision: 29, number1c: 'НОУТ-126165', itemsCount: 16, totalAmount: 36548 } });
  expect(merged.items).toHaveLength(19);
  expect(amendmentStatusLabel(merged)).toBe('В 1С · изменения не отправлены');
  expect(getOrderDisplayStatusLabel(merged)).toBe('В 1С · изменения не отправлены');
  expect(getClientOrderDisplayNumber(merged)).toBe('НОУТ-126165');
  expect(persistedOrderSubmissionError(merged)).toContain('Заказ уже в 1С: НОУТ-126165');
  expect(persistedOrderSubmissionError(merged)).toContain('сравнить и согласовать');
});
test('never attaches another order or labels API acceptance as posting in 1C', () => {
  expect(preserveSubmittedVersion(local, { ...accepted, guid: 'other', clientOrderId: 'other' })).toBe(local);
  expect(amendmentStatusLabel(local)).toBeNull();
  const merged = preserveSubmittedVersion(local, { ...accepted, number1c: null, submittedVersion: { orderGuid: 'order-guid', number1c: null } });
  expect(amendmentStatusLabel(merged)).toBe('В API · изменения не отправлены');
});
test('persists the explanation after reopen and highlights the exact decreased line', () => {
  const error = { backendErrorCode: 'ORDER_CHANGE_REVIEW_REQUIRED', message: 'Подтверждение', errorDetails: {
    kind: 'ORDER_CHANGE_REVIEW_REQUIRED', changes: [{ lineGuid: 'chips', productName: 'Чипсы', before: 2, after: 1 }] } };
  expect(reviewFromError(error)?.code).toBe('ORDER_CHANGE_REVIEW_REQUIRED');
  expect(persistedOrderSubmissionError({ ...local, submissionErrorDetails: error })).toContain('Чипсы: 2 → 1');
  expect(draftReviewItemMessages({ items: [{ key: 'key', lineGuid: 'chips' }] } as any, reviewFromError(error)))
    .toEqual({ key: [expect.stringContaining('2 → 1')] });
});
test('stock rejection names the item and does not require an unrelated field highlight', () => {
  expect(persistedOrderSubmissionError({ ...local, submissionErrorDetails: { backendErrorCode: 'STOCK_SHORTAGE',
    errorDetails: { items: [{ name: 'Чипсы', required: 1, available: 0 }] } } })).toContain('Чипсы: нужно 1, доступно 0');
});

test('retains confirmed draft preservation alongside shortage details, without inventing an API save', () => {
  const shortage: any = { backendErrorCode: 'STOCK_SHORTAGE', errorDetails: {
    draftSaved: true, items: [{ name: 'Чипсы', required: 2, available: 1 }] } };
  const saved = persistedOrderSubmissionError({ ...local, submissionErrorDetails: shortage });
  expect(saved).toContain('Черновик сохранён');
  expect(saved).toContain('Чипсы: нужно 2, доступно 1');
  expect(persistedOrderSubmissionError({ ...local, submissionErrorDetails: {
    ...shortage, errorDetails: { ...shortage.errorDetails, draftSaved: false } } })).not.toContain('Черновик сохранён');
});
test('an accepted amendment can explicitly recheck zero cached stock without disabling the submit action', () => {
  const draft = { ...emptyDraft(), organizationGuid: 'org', counterpartyGuid: 'cp', agreementGuid: 'agreement', contractGuid: 'contract',
    warehouseGuid: 'warehouse', deliveryAddressGuid: 'address', deliveryDate: '2026-10-20',
    items: [{ ...buildNewItem({ guid: 'p', name: 'Чипсы', basePrice: 900 } as any), quantity: '1', stock: { available: 0 } }] };
  expect(validateDraft(draft).canSubmit).toBe(false);
  expect(validateDraft(draft, { recheckStock: true }).canSubmit).toBe(true);
});
describe('explicit fresh amendment confirmation', () => {
  const payload = { items: [{ lineGuid: 'chips', quantity: 1 }], geoEvents: [{ clientEventId: 'event-123' }],
    integrity: { baseContentToken: 'old', confirmationToken: 'expired' } };
  const review: any = { orderGuid: 'order-guid', serverRevision: 3, number1c: 'НОУТ-126039', baseContentToken: 'a'.repeat(64),
    confirmationToken: 'fresh-challenge', requiresConfirmation: true,
    changes: [{ productName: 'Чипсы', reason: 'Количество', before: 2, after: 1 }] };
  const read = jest.fn(), confirm = jest.fn();
  beforeEach(() => { read.mockReset().mockResolvedValue(review); confirm.mockReset().mockResolvedValue(true); });
  const options = () => ({ clientOrderId: 'client-id', clientRevision: 3, payload, required: true, online: true, read, confirm });
  it('uses fresh server state and binds the final geo/price/line input without modifying the saved packet', async () => {
    const prepared: any = await prepareOrderAmendment(options());
    expect(read).toHaveBeenCalledWith('client-id', expect.objectContaining({ geoEvents: payload.geoEvents, clientRevision: 3, intent: 'SUBMIT', offlineReview: { pricePolicy: 'ASK' } }));
    expect(confirm).toHaveBeenCalledWith(review);
    expect(prepared.integrity).toEqual({ baseContentToken: review.baseContentToken, confirmationToken: 'fresh-challenge' });
    expect(payload.integrity.confirmationToken).toBe('expired');
  });
  it('does not enqueue after cancellation, offline failure or malformed preview', async () => {
    confirm.mockResolvedValue(false);
    expect(await prepareOrderAmendment(options())).toBeNull();
    await expect(prepareOrderAmendment({ ...options(), online: false })).rejects.toThrow('правки сохранены');
    read.mockResolvedValue({ ...review, baseContentToken: 'bad' });
    await expect(prepareOrderAmendment(options())).rejects.toThrow('Правки сохранены');
  });
  it('leaves the initial new-order fast background path alone', async () => {
    expect(await prepareOrderAmendment({ ...options(), required: false })).toBe(payload);
    expect(read).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
  });
});
