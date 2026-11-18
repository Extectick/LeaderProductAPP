import {refreshPendingProductSearch} from '../utils/clientOrdersProductSearchRefresh';
import type {ClientOrderProduct, PagedResult} from '../utils/clientOrdersService';

const pending: PagedResult<ClientOrderProduct> = {items: [{guid: 'p', name: 'Товар', packages: [], basePrice: null,
  freshness: {source: 'local-read-model', catalogCheckedAt: null, commercialCheckedAt: null,
    stale: true, commercialPending: true, priceStatus: 'unknown', stockStatus: 'unknown'}}], meta: {}};
const ready: PagedResult<ClientOrderProduct> = {...pending, items: [{...pending.items[0], basePrice: 125,
  freshness: {...pending.items[0].freshness!, commercialPending: false}}]};
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('returns initial display independently and refreshes until commercial data arrives', async () => {
  const load = jest.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(ready), update = jest.fn();
  const task = refreshPendingProductSearch(pending, load, update, new AbortController().signal);
  expect(load).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(2000);
  expect(update).toHaveBeenLastCalledWith(pending);
  await jest.advanceTimersByTimeAsync(5000);
  await task;
  expect(update).toHaveBeenLastCalledWith(ready);
  await jest.advanceTimersByTimeAsync(60000);
  expect(load).toHaveBeenCalledTimes(2);
});

test('unknown source never causes an unbounded polling loop', async () => {
  const load = jest.fn().mockResolvedValue(pending), update = jest.fn();
  const task = refreshPendingProductSearch(pending, load, update, new AbortController().signal);
  await jest.advanceTimersByTimeAsync(46999);
  expect(load).toHaveBeenCalledTimes(3);
  await jest.advanceTimersByTimeAsync(1); await task;
  expect(load).toHaveBeenCalledTimes(4);
  expect(update.mock.calls.at(-1)[0].items[0].freshness.commercialPending).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

test('aborting an obsolete query removes its timer and prevents stale refresh callbacks', async () => {
  const controller = new AbortController(), load = jest.fn(), update = jest.fn();
  const task = refreshPendingProductSearch(pending, load, update, controller.signal);
  controller.abort(); await task;
  expect(load).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  let resolve!: (value: any) => void;
  const nextController = new AbortController();
  load.mockReturnValue(new Promise(r => {resolve = r;}));
  const next = refreshPendingProductSearch(pending, load, update, nextController.signal);
  await jest.advanceTimersByTimeAsync(2000);
  nextController.abort(); resolve(ready); await next;
  expect(update).not.toHaveBeenCalled();
});

test('confirmed or live results do not poll and a failed refresh retains the displayed snapshot', async () => {
  const load = jest.fn().mockRejectedValue(new Error('offline')), update = jest.fn();
  await refreshPendingProductSearch(ready, load, update, new AbortController().signal);
  expect(load).not.toHaveBeenCalled();
  const task = refreshPendingProductSearch(pending, load, update, new AbortController().signal);
  await jest.advanceTimersByTimeAsync(2000); await task;
  expect(update.mock.calls[0][0].items[0].freshness.commercialPending).toBe(false); expect(jest.getTimerCount()).toBe(0);
});


test('receipt cost continues refreshing after selling price has completed', async () => {
  const costPending = {...ready, items: [{...ready.items[0], freshness: {...ready.items[0].freshness!, receiptPricePending: true}}]};
  const load = jest.fn().mockResolvedValue(ready), update = jest.fn();
  const task = refreshPendingProductSearch(costPending, load, update, new AbortController().signal);
  await jest.advanceTimersByTimeAsync(2000); await task;
  expect(load).toHaveBeenCalledTimes(1); expect(update).toHaveBeenLastCalledWith(ready);
});


test.each([401, 403])('authorization loss %s clears all search cards instead of settling old snapshots', async status => {
  const load = jest.fn().mockRejectedValue(Object.assign(new Error('denied'), {status})), update = jest.fn();
  const task = refreshPendingProductSearch(pending, load, update, new AbortController().signal);
  await jest.advanceTimersByTimeAsync(2000); await task;
  expect(update).toHaveBeenLastCalledWith({items: [], meta: {accessDenied: true, hasMore: false}});
  expect(load).toHaveBeenCalledTimes(1);
});
