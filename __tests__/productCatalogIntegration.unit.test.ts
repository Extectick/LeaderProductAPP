import { apiClient } from '../utils/apiClient';
import { getClientOrderProductsBatch, searchClientOrderProducts } from '../utils/clientOrdersService';
import { scheduleProductCatalogSync, searchCatalogProducts } from '../src/features/productCatalog';

jest.mock('../utils/apiClient', () => ({ apiClient: jest.fn() }));
jest.mock('../src/features/productCatalog', () => ({
  scheduleProductCatalogSync: jest.fn(),
  searchCatalogProducts: jest.fn(),
}));
jest.mock('../src/features/clientOrders/offline/offlineOrdersDatabase', () => ({
  hasActiveOfflineEntity: jest.fn(async () => false),
  readActiveOfflineEntityItems: jest.fn(async () => []),
}));

const apiClientMock = jest.mocked(apiClient);
const localSearchMock = jest.mocked(searchCatalogProducts);

describe('local product catalog integration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retains the purchase filter on fallback without sending local user/cache identifiers to the server', async () => {
    localSearchMock.mockResolvedValueOnce(null);
    apiClientMock.mockResolvedValueOnce({ ok: true, status: 200, data: { items: [] } } as any);
    await searchClientOrderProducts({ organizationGuid: 'org', counterpartyGuid: 'client', purchasedOnly: true,
      historyUserId: 'private-local-user', historyFetchedAt: 'local-cache-revision', search: 'new-filter' });
    const url = String(apiClientMock.mock.calls[0][0]);
    expect(url).toContain('purchasedOnly=true');
    expect(url).toContain('organizationGuid=org');
    expect(url).not.toContain('historyUserId');
    expect(url).not.toContain('historyFetchedAt');
  });

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

  it('applies the exact in-stock filter in SQLite without waiting for the live endpoint', async () => {
    localSearchMock.mockResolvedValueOnce({ items: [], total: 0, hasMore: false });

    const result = await searchClientOrderProducts({ search: 'мол', warehouseGuid: 'warehouse', inStockOnly: true, limit: 50, offset: 0 });

    expect(localSearchMock).toHaveBeenCalledWith('мол', 50, 0, {
      priceTypeGuid: undefined,
      warehouseGuid: 'warehouse',
      organizationGuid: undefined,
      inStockOnly: true,
      purchasedOnly: undefined,
      historyUserId: undefined,
      historyFetchedAt: undefined,
      counterpartyGuid: undefined,
    });
    expect(result.localCatalog).toBe(true);
    expect(apiClientMock).not.toHaveBeenCalled();
  });

  it('preserves the full client context in the API fallback when local commercial data is not ready', async () => {
    localSearchMock.mockResolvedValueOnce(null);
    apiClientMock.mockResolvedValueOnce({
      ok: true, status: 200, data: { items: [{ guid: 'online', name: 'Online' }], meta: { total: 1 } },
    } as any);
    const result = await searchClientOrderProducts({
      organizationGuid: 'org', counterpartyGuid: 'client', agreementGuid: 'agreement',
      warehouseGuid: 'warehouse', priceTypeGuid: 'client-price', inStockOnly: true, limit: 50, offset: 0,
    });
    expect(result.items[0].guid).toBe('online');
    const url = String(apiClientMock.mock.calls[0][0]);
    for (const [key, value] of Object.entries({ organizationGuid: 'org', counterpartyGuid: 'client',
      agreementGuid: 'agreement', warehouseGuid: 'warehouse', priceTypeGuid: 'client-price', inStockOnly: 'true' })) {
      expect(url).toContain(`${key}=${value}`);
    }
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
