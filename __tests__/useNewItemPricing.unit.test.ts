import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {useNewItemPricing} from '../src/features/clientOrders/lib/useNewItemPricing';
import {buildNewItem, emptyDraft, type DraftOrder, type DraftItem} from '../src/features/clientOrders/clientOrdersShared';
import {getClientOrderProductsBatch} from '@/utils/clientOrdersService';

jest.mock('@/utils/clientOrdersService', () => ({getClientOrderProductsBatch: jest.fn()}));
const batch = jest.mocked(getClientOrderProductsBatch);
const item = (guid = 'p') => buildNewItem({guid, name: guid, basePrice: null, packages: []});
let enqueue!: (line: DraftItem) => void;
let pending: ReadonlySet<string>;
let draft: DraftOrder;
let recover = true;
let user: string | null = '1';
let renderer: TestRenderer.ReactTestRenderer;
let update!: React.Dispatch<React.SetStateAction<DraftOrder>>;
function Harness() {
  const [value, setValue] = React.useState(draft);
  draft = value; update = setValue;
  ({ enqueue, pendingItemPriceKeys: pending } = useNewItemPricing(value, user, setValue, recover));
  return null;
}
async function add(...lines: DraftItem[]) {
  await act(async () => {
    update(previous => ({...previous, items: [...previous.items, ...lines]}));
    for (const line of lines) enqueue(line);
  });
}
async function change(patch: (value: DraftOrder) => DraftOrder) { await act(async () => update(patch)); }
async function tick(ms = 200) { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); }
beforeEach(async () => {
  jest.useFakeTimers(); batch.mockReset(); user = '1'; recover = true;
  draft = {...emptyDraft(), organizationGuid: 'org', counterpartyGuid: 'client'};
  await act(async () => { renderer = TestRenderer.create(React.createElement(Harness)); });
});
afterEach(async () => { await act(async () => renderer.unmount()); jest.useRealTimers(); });

test('new unknown lines render immediately and fill with one debounced online batch', async () => {
  batch.mockResolvedValue([{guid: 'p', name: 'p', packages: [], basePrice: 123, weight: 2, weightUnit: {guid: 'kg', name: 'кг'}}, {guid: 'q', name: 'q', packages: [], basePrice: 45, weight: 5}]);
  await add(item(), {...item('q'), productWeight: 3});
  expect(draft.items).toHaveLength(2); expect(draft.items[0].basePrice).toBeNull(); expect(batch).not.toHaveBeenCalled();
  await tick();
  expect(batch).toHaveBeenCalledTimes(1);
  expect(batch).toHaveBeenCalledWith(expect.objectContaining({productGuids: ['p', 'q'], counterpartyGuid: 'client'}), {onlineOnly: true});
  expect(draft.items.map(line => line.basePrice)).toEqual([123, 45]);
  expect(draft.items[0]).toMatchObject({productWeight: 2, weightUnit: {guid: 'kg'}});
  expect(draft.items[1].productWeight).toBe(3);
});

test.each(['manual', 'known', 'removed', 'cancelled', 'identity', 'priceType', 'context', 'order', 'user', 'unmount'])('late response cannot overwrite %s change', async kind => {
  let finish!: (products: any[]) => void;
  batch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue([]);
  await add(item()); await tick();
  if (kind === 'user') {
    user = '2'; await act(async () => renderer.update(React.createElement(Harness)));
  } else if (kind === 'unmount') await act(async () => renderer.unmount());
  else await change(previous => ({...previous,
    ...(kind === 'context' ? {warehouseGuid: 'other'} : {}),
    ...(kind === 'order' ? {clientOrderId: 'other'} : {}),
    items: kind === 'removed' ? [] : previous.items.map(line => ({...line,
      ...(kind === 'manual' ? {manualPrice: '200'} : {}),
      ...(kind === 'known' ? {basePrice: 200} : {}),
      ...(kind === 'cancelled' ? {isCancelled: true} : {}),
      ...(kind === 'identity' ? {lineGuid: 'replacement'} : {}),
      ...(kind === 'priceType' ? {priceTypeGuid: 'other'} : {}),
    })),
  }));
  await act(async () => { finish([{guid: 'p', basePrice: 123}]); });
  expect(draft.items.some(line => line.basePrice === 123)).toBe(false);
});

test('context A→B→A and cancelled→restored cannot resurrect stale pricing', async () => {
  let finish!: (products: any[]) => void;
  batch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue([]);
  await add(item()); await tick();
  await change(previous => ({...previous, warehouseGuid: 'other'}));
  await change(previous => ({...previous, warehouseGuid: ''}));
  await act(async () => { finish([{guid: 'p', basePrice: 123}]); });
  expect(draft.items[0].basePrice).toBeNull();
});

test('more than 50 new lines are bounded and requests are serial; known/manual lines do not queue', async () => {
  let finish!: (products: any[]) => void;
  batch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue([]);
  await add(...Array.from({length: 51}, (_, i) => item(String(i))), {...item('known'), basePrice: 10}, {...item('manual'), manualPrice: '20'});
  await tick();
  expect(batch).toHaveBeenCalledTimes(1); expect(batch.mock.calls[0][0].productGuids).toHaveLength(50);
  await act(async () => finish([]));
  expect(batch).toHaveBeenCalledTimes(2); expect(batch.mock.calls[1][0].productGuids).toEqual(['50']);
});

test('failure leaves unknown and does not retry or change quantities', async () => {
  batch.mockRejectedValue(new Error('offline'));
  await add({...item(), quantity: '3'}); await tick(); await tick(60000);
  expect(batch).toHaveBeenCalledTimes(1); expect(draft.items[0]).toMatchObject({basePrice: null, quantity: '3'});
});

test('reopening an editable saved draft fills a zero or missing price, preserving manual and known lines', async () => {
  const missing = {...item(), basePrice: 0, priceTypeGuid: 'customer-type'};
  batch.mockResolvedValue([{guid: 'p', name: 'p', basePrice: 1660, packages: [], priceMatch: {source: 'fixture', level: 'customer'}}] as any);
  await change(previous => ({...previous, guid: 'saved', items: [
    missing, {...item('manual'), manualPrice: '250'}, {...item('known'), basePrice: 600}, {...item('cancelled'), isCancelled: true},
  ]}));
  expect([...pending]).toEqual([missing.key]);
  await tick();
  expect(draft.items.map(line => line.basePrice)).toEqual([1660, null, 600, null]);
  expect(draft.items[0].priceSource).toBe('fixture:customer');
  expect(batch.mock.calls[0][0].priceTypeGuid).toBe('customer-type');
  expect(pending.size).toBe(0);
  await tick(60000);
  expect(batch).toHaveBeenCalledTimes(1);
});

test('assigning a persistent GUID to the same client order preserves its in-flight request', async () => {
  let finish!: (products: any[]) => void;
  batch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await add(item()); await tick();
  await change(previous => ({...previous, guid: 'persisted-guid'}));
  await act(async () => finish([{guid: 'p', basePrice: 1660}]));
  expect(draft.items[0].basePrice).toBe(1660);
  expect(batch).toHaveBeenCalledTimes(1);
});

test('transient transport failure retries once and ends the loading state', async () => {
  const line = item();
  batch.mockRejectedValueOnce(Object.assign(new Error('busy'), {status: 503}))
    .mockResolvedValueOnce([{guid: 'p', name: 'p', packages: [], basePrice: 1660}]);
  await add(line); await tick();
  expect(pending.has(line.key)).toBe(true);
  await tick(1000);
  expect(draft.items[0].basePrice).toBe(1660);
  expect(pending.size).toBe(0);
  expect(batch).toHaveBeenCalledTimes(2);
});

test('no lookup for disabled screen and a permanent error stops loading without further polling', async () => {
  user = null;
  const missing = item();
  await change(previous => ({...previous, items: [missing]})); await tick();
  expect(batch).not.toHaveBeenCalled(); expect(pending.size).toBe(0);
  batch.mockRejectedValue(Object.assign(new Error('not allowed'), {status: 403}));
  user = '1'; await act(async () => renderer.update(React.createElement(Harness)));
  expect(pending.has(missing.key)).toBe(true);
  await tick(); await tick(60000);
  expect(batch).toHaveBeenCalledTimes(1); expect(pending.size).toBe(0);
});


test('editing a submitted order only prices explicitly edited lines', async () => {
  recover = false;
  const saved = item('saved'), added = item('added');
  batch.mockResolvedValue([{guid: 'added', name: 'added', packages: [], basePrice: 1660}]);
  await change(previous => ({...previous, items: [saved]}));
  await tick();
  expect(batch).not.toHaveBeenCalled();
  await add(added); await tick();
  expect(batch).toHaveBeenCalledTimes(1);
  expect(batch.mock.calls[0][0].productGuids).toEqual(['added']);
  expect(draft.items.map(line => line.basePrice)).toEqual([null, 1660]);
});
