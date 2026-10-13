import { apiClient } from '../utils/apiClient';
import { getClientOrderProductsBatch, searchClientOrderProducts } from '../utils/clientOrdersService';
import { scheduleProductCatalogSync, searchCatalogProducts } from '../src/features/productCatalog';
import { setServerReachable, setServerUnavailable } from '../src/shared/network/serverStatus';

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
  beforeEach(() => { jest.clearAllMocks(); localSearchMock.mockReset(); apiClientMock.mockReset(); setServerReachable(); });

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
    setServerUnavailable('offline');
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
    setServerUnavailable('offline');
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

  it.each([[[]], [[{ guid: 'old-card', name: 'Теша 1-3' }]]])('uses live stock even with a ready stale local catalog: %j', async localItems => {
    localSearchMock.mockResolvedValueOnce({ items: localItems as any, total: localItems.length, hasMore: false });
    apiClientMock.mockResolvedValueOnce({ ok: true, status: 200, data: { items: [
      { guid: 'new-card', name: 'Теша', stock: { available: 85 } },
    ] } } as any);
    const result = await searchClientOrderProducts({ search: 'Теша', warehouseGuid: 'main-omsk', inStockOnly: true });
    expect(result.items[0]).toMatchObject({ guid: 'new-card', stock: { available: 85 } });
    expect(localSearchMock).not.toHaveBeenCalled();
    expect(result.localCatalog).not.toBe(true);
  });

  it('keeps local stock usable when live 1C/API is temporarily unavailable', async () => {
    apiClientMock.mockResolvedValueOnce({ ok: false, status: 502, message: '1C unavailable' } as any);
    localSearchMock.mockResolvedValueOnce({ items: [{ guid: 'cached' } as any], total: 1, hasMore: false });
    expect((await searchClientOrderProducts({ search: 'Теша', inStockOnly: true })).items[0].guid).toBe('cached');
  });

  it('does not mask an authorization failure with cached products', async () => {
    apiClientMock.mockResolvedValueOnce({ ok: false, status: 403, message: 'Forbidden' } as any);
    await expect(searchClientOrderProducts({ search: 'private-search' })).rejects.toThrow();
    expect(localSearchMock).not.toHaveBeenCalled();
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
