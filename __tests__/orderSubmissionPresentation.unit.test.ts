import { amendmentStatusLabel, preserveSubmittedVersion, submittedVersionOf } from '../src/features/clientOrders/lib/orderSubmissionPresentation';

const summary: any = { guid: 'api-order', clientOrderId: 'phone-id', clientRevision: 3, origin: 'local',
  number1c: 'НОУТ-127336', syncState: 'SYNCED', status: 'CONFIRMED', revision: 7, isPostedIn1c: true,
  totalAmount: 49325.2, itemsCount: 2, updatedAt: '2026-10-21T08:52:37Z' };

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
