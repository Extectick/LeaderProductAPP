import { isPurchaseHistory, purchaseHistoryLabel } from '../src/features/clientOrders/lib/customerPurchaseHistory';
import { ProductPickerSnapshot } from '../src/features/clientOrders/lib/productPickerSnapshot';

const snapshot = { version: 'customer-purchases-v1', organizationGuid: 'org', counterpartyGuid: 'client',
  coverageFrom: '2026-03-31', asOf: '2026-10-09T19:00:00', fetchedAt: '2026-10-09T13:00:00Z',
  items: [{ productGuid: 'product', lastPurchasedDate: '2026-10-08' }] };

it('does not restore counterparties as goods after opening another reference without selection', () => {
  const state = new ProductPickerSnapshot();
  expect(state.open('product', 'same-order')).toBe(false);
  state.loaded('same-order');
  expect(state.open('product', 'same-order')).toBe(true);
  expect(state.open('counterparty', 'same-order')).toBe(false);
  expect(state.open('product', 'same-order')).toBe(false);
});

it('never restores a pending/failed query, a changed context or a changed filter', () => {
  const state = new ProductPickerSnapshot();
  state.loaded('org1:client1:stock');
  expect(state.open('product', 'org2:client1:stock')).toBe(false);
  expect(state.open('product', 'org1:client1:stock')).toBe(false);
  state.loaded('org2:client1:stock');
  expect(state.open('product', 'org2:client1:purchased')).toBe(false);
  state.loaded('search=old');
  state.invalidate();
  expect(state.open('product', 'search=new')).toBe(false);
});

it('labels calendar days, not elapsed 24-hour intervals; rejects future and invalid dates', () => {
  const now = new Date(2026, 9, 9, 0, 1);
  expect(purchaseHistoryLabel('2026-10-09', now)).toBe('Брал сегодня');
  expect(purchaseHistoryLabel('2026-10-08', now)).toBe('Брал 1 дн. назад');
  expect(purchaseHistoryLabel('2026-09-09', now)).toBe('Брал 30 дн. назад');
  expect(purchaseHistoryLabel('2026-10-10', now)).toBeNull();
  expect(purchaseHistoryLabel('2026-02-30', now)).toBeNull();
  expect(purchaseHistoryLabel(undefined, now)).toBeNull();
});

it('distinguishes a valid empty snapshot from missing/incompatible/cross-context data', () => {
  expect(isPurchaseHistory(snapshot, 'client', 'org')).toBe(true);
  expect(isPurchaseHistory({ ...snapshot, items: [] }, 'client', 'org')).toBe(true);
  for (const value of [null, {}, { ...snapshot, version: 'old' }, { ...snapshot, organizationGuid: 'other' },
    { ...snapshot, counterpartyGuid: 'other' }, { ...snapshot, items: [...snapshot.items, ...snapshot.items] },
    { ...snapshot, items: [{ productGuid: 'x', lastPurchasedDate: '2026-03-30' }] },
    { ...snapshot, items: [{ productGuid: 'x', lastPurchasedDate: '2026-10-10' }] }]) {
    expect(isPurchaseHistory(value, 'client', 'org')).toBe(false);
  }
});
