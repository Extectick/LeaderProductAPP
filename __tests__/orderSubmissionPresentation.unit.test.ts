import { amendmentStatusLabel, persistedOrderSubmissionError, preserveSubmittedVersion, submittedVersionOf } from '../src/features/clientOrders/lib/orderSubmissionPresentation';

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
