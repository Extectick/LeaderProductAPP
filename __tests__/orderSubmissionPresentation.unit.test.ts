import { orderBusinessInputHash, amendmentStatusLabel, persistedOrderSubmissionError, preserveSubmittedVersion, submittedVersionOf } from '../src/features/clientOrders/lib/orderSubmissionPresentation';

const summary: any = { guid: 'api-order', clientOrderId: 'phone-id', clientRevision: 3, origin: 'local',
  number1c: 'НОУТ-127336', syncState: 'SYNCED', status: 'CONFIRMED', revision: 7, isPostedIn1c: true,
  totalAmount: 49325.2, itemsCount: 2, updatedAt: '2026-10-21T08:52:37Z' };

test('a confirmed save with a posting error does not claim changes were not sent', () => {
  const order: any = { ...summary, status: 'SENT_TO_1C', isPostedIn1c: false,
    lastExportError: null, last1cError: 'Документ сохранен в 1С, но не проведен.' };
  expect(persistedOrderSubmissionError(order)).toBe(
    'Заказ сохранён в 1С: НОУТ-127336.\nДокумент сохранен в 1С, но не проведен.'
  );
  expect(persistedOrderSubmissionError(order, { includeSubmittedVersion: false })).toBe(order.last1cError);
});

test('a rejected newer local amendment stays separate from its saved original', () => {
  const order: any = { ...summary, origin: 'device', clientRevision: 4, offlineDraftStatus: 'NEEDS_EDIT',
    submittedVersion: submittedVersionOf(summary),
    submissionErrorDetails: { message: 'Проверьте изменённые строки.' } };
  expect(persistedOrderSubmissionError(order)).toBe(
    'Заказ уже в 1С: НОУТ-127336. Последние изменения не отправлены.\nПроверьте изменённые строки.'
  );
});

test('an export failure is not represented as a confirmed save', () => {
  const order: any = { ...summary, status: 'QUEUED', syncState: 'QUEUED',
    lastExportError: 'Результат сохранения изменений не подтверждён.' };
  expect(persistedOrderSubmissionError(order)).not.toContain('Заказ сохранён в 1С');
  expect(persistedOrderSubmissionError(order)).toContain(order.lastExportError);
});

test('uses the explicit row count in list summaries without loading or replacing document lines', () => {
  expect(submittedVersionOf(summary)?.itemsCount).toBe(2);
  const local: any = { guid: 'device-local', clientOrderId: 'phone-id', origin: 'device',
    localDraft: { comment: 'Unsent edit', items: [{ quantity: '1,' }] }, items: [] };
  const combined = preserveSubmittedVersion(local, summary);
  expect(combined.submittedVersion?.itemsCount).toBe(2);
  expect(combined.localDraft).toBe(local.localDraft);
  expect(combined.items).toBe(local.items);
});

test('distinguishes a posted original order from its unsent amendment', () => {
  const order: any = { origin: 'device', offlineDraftStatus: 'NEEDS_EDIT', submittedVersion: submittedVersionOf(summary) };
  expect(amendmentStatusLabel(order)).toBe('Проведён в 1С · изменения не отправлены');
  order.submittedVersion.isPostedIn1c = false;
  expect(amendmentStatusLabel(order)).toBe('Сохранён в 1С · изменения не отправлены');
});

test('retains an explicit zero and counts only active rows when no summary count exists', () => {
  expect(submittedVersionOf({ ...summary, itemsCount: 0 })?.itemsCount).toBe(0);
  expect(submittedVersionOf({ ...summary, itemsCount: undefined, items: [
    { product: { guid: 'active-product' }, isCancelled: false },
    { product: { guid: 'cancelled-product' }, isCancelled: true },
  ] })?.itemsCount).toBe(1);
});

describe('НОУТ-143185: compare the saved order with the accepted commercial input', () => {
  const items = Array.from({length: 20}, (_, i) => ({
    lineGuid: 'line-' + i, productGuid: 'product-' + i, quantity: i + 1, basePrice: 42, priceTypeGuid: 'retail',
  }));
  const packet = {items, currency: 'RUB', contractGuid: 'contract', invoiceRequested: false};
  const accepted = {...packet, clientRevision: 25, intent: 'SUBMIT', saveReason: 'manual',
    geoEvents: ['CREATED', 'SUBMITTED'], offlineReview: {pricePolicy: 'ASK'}};
  const draft = {...packet, clientRevision: 26, intent: 'SAVE', saveReason: 'autosave',
    integrity: {baseContentToken: 'token'}, geoEvents: ['SUBMITTED']};
  const saved = {...summary, clientRevision: 25, isPostedIn1c: false, status: 'SENT_TO_1C',
    acceptedInputFingerprint: {orderGuid: summary.guid, clientRevision: 25, hash: orderBusinessInputHash(accepted)}};
  const device: any = {guid: 'device-local', clientOrderId: summary.clientOrderId, origin: 'device',
    clientRevision: 26, offlineDraftStatus: 'ON_DEVICE'};

  it('shows the saved receipt for changes to metadata alone, including before posting', () => {
    expect(amendmentStatusLabel(preserveSubmittedVersion(device, saved, draft))).toBe('Сохранён в 1С');
    const posted = {...summary, clientRevision: 25, acceptedClientOperation: {intent: 'SUBMIT', clientRevision: 25, payload: accepted}};
    expect(amendmentStatusLabel(preserveSubmittedVersion(device, posted, draft))).toBe('Проведён в 1С');
  });

  it.each([
    {...draft, contractGuid: 'changed'},
    {...draft, invoiceRequested: true},
    {...draft, items: items.map((line, i) => i ? line : {...line, quantity: 8})},
    {...draft, items: items.map((line, i) => i ? line : {...line, basePrice: 45})},
    {...draft, items: items.map((line, i) => i ? line : {...line, priceTypeGuid: null})},
    {...draft, items: [...items].reverse()},
  ])('detects commercial edits even with the same number of lines', changed => {
    expect(amendmentStatusLabel(preserveSubmittedVersion(device, saved, changed))).toBe('Сохранён в 1С · есть изменения на телефоне');
  });

  it('keeps evidence with the same accepted order and revision across status updates', () => {
    const local = preserveSubmittedVersion(device, saved, draft);
    const refreshed = preserveSubmittedVersion(local, {...summary, clientRevision: 25}, draft);
    expect(amendmentStatusLabel(refreshed)).toBe('Проведён в 1С');
    const newer = preserveSubmittedVersion(local, {...summary, clientRevision: 27}, draft);
    expect(amendmentStatusLabel(newer)).toBe('Проведён в 1С · локальная копия не сверена');
    const other = preserveSubmittedVersion(device, {...saved, acceptedInputFingerprint: {...saved.acceptedInputFingerprint, orderGuid: 'wrong'}}, draft);
    expect(amendmentStatusLabel(other)).toBe('Сохранён в 1С · локальная копия не сверена');
    expect(amendmentStatusLabel(preserveSubmittedVersion(device, saved, {items: []}))).toBe('Сохранён в 1С · локальная копия не сверена');
  });

  it.each([['READY_TO_SEND', 'изменения в обработке'], ['SEND_ERROR', 'изменения не отправлены']])('preserves %s', (status, label) => {
    expect(amendmentStatusLabel(preserveSubmittedVersion({...device, offlineDraftStatus: status}, saved, draft))).toBe(`Сохранён в 1С · ${label}`);
  });
});
