import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {useNewItemPricing} from '../src/features/clientOrders/lib/useNewItemPricing';
import {buildNewItem, emptyDraft, type DraftOrder, type DraftItem} from '../src/features/clientOrders/clientOrdersShared';
import {getClientOrderProductsBatch} from '@/utils/clientOrdersService';

jest.mock('@/utils/clientOrdersService', () => ({getClientOrderProductsBatch: jest.fn()}));
const batch = jest.mocked(getClientOrderProductsBatch);
const item = (guid = 'p') => buildNewItem({guid, name: guid, basePrice: null, packages: []});
let enqueue!: (line: DraftItem) => void;
let draft: DraftOrder;
let user = '1';
let renderer: TestRenderer.ReactTestRenderer;
let update!: React.Dispatch<React.SetStateAction<DraftOrder>>;
function Harness() {
  const [value, setValue] = React.useState(draft);
  draft = value; update = setValue;
  enqueue = useNewItemPricing(value, user, setValue);
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
  jest.useFakeTimers(); batch.mockReset(); user = '1';
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
  batch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
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
  batch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
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
