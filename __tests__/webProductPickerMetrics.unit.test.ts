import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {WebProductPickerMetrics} from '../src/features/clientOrders/screen/desktop/WebProductPickerMetrics';
import {loadWebProductPickerPage, productPickerPageProgress} from '../src/features/clientOrders/screen/desktop/webProductPickerSearch';
import {mergeRefreshedProductPage} from '../src/features/clientOrders/lib/productFreshness';
import {searchClientOrderProducts, type ClientOrderProduct} from '@/utils/clientOrdersService';
import {apiClient} from '@/utils/apiClient';
import {setServerReachable} from '../src/shared/network/serverStatus';

jest.mock('@mui/material', () => ({Skeleton: 'Skeleton', Typography: 'Typography'}));
jest.mock('@/utils/apiClient', () => ({apiClient: jest.fn()}));
jest.mock('@/src/features/productCatalog', () => ({scheduleProductCatalogSync: jest.fn(), searchCatalogProducts: jest.fn(async () => null)}));
jest.mock('../src/features/clientOrders/offline/offlineOrdersDatabase', () => ({hasActiveOfflineEntity: jest.fn(async () => false), readActiveOfflineEntityItems: jest.fn(async () => [])}));
const api = jest.mocked(apiClient);
const pending: ClientOrderProduct = {guid: 'p', name: 'Товар', basePrice: null, receiptPrice: null, packages: [], stock: {available: null} as any,
  freshness: {source: 'local-read-model', commercialPending: true, receiptPricePending: true,
    priceStatus: 'unknown', stockStatus: 'unknown', receiptPriceStatus: 'unknown', stale: true,
    catalogCheckedAt: null, commercialCheckedAt: null}};
const response = (item: ClientOrderProduct) => ({ok: true, status: 200, data: {items: [item]}, meta: {nextOffset: 25, hasMore: true}} as any);
let tree: Renderer.ReactTestRenderer;
let output: ClientOrderProduct[];
let progress: ReturnType<typeof productPickerPageProgress>;
function Harness({scope = 'client'}: {scope?: string}) {
  const [items, setItems] = React.useState<ClientOrderProduct[]>([]); output = items;
  React.useEffect(() => {
    const controller = new AbortController();
    void loadWebProductPickerPage({counterpartyGuid: scope, search: 'Товар', limit: 25}, {
      searchProducts: searchClientOrderProducts, signal: controller.signal, isCurrent: () => !controller.signal.aborted,
      onRefresh: (fresh, previous) => setItems(current => fresh.meta.accessDenied ? [] : mergeRefreshedProductPage(current, previous, fresh.items)),
    }).then(result => {if (!controller.signal.aborted) {setItems(result.items); progress = productPickerPageProgress(result, 0, 25);}}, () => {});
    return () => controller.abort();
  }, [scope]);
  return React.createElement(React.Fragment, null, ...items.map(item => React.createElement(WebProductPickerMetrics, {key: item.guid, item})));
}
async function mount() {await act(async () => {tree = Renderer.create(React.createElement(Harness));});}
beforeEach(() => {jest.useFakeTimers(); api.mockReset(); setServerReachable();});
afterEach(async () => {await act(async () => tree?.unmount()); jest.useRealTimers();});

test('active catalog adapter and metric renderer resolve sale/stock before receipt cost, without hiding known values', async () => {
  const sellingReady: ClientOrderProduct = {...pending, basePrice: 100, stock: {available: 0}, freshness: {...pending.freshness!,
    commercialPending: false, priceStatus: 'snapshot', stockStatus: 'snapshot', commercialCheckedAt: '2026-11-17T10:00:00Z'}};
  const ready: ClientOrderProduct = {...sellingReady, receiptPrice: 70, freshness: {...sellingReady.freshness!, receiptPricePending: false,
    receiptPriceStatus: 'snapshot', receiptPriceCheckedAt: '2026-11-16T10:00:00Z'}};
  api.mockResolvedValueOnce(response(pending)).mockResolvedValueOnce(response(sellingReady)).mockResolvedValue(response(ready));
  await mount(); expect(tree.root.findAllByType('Skeleton' as any)).toHaveLength(3);
  expect(progress).toEqual({nextOffset: 25, hasMore: true});
  await act(async () => {await jest.advanceTimersByTimeAsync(2000);});
  expect(tree.root.findAllByType('Skeleton' as any)).toHaveLength(1);
  expect(output[0].basePrice).toBe(100); expect(output[0].stock?.available).toBe(0);
  await act(async () => {await jest.advanceTimersByTimeAsync(5000);});
  expect(tree.root.findAllByType('Skeleton' as any)).toHaveLength(0);
  expect(tree.root.findAllByType('Typography' as any).map(node => node.props['aria-label']).join(' ')).toContain('Цена поступления');
  expect(tree.root.findAllByType('Typography' as any).map(node => node.props.title).join(' ')).toContain('16.11.2026');
  expect(output[0].receiptPrice).toBe(70);
});

test.each([401, 403])('active catalog refresh clears cards after access rejection %s', async status => {
  api.mockResolvedValueOnce(response(pending)).mockResolvedValue({ok: false, status} as any);
  await mount(); await act(async () => {await jest.advanceTimersByTimeAsync(2000);});
  expect(output).toEqual([]); expect(tree.root.findAllByType('Skeleton' as any)).toHaveLength(0);
});

test('context change aborts old pending catalog refresh, and completed missing values render dashes', async () => {
  api.mockResolvedValueOnce(response(pending)).mockResolvedValue(response({...pending, guid: 'new', freshness: {...pending.freshness!, commercialPending: false, receiptPricePending: false}}));
  await mount(); const signal = api.mock.calls[0][1]?.signal;
  await act(async () => tree.update(React.createElement(Harness, {scope: 'other'})));
  expect(signal?.aborted).toBe(true);
  await act(async () => {await jest.advanceTimersByTimeAsync(60000);});
  expect(api).toHaveBeenCalledTimes(2); expect(output[0].guid).toBe('new');
  expect(tree.root.findAllByType('Skeleton' as any)).toHaveLength(0);
  expect(tree.root.findAllByType('Typography' as any).every(node => node.props['aria-label'].includes('—'))).toBe(true);
});

test('an empty filtered candidate page still advances by the server cursor', () => {
  expect(productPickerPageProgress({items: [], meta: {nextOffset: 50, hasMore: true}}, 25, 25)).toEqual({nextOffset: 50, hasMore: true});
});
