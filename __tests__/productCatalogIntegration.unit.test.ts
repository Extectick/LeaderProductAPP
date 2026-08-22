import { apiClient } from '../utils/apiClient';
import { getClientOrderProductsBatch, searchClientOrderProducts } from '../utils/clientOrdersService';
import { scheduleProductCatalogSync, searchCatalogProducts } from '../src/features/productCatalog';

jest.mock('../utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('../src/features/productCatalog', () => ({
  scheduleProductCatalogSync: jest.fn(),
  searchCatalogProducts: jest.fn(),
}));

const apiClientMock = jest.mocked(apiClient);
const localSearchMock = jest.mocked(searchCatalogProducts);

describe('local product catalog integration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the local FTS result without waiting for the network', async () => {
    localSearchMock.mockResolvedValueOnce({
      items: [{ guid: 'local-product', name: 'Молоко', basePrice: null, receiptPrice: null, stock: null } as any],
      total: 1,
      hasMore: false,
    });

    const result = await searchClientOrderProducts({ search: 'мол', limit: 50, offset: 0 });

    expect(scheduleProductCatalogSync).toHaveBeenCalledTimes(1);
    expect(result.localCatalog).toBe(true);
    expect(result.items[0]?.guid).toBe('local-product');
    expect(apiClientMock).not.toHaveBeenCalled();
  });

  it('keeps the exact in-stock filter on the live endpoint', async () => {
    apiClientMock.mockResolvedValueOnce({ ok: true, status: 200, data: { items: [] }, meta: { total: 0 } } as any);

    await searchClientOrderProducts({ search: 'мол', warehouseGuid: 'warehouse', inStockOnly: true, limit: 50, offset: 0 });

    expect(localSearchMock).not.toHaveBeenCalled();
    expect(apiClientMock).toHaveBeenCalledWith(
      '/api/client-orders/products?search=%D0%BC%D0%BE%D0%BB&warehouseGuid=warehouse&inStockOnly=true&limit=50&offset=0',
      { timeoutMs: 65_000 }
    );
  });

  it('caches context-dependent product values briefly and requests only missing GUIDs', async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { items: [{ guid: 'catalog-a', name: 'A' }, { guid: 'catalog-b', name: 'B' }] },
    } as any);
    const input = { productGuids: ['catalog-b', 'catalog-a'], warehouseGuid: 'warehouse-catalog-test' };

    const first = await getClientOrderProductsBatch(input);
    const second = await getClientOrderProductsBatch({ ...input, productGuids: ['catalog-a', 'catalog-b'] });

    expect(first.map((item) => item.guid)).toEqual(['catalog-a', 'catalog-b']);
    expect(second.map((item) => item.guid)).toEqual(['catalog-a', 'catalog-b']);
    expect(apiClientMock).toHaveBeenCalledTimes(1);
    expect(apiClientMock).toHaveBeenCalledWith('/api/client-orders/products/batch', {
      method: 'POST',
      body: { productGuids: ['catalog-a', 'catalog-b'], warehouseGuid: 'warehouse-catalog-test' },
      timeoutMs: 65_000,
    });
  });
});
