import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useStockProducts } from '../src/features/stockBalances/useStockProducts';
import { apiClient } from '../utils/apiClient';
import { readStockCache, writeStockCache, clearStockCache } from '../src/features/stockBalances/stockCache';
jest.mock('../utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('../src/features/stockBalances/stockCache', () => ({ readStockCache: jest.fn(), writeStockCache: jest.fn(), clearStockCache: jest.fn() }));
const page = (ids: string[], more = false, offset = 0) => ({ items: ids.map(guid => ({ guid })), offset, nextOffset: offset + ids.length, hasMore: more });
const initial = { search: '', userId: 'u1', online: true };
let output: ReturnType<typeof useStockProducts<{ guid: string }>>;
let renderer: TestRenderer.ReactTestRenderer;
function Probe(props: typeof initial) { output = useStockProducts('products', { search: props.search }, props.userId, props.online); return null; }
async function mount(props = initial) { await act(async () => { renderer = TestRenderer.create(React.createElement(Probe, props)); }); }
async function update(props: typeof initial) { await act(async () => { renderer.update(React.createElement(Probe, props)); }); }
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(apiClient).mockReset();
  jest.mocked(readStockCache).mockResolvedValue(null);
});
afterEach(() => { act(() => renderer?.unmount()); });
it('loads a cached page offline without network requests and refreshes after reconnection', async () => {
  jest.mocked(readStockCache).mockResolvedValue(page(['old']));
  await mount({ ...initial, online: false });
  expect(output.page?.items[0].guid).toBe('old'); expect(output.busy).toBe(false); expect(apiClient).not.toHaveBeenCalled();
  jest.mocked(apiClient).mockResolvedValue({ ok: true, data: page(['new']) } as any);
  await update(initial);
  expect(output.page?.items[0].guid).toBe('new'); expect(output.stale).toBe(false);
});
it('ignores old search and user responses, including their cache writes', async () => {
  let finish!: (v: any) => void;
  jest.mocked(apiClient).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount();
  jest.mocked(apiClient).mockResolvedValue({ ok: true, data: page(['new']) } as any);
  await update({ ...initial, userId: 'u2', search: 'new' });
  await act(async () => finish({ ok: true, data: page(['old']) }));
  expect(output.page?.items.map(i => i.guid)).toEqual(['new']);
  expect(writeStockCache).toHaveBeenCalledTimes(1);
  expect(writeStockCache).toHaveBeenCalledWith('u2', expect.any(String), expect.any(Object));
});
it('paginates without duplicates, serializes repeated end events and refreshes from zero', async () => {
  jest.mocked(apiClient).mockResolvedValueOnce({ ok: true, data: page(['a', 'b'], true) } as any);
  await mount();
  jest.mocked(apiClient).mockResolvedValueOnce({ ok: true, data: page(['b', 'c'], false, 2) } as any);
  await act(async () => { await Promise.all([output.loadMore(), output.loadMore()]); });
  expect(output.page?.items.map(i => i.guid)).toEqual(['a', 'b', 'c']); expect(apiClient).toHaveBeenCalledTimes(2);
  jest.mocked(apiClient).mockResolvedValueOnce({ ok: true, data: page(['d']) } as any);
  await act(async () => { await output.refresh(); });
  expect(output.page?.items.map(i => i.guid)).toEqual(['d']);
  expect(jest.mocked(apiClient).mock.calls[2][0]).toContain('offset=0');
});
it('retains working data on failure but blocks automatic retry loops', async () => {
  jest.mocked(apiClient).mockResolvedValueOnce({ ok: true, data: page(['a'], true) } as any);
  await mount();
  jest.mocked(apiClient).mockResolvedValue({ ok: false, status: 500 } as any);
  await act(async () => { await output.loadMore(); });
  await act(async () => { await output.loadMore(); });
  expect(apiClient).toHaveBeenCalledTimes(2); expect(output.page?.items).toHaveLength(1); expect(output.busy).toBe(false);
});
it('clears inaccessible data and cache on forbidden response', async () => {
  jest.mocked(readStockCache).mockResolvedValue(page(['cached']));
  jest.mocked(apiClient).mockResolvedValue({ ok: false, status: 403 } as any);
  await mount();
  expect(output.page).toBeNull(); expect(clearStockCache).toHaveBeenCalledWith('u1');
});
