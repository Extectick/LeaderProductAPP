import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useCustomerPurchaseHistory } from '../src/features/clientOrders/hooks/useCustomerPurchaseHistory';
import { apiClient } from '../utils/apiClient';
import { readCustomerPurchaseHistory, writeCustomerPurchaseHistory } from '../src/features/clientOrders/offline/customerPurchaseHistoryDatabase';
import type { CustomerPurchaseHistory } from '../src/features/clientOrders/lib/customerPurchaseHistory';
jest.mock('../utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('../src/features/clientOrders/offline/customerPurchaseHistoryDatabase', () => ({
  readCustomerPurchaseHistory: jest.fn(async () => null), writeCustomerPurchaseHistory: jest.fn(async () => undefined),
}));

const sample = (client = 'client', fetchedAt = '2026-10-08T00:00:00Z'): CustomerPurchaseHistory => ({
  version: 'customer-purchases-v1', organizationGuid: 'org', counterpartyGuid: client,
  coverageFrom: '2026-03-31', asOf: '2026-10-09T12:00:00', fetchedAt,
  items: [{ productGuid: `product-${client}`, lastPurchasedDate: '2026-10-08' }],
});
const initial = { userId: 'u1', organizationGuid: 'org', counterpartyGuid: 'client', enabled: true, online: true };
let output: ReturnType<typeof useCustomerPurchaseHistory>;
let renderer: TestRenderer.ReactTestRenderer;
function Probe(props: typeof initial) { output = useCustomerPurchaseHistory(props); return null; }
const mount = async (props = initial) => { await act(async () => { renderer = TestRenderer.create(React.createElement(Probe, props)); }); };
const update = async (props: typeof initial) => { await act(async () => { renderer.update(React.createElement(Probe, props)); }); };
beforeEach(() => {
  jest.mocked(apiClient).mockReset();
  jest.mocked(readCustomerPurchaseHistory).mockReset().mockResolvedValue(null);
  jest.mocked(writeCustomerPurchaseHistory).mockReset().mockResolvedValue(undefined);
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

it('keeps the last working snapshot on network failure and never overwrites it with empty history', async () => {
  jest.mocked(readCustomerPurchaseHistory).mockResolvedValue(sample());
  jest.mocked(apiClient).mockRejectedValue(new Error('offline'));
  await mount();
  expect(output.ready).toBe(true);
  expect(output.dates.get('product-client')).toBe('2026-10-08');
  expect(output.error).toBe(true);
  expect(writeCustomerPurchaseHistory).not.toHaveBeenCalled();
});

it('uses SQLite without any network request offline and retries when connectivity returns', async () => {
  await mount({ ...initial, online: false });
  expect(output.ready).toBe(false);
  expect(apiClient).not.toHaveBeenCalled();
  jest.mocked(apiClient).mockResolvedValue({ ok: true, data: sample() } as any);
  await update(initial);
  expect(output.ready).toBe(true);
  expect(writeCustomerPurchaseHistory).toHaveBeenCalledWith('u1', sample());
});

it('ignores a late response after switching customer or account', async () => {
  let complete!: (value: any) => void;
  jest.mocked(apiClient).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  await mount();
  jest.mocked(apiClient).mockResolvedValue({ ok: true, data: sample('client2') } as any);
  await update({ ...initial, counterpartyGuid: 'client2', userId: 'u2' });
  await act(async () => complete({ ok: true, data: sample() }));
  expect(output.dates.has('product-client2')).toBe(true);
  expect(output.dates.has('product-client')).toBe(false);
  expect(writeCustomerPurchaseHistory).toHaveBeenCalledTimes(1);
  expect(writeCustomerPurchaseHistory).toHaveBeenCalledWith('u2', sample('client2'));
});

it('does not disable online history when the optional SQLite write fails', async () => {
  jest.mocked(apiClient).mockResolvedValue({ ok: true, data: sample() } as any);
  jest.mocked(writeCustomerPurchaseHistory).mockRejectedValue(new Error('disk full'));
  await mount();
  expect(output.ready).toBe(true);
  expect(output.snapshot?.fetchedAt).toBe(sample().fetchedAt);
  expect(output.error).toBe(true);
});

it('reuses a fresh snapshot when reopening and rejects a legacy response', async () => {
  jest.mocked(readCustomerPurchaseHistory).mockResolvedValue(sample('client', new Date().toISOString()));
  await mount();
  expect(apiClient).not.toHaveBeenCalled();
  await update({ ...initial, enabled: false });
  await update(initial);
  expect(apiClient).not.toHaveBeenCalled();
  jest.mocked(apiClient).mockResolvedValue({ ok: true, data: { card: {} } } as any);
  await act(async () => output.refresh());
  expect(output.ready).toBe(true);
  expect(output.error).toBe(true);
  expect(writeCustomerPurchaseHistory).not.toHaveBeenCalled();
});
