import { mergeOrderState, matchesDeliveryDateRange, orderCalendarDate } from '../src/features/clientOrders/lib/orderStateReconciliation';
import { acceptedInputMatchesDeviceDraft, sameDeviceDraftInput } from '../src/features/clientOrders/lib/deviceDraftRecovery';
import { getOrderDisplayStatus, getOrderDisplayStatusLabel } from '../src/features/clientOrders/clientOrdersShared';

const queued: any = { guid: 'api-guid', clientOrderId: 'client-id', origin: 'local', revision: 1,
  status: 'QUEUED', syncState: 'QUEUED', number1c: null, isPostedIn1c: false, items: [{ quantity: 1 }],
  deliveryDate: '2026-10-26', contentToken: 'old-token', updatedAt: '2026-10-23T08:00:00Z' };
const state: any = { guid: 'api-guid', clientOrderId: 'client-id', clientRevision: 1, source: 'MANAGER_APP', revision: 5,
  status: 'CONFIRMED', syncState: 'SYNCED', number1c: 'ИПУТ-011129', isPostedIn1c: true,
  hasRealization: true, totalAmount: 1350, itemsCount: 2, createdByUser: { id: 98 },
  lastExportError: null, last1cError: null, updatedAt: '2026-10-26T06:00:00Z' };
const payload: any = { organizationGuid: 'org', counterpartyGuid: 'customer', deliveryDate: '2026-10-26',
  items: [{ lineGuid: 'line', productGuid: 'product', quantity: 1, basePrice: 1350 }] };
it('advances an old queued mirror without replacing lines or certifying stale edit tokens', () => {
  const merged = mergeOrderState(queued, state);
  expect(merged).toMatchObject({ number1c: 'ИПУТ-011129', syncState: 'SYNCED', isPostedIn1c: true, readOnly: true });
  expect(merged.items).toBe(queued.items); expect(merged.contentToken).toBeUndefined();
});
it('never rolls a confirmed mirror back after a late response', () => {
  const confirmed = mergeOrderState(queued, state);
  expect(mergeOrderState(confirmed, { ...state, revision: 1, syncState: 'QUEUED' })).toBe(confirmed);
  expect(mergeOrderState(confirmed, { ...state, updatedAt: '2026-10-23T08:00:00Z' })).toBe(confirmed);
});
it('does not merge another order', () => {
  expect(mergeOrderState(queued, { ...state, guid: 'other', clientOrderId: 'other' })).toBe(queued);
});
it('keeps real phone edits and attaches the current accepted version separately', () => {
  const local = { ...queued, origin: 'device', clientRevision: 18, totalAmount: 8892, items: [{ quantity: 3 }],
    shipmentProhibited: true, offlineDraftStatus: 'PRICE_REVIEW', submissionErrorDetails: { message: 'Цены изменились' } };
  const merged = mergeOrderState(local, { ...state, totalAmount: 7512 });
  expect(merged.items).toBe(local.items); expect(merged.totalAmount).toBe(8892);
  expect(merged.submittedVersion?.totalAmount).toBe(7512);
  expect(merged.submissionErrorDetails).toBe(local.submissionErrorDetails);
  expect(getOrderDisplayStatus(merged)).not.toBe('DEBT');
  expect(getOrderDisplayStatusLabel(merged)).toBe('В 1С · изменения не отправлены');
});
it('retires Nalimova SAVE revision 2 only from verified accepted revision 1 input', () => {
  const local: any = { clientOrderId: 'client-id', clientRevision: 2, intent: 'SAVE', payload: { ...payload, integrity: { baseContentToken: 'new' } } };
  const posted = { ...state, origin: 'local', acceptedClientOperation: { clientRevision: 1, intent: 'SUBMIT', payload } };
  expect(acceptedInputMatchesDeviceDraft(local, posted, 98)).toBe(true);
  expect(acceptedInputMatchesDeviceDraft(local, { ...posted, acceptedClientOperation: null }, 98)).toBe(false);
  expect(acceptedInputMatchesDeviceDraft(local, posted, 91)).toBe(false);
  expect(acceptedInputMatchesDeviceDraft({ ...local, payload: { ...payload, items: [{ ...payload.items[0], quantity: 3 }] } }, posted, 98)).toBe(false);
});
it('ignores transport metadata, but preserves quoted/manual prices and the price decision', () => {
  expect(sameDeviceDraftInput(payload, { ...payload, deliveryDate: '2026-10-26T00:00:00.000Z', saveReason: 'autosave' })).toBe(true);
  expect(sameDeviceDraftInput(payload, { ...payload, items: [{ ...payload.items[0], basePrice: 999 }] })).toBe(false);
  expect(sameDeviceDraftInput(payload, { ...payload, items: [{ ...payload.items[0], manualPrice: 1350 }] })).toBe(false);
  expect(sameDeviceDraftInput(payload, { ...payload, offlineReview: { pricePolicy: 'KEEP_DRAFT' } })).toBe(false);
});
it.each(['2026-10-26', '2026-10-26T00:00:00', '2026-10-26T00:00:00Z', '2026-10-26T23:59:59+07:00'])('includes selected shipment day independent of timezone: %s', value => {
  expect(matchesDeliveryDateRange(value, '26.10.2026', '2026-10-26')).toBe(true);
});
it.each(['2026-10-25T23:59:59Z', '2026-10-27T00:00:00+07:00', '', null, '2026-02-30'])('excludes other dates from cache and live results: %s', value => {
  expect(matchesDeliveryDateRange(value, '2026-10-26', '2026-10-26')).toBe(false);
});
it('handles open bounds and rejects invalid calendar dates', () => {
  expect(matchesDeliveryDateRange(null)).toBe(true);
  expect(matchesDeliveryDateRange('2026-10-27', '2026-10-26')).toBe(true);
  expect(orderCalendarDate('31.02.2026')).toBeNull();
});
