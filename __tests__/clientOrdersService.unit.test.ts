import {
  copyClientOrder,
  getClientOrder,
  getClientOrderProductsBatch,
  getClientOrders,
  searchClientOrderProducts,
  submitClientOrder,
} from '../utils/clientOrdersService';
import { apiClient } from '../utils/apiClient';

jest.mock('../utils/apiClient', () => ({
  apiClient: jest.fn(),
}));

const apiClientMock = jest.mocked(apiClient);

describe('clientOrdersService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds list query and normalizes items/events arrays', async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        items: [
          {
            guid: 'order-guid',
            status: 'QUEUED',
            syncState: 'QUEUED',
            queuePosition: 2,
          },
        ],
      },
      meta: { total: 1, limit: 20, offset: 0 },
    } as any);

    const result = await getClientOrders({
      limit: 20,
      offset: 0,
      search: 'НОУТ',
      status: 'QUEUED',
      onlyProblems: true,
    });

    expect(apiClientMock).toHaveBeenCalledWith('/api/client-orders?limit=20&offset=0&search=%D0%9D%D0%9E%D0%A3%D0%A2&status=QUEUED&onlyProblems=true');
    expect(result).toMatchObject({
      meta: { total: 1, limit: 20, offset: 0 },
      items: [
        {
          guid: 'order-guid',
          items: [],
          events: [],
          itemsCount: 0,
          queuePosition: 2,
        },
      ],
    });
  });

  it('deduplicates concurrent order detail reads', async () => {
    let resolve!: (value: any) => void;
    apiClientMock.mockReturnValueOnce(new Promise((next) => { resolve = next; }) as any);

    const first = getClientOrder('order-guid');
    const second = getClientOrder('order-guid');
    resolve({
      ok: true,
      status: 200,
      data: { guid: 'order-guid', status: 'DRAFT', items: [], events: [] },
    });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(apiClientMock).toHaveBeenCalledTimes(1);
    expect(apiClientMock).toHaveBeenCalledWith('/api/client-orders/order-guid');
  });

  it('passes product picker context and inStockOnly to API', async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { items: [{ guid: 'product-guid', name: 'Товар' }] },
      meta: { total: 1 },
    } as any);

    await searchClientOrderProducts({
      search: 'молоко',
      organizationGuid: 'org-guid',
      counterpartyGuid: 'counterparty-guid',
      agreementGuid: 'agreement-guid',
      warehouseGuid: 'warehouse-guid',
      priceTypeGuid: 'price-type-guid',
      inStockOnly: true,
      limit: 25,
      offset: 50,
    });

    expect(apiClientMock).toHaveBeenCalledWith('/api/client-orders/products?search=%D0%BC%D0%BE%D0%BB%D0%BE%D0%BA%D0%BE&organizationGuid=org-guid&counterpartyGuid=counterparty-guid&agreementGuid=agreement-guid&warehouseGuid=warehouse-guid&priceTypeGuid=price-type-guid&inStockOnly=true&limit=25&offset=50');
  });

  it('deduplicates product batch requests independently of guid order', async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { items: [{ guid: 'a', name: 'A' }, { guid: 'b', name: 'B' }] },
    } as any);

    const first = getClientOrderProductsBatch({ productGuids: ['b', 'a', 'a'], warehouseGuid: 'warehouse-guid' });
    const second = getClientOrderProductsBatch({ productGuids: ['a', 'b'], warehouseGuid: 'warehouse-guid' });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(apiClientMock).toHaveBeenCalledTimes(1);
    expect(apiClientMock).toHaveBeenCalledWith('/api/client-orders/products/batch', {
      method: 'POST',
      body: { productGuids: ['b', 'a', 'a'], warehouseGuid: 'warehouse-guid' },
    });
  });

  it('uses 10 second timeout for submit and copy commands', async () => {
    apiClientMock
      .mockResolvedValueOnce({ ok: true, status: 200, data: { guid: 'order-guid', revision: 2, items: [], events: [] } } as any)
      .mockResolvedValueOnce({ ok: true, status: 201, data: { guid: 'copy-guid', revision: 1, items: [], events: [] } } as any);

    await submitClientOrder('order-guid', 1);
    await copyClientOrder('order-guid', 2);

    expect(apiClientMock).toHaveBeenNthCalledWith(1, '/api/client-orders/order-guid/submit', {
      method: 'POST',
      body: { revision: 1 },
      timeoutMs: 10_000,
    });
    expect(apiClientMock).toHaveBeenNthCalledWith(2, '/api/client-orders/order-guid/copy', {
      method: 'POST',
      body: { revision: 2 },
      timeoutMs: 10_000,
    });
  });
});
