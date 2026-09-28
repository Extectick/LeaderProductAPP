import { buildCopyPayload, orderToDraft } from '../src/features/clientOrders/clientOrdersShared';
import { savedOrderConfirmsDeviceDraft, sameDeviceDraftContent } from '../src/features/clientOrders/lib/deviceDraftRecovery';

const order: any = {
  guid: 'server-guid', origin: 'local', clientOrderId: 'client-id', clientRevision: 1,
  status: 'CONFIRMED', createdByUser: { id: 98 }, revision: 2,
  organization: { guid: 'org' }, counterparty: { guid: 'customer' },
  deliveryDate: '2026-09-25T00:00:00.000Z', invoiceRequested: false,
  items: [{ lineGuid: 'line', product: { guid: 'product', name: 'Товар' }, quantity: 1,
    isManualPrice: true, manualPrice: 0.01, basePrice: 0.01 }], events: [],
};
const entry = () => ({ clientOrderId: 'client-id', clientRevision: 1, intent: 'SUBMIT' as const,
  payload: buildCopyPayload(orderToDraft(order)) });

describe('safe recovery of legacy device drafts', () => {
  it('accepts an exact confirmed copy even when the API has a newer revision', () => {
    expect(savedOrderConfirmsDeviceDraft(entry(), order, 98)).toBe(true);
    expect(savedOrderConfirmsDeviceDraft(entry(), { ...order, clientRevision: 3 }, 98)).toBe(true);
  });
  it('accepts a date-only request and nullable server defaults (production request shape)', () => {
    const local = entry();
    local.payload.deliveryDate = '2026-09-25';
    delete local.payload.items[0].comment;
    delete local.payload.items[0].discountPercent;
    delete local.payload.items[0].cancelledAmount;
    expect(savedOrderConfirmsDeviceDraft(local, { ...order, generalDiscountPercent: null,
      items: [{ ...order.items[0], comment: null, cancelledAmount: null, discountPercent: null }] }, 98)).toBe(true);
  });
  it.each([
    { clientOrderId: 'different' }, { createdByUser: { id: 2 } }, { createdByUser: null },
    { clientRevision: 0 }, { clientRevision: null }, { status: 'DRAFT' }, { origin: 'device' },
    { items: [] }, { organization: { guid: 'other-org' } },
    { deliveryDate: '2026-09-26T00:00:00.000Z' }, { comment: 'New comment' },
    { items: [{ ...order.items[0], quantity: 2 }] },
    { items: [{ ...order.items[0], manualPrice: 0.02 }] },
    { items: [{ ...order.items[0], lineGuid: 'different-line' }] },
  ])('retains unconfirmed data: %j', patch => {
    expect(savedOrderConfirmsDeviceDraft(entry(), { ...order, ...patch }, 98)).toBe(false);
  });
  it('does not consume a newer local revision or a legacy identity', () => {
    expect(savedOrderConfirmsDeviceDraft({ ...entry(), clientRevision: 2 }, order, 98)).toBe(false);
    expect(savedOrderConfirmsDeviceDraft({ ...entry(), clientOrderId: 'legacy:old' }, order, 98)).toBe(false);
  });
  it('ignores transport metadata but not changed items or manual prices', () => {
    const a = entry().payload;
    expect(sameDeviceDraftContent(a, { ...a, saveReason: 'autosave', integrity: { baseContentToken: 'new', confirmationToken: undefined } })).toBe(true);
    expect(sameDeviceDraftContent(a, { ...a, items: [...a.items, a.items[0]] })).toBe(false);
    expect(sameDeviceDraftContent(a, { ...a, items: [{ ...a.items[0], manualPrice: 2 }] })).toBe(false);
  });
});
