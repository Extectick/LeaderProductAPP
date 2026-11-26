import {
  copyClientOrder,
  downloadClientOrderInvoice,
  getClientOrder,
  getClientOrderSettings,
  getClientOrderDefaults,
  getClientOrderInvoices,
  getClientOrderInvoiceStatuses,
  getClientOrderProductsBatch,
  getClientOrders,
  getClientOrdersTodaySummary,
  putClientOrderByClientId,
  previewClientOrderAmendment,
  searchClientOrderCounterparties,
  searchClientOrderAgreements,
  searchClientOrderContracts,
  searchClientOrderWarehouses,
  searchClientOrderPriceTypes,
  searchClientOrderDeliveryAddresses,
  searchClientOrderProducts,
  requestClientOrderInvoice,
  submitClientOrder,
} from "../utils/clientOrdersService";
import { apiClient } from "../utils/apiClient";
import { setServerReachable, setServerUnavailable } from '../src/shared/network/serverStatus';
import { readActiveOfflineEntityItems } from '../src/features/clientOrders/offline/offlineOrdersDatabase';
import { searchCatalogProducts } from '@/src/features/productCatalog';

jest.mock("../utils/apiClient", () => ({
  apiClient: jest.fn(),
}));

jest.mock("@/src/features/productCatalog", () => ({
  scheduleProductCatalogSync: jest.fn(),
  searchCatalogProducts: jest.fn(async () => null),
}));

jest.mock('@/src/features/clientOrders/offline/offlineOrdersDatabase', () => ({
  hasActiveOfflineEntity: jest.fn(async () => false),
  readActiveOfflineEntityItems: jest.fn(async () => []),
}));

const apiClientMock = jest.mocked(apiClient);

describe("clientOrdersService", () => {
  it('requests authoritative detail using the server fresh parameter', async () => {
    apiClientMock.mockResolvedValueOnce({ok: true, status: 200, data: {guid: 'fresh-guid', items: []}} as any);
    await getClientOrder('fresh-guid', {requireFresh: true});
    expect(apiClientMock.mock.calls[0][0]).toBe('/api/client-orders/fresh-guid?fresh=1');
  });

  it('reads a fresh amendment preview without invoking the save or submit endpoint', async () => {
    const review = { orderGuid: 'order-guid', serverRevision: 3, baseContentToken: 'a'.repeat(64), changes: [], requiresConfirmation: false, number1c: 'НОУТ-126165' };
    apiClientMock.mockResolvedValueOnce({ ok: true, status: 200, data: review } as any);
    expect(await previewClientOrderAmendment('client-order-id', { clientRevision: 30, intent: 'SUBMIT', items: [] })).toEqual(review);
    expect(apiClientMock).toHaveBeenCalledWith('/api/client-orders/by-client-id/client-order-id/review', {
      method: 'POST', body: { clientRevision: 30, intent: 'SUBMIT', items: [] }, timeoutMs: 15_000, networkRetryCount: 0,
    });
  });
  it('forwards product cancellation without serializing it or sharing another caller request', async () => {
    const first = new AbortController(), second = new AbortController();
    let finish!: (response: any) => void;
    apiClientMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    apiClientMock.mockResolvedValueOnce({ ok: true, status: 200, data: { items: [] } } as any);
    const pending = searchClientOrderProducts({ search: 'same search' }, { signal: first.signal });
    const rejected = expect(pending).rejects.toMatchObject({ status: 499 });
    const other = searchClientOrderProducts({ search: 'same search' }, { signal: second.signal });
    first.abort();
    finish({ ok: true, status: 200, data: { items: [{ guid: 'late' }] } });
    await rejected;
    expect((await other).items).toEqual([]);
    expect(apiClientMock).toHaveBeenCalledTimes(2);
    expect(apiClientMock.mock.calls[0][1]?.signal).toBe(first.signal);
    expect(apiClientMock.mock.calls[1][1]?.signal).toBe(second.signal);
    expect(apiClientMock.mock.calls[0][0]).not.toContain('signal');
    expect(searchCatalogProducts).not.toHaveBeenCalled();
  });

  it('does not start online/offline work for an aborted product search', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(searchClientOrderProducts({ search: 'cancelled' }, { signal: controller.signal })).rejects.toMatchObject({ status: 499 });
    expect(apiClientMock).not.toHaveBeenCalled();
    expect(searchCatalogProducts).not.toHaveBeenCalled();
  });

  it('does not replace a cancelled network error with offline commercial data', async () => {
    const controller = new AbortController();
    apiClientMock.mockImplementationOnce(async () => { controller.abort(); return { ok: false, status: 503 }; });
    await expect(searchClientOrderProducts({ search: 'cancelled' }, { signal: controller.signal })).rejects.toMatchObject({ status: 499 });
    expect(searchCatalogProducts).not.toHaveBeenCalled();
  });

  it.each(['', ' ', '\n\t'])('omits cleared/whitespace list search %j', async search => {
    apiClientMock.mockResolvedValueOnce({ ok: true, status: 200, data: { items: [], total: 0 } } as any);
    await getClientOrders({ search });
    expect(apiClientMock.mock.calls[0][0]).not.toContain('search=');
  });

  it.each([searchClientOrderCounterparties, searchClientOrderAgreements, searchClientOrderContracts,
    searchClientOrderWarehouses, searchClientOrderPriceTypes, searchClientOrderDeliveryAddresses])('cancels obsolete reference reads without falling back to offline data', async search => {
    const controller = new AbortController();
    apiClientMock.mockImplementationOnce(async () => {controller.abort(); return {ok: false, status: 503} as any;});
    await expect(search({search: 'old'}, {signal: controller.signal, expectedUserId: 1})).rejects.toMatchObject({status: 499});
    expect(apiClientMock).toHaveBeenCalledWith(expect.not.stringContaining('signal='), expect.objectContaining({signal: controller.signal, expectedUserId: 1}));
    expect(readActiveOfflineEntityItems).not.toHaveBeenCalled();
  });

  it.each([401, 403])('propagates status %i from a product page, even if SQLite has catalog data', async status => {
    setServerReachable();
    apiClientMock.mockResolvedValueOnce({ok: false, status} as any);
    await expect(searchClientOrderProducts({organizationGuid: 'org', counterpartyGuid: 'client', offset: 50},
      {signal: new AbortController().signal})).rejects.toMatchObject({status});
    expect(searchCatalogProducts).not.toHaveBeenCalled();
  });

  it('defaults denied by the current server never use an offline agreement snapshot', async () => {
    apiClientMock.mockResolvedValueOnce({ok: false, status: 403} as any);
    await expect(getClientOrderDefaults({organizationGuid: 'org', counterpartyGuid: 'denied'}, {signal: new AbortController().signal})).rejects.toMatchObject({status: 403});
    expect(readActiveOfflineEntityItems).not.toHaveBeenCalled();
  });

  it('an aborted defaults read cannot restore cached context', async () => {
    const controller = new AbortController();
    apiClientMock.mockImplementationOnce(async () => {controller.abort(); return {ok: false, status: 503} as any;});
    await expect(getClientOrderDefaults({organizationGuid: 'org', counterpartyGuid: 'old'}, {signal: controller.signal})).rejects.toMatchObject({status: 499});
    expect(readActiveOfflineEntityItems).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setServerReachable();
    jest.mocked(readActiveOfflineEntityItems).mockResolvedValue([]);
  });

  it('loads offline organizations and header defaults without a network timeout', async () => {
    setServerUnavailable('Network request failed');
    jest.mocked(readActiveOfflineEntityItems).mockImplementation(async entity => {
      if (entity === 'organizations') return [{ guid: 'org', name: 'Организация' }] as any;
      if (entity === 'counterparties') return [{ guid: 'client', name: 'Контрагент' }] as any;
      return [];
    });
    expect((await getClientOrderSettings()).organizations[0].guid).toBe('org');
    expect((await getClientOrderDefaults({ organizationGuid: 'org', counterpartyGuid: 'client' })).counterparty?.guid).toBe('client');
    expect(apiClientMock).not.toHaveBeenCalled();
  });

  it("builds list query and normalizes items/events arrays", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        items: [
          {
            guid: "order-guid",
            status: "QUEUED",
            syncState: "QUEUED",
            queuePosition: 2,
          },
        ],
      },
      meta: { total: 1, limit: 20, offset: 0 },
    } as any);

    const result = await getClientOrders({
      limit: 20,
      offset: 0,
      search: "НОУТ",
      status: "QUEUED",
      onlyProblems: true,
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders?limit=20&offset=0&search=%D0%9D%D0%9E%D0%A3%D0%A2&status=QUEUED&onlyProblems=true",
      { timeoutMs: 65_000 },
    );
    expect(result).toMatchObject({
      meta: { total: 1, limit: 20, offset: 0 },
      items: [
        {
          guid: "order-guid",
          items: [],
          events: [],
          itemsCount: 0,
          queuePosition: 2,
        },
      ],
    });
  });

  it("serializes multi-status order filters", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { items: [] },
      meta: { total: 0, limit: 20, offset: 0 },
    } as any);

    await getClientOrders({
      limit: 20,
      offset: 0,
      statuses: ["QUEUED", "TO_SHIP", "SHIPPING_IN_PROGRESS"],
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders?limit=20&offset=0&statuses=QUEUED%2CTO_SHIP%2CSHIPPING_IN_PROGRESS",
      { timeoutMs: 65_000 },
    );
  });

  it("loads today summary independently from the paginated order list", async () => {
    const summary = {
      date: "2026-08-07",
      ordersCount: 12,
      clientsCount: 7,
      totalAmount: 153400.5,
      profit: 21400.25,
      profitAvailable: true,
      missingReceiptPriceCount: 0,
      currency: "RUB",
      calculatedAt: "2026-08-07T08:00:00.000Z",
    };
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: summary,
    } as any);

    await expect(getClientOrdersTodaySummary()).resolves.toEqual(summary);
    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders/today-summary",
      { timeoutMs: 65_000 },
    );
  });

  it("deduplicates concurrent order detail reads", async () => {
    let resolve!: (value: any) => void;
    apiClientMock.mockReturnValueOnce(
      new Promise((next) => {
        resolve = next;
      }) as any,
    );

    const first = getClientOrder("order-guid");
    const second = getClientOrder("order-guid");
    resolve({
      ok: true,
      status: 200,
      data: { guid: "order-guid", status: "DRAFT", items: [], events: [] },
    });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(apiClientMock).toHaveBeenCalledTimes(1);
    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders/order-guid",
      { timeoutMs: 65_000 },
    );
  });

  it("normalizes invoice summary fields and embedded invoices", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        guid: "order-guid",
        invoiceRequested: true,
        invoiceState: "SENT",
        latestInvoiceVersion: 2,
        invoices: [
          {
            id: "invoice-2",
            version: 2,
            state: "SENT",
            downloadAvailable: true,
          },
        ],
      },
    } as any);

    await expect(getClientOrder("order-guid")).resolves.toMatchObject({
      invoiceRequested: true,
      invoiceState: "SENT",
      invoiceCount: 1,
      invoiceDownloadAvailable: true,
      invoices: [{ id: "invoice-2", version: 2 }],
    });
  });

  it("loads invoice versions and downloads PDF with a long timeout", async () => {
    const pdf = new Blob(["pdf"], { type: "application/pdf" });
    apiClientMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { items: [{ id: "invoice-1", version: 1 }] },
      } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, data: pdf } as any);

    await expect(getClientOrderInvoices("order-guid")).resolves.toEqual([
      { id: "invoice-1", version: 1 },
    ]);
    await expect(
      downloadClientOrderInvoice("order-guid", "invoice-1"),
    ).resolves.toBe(pdf);

    expect(apiClientMock).toHaveBeenNthCalledWith(
      1,
      "/api/client-orders/order-guid/invoices", {},
    );
    expect(apiClientMock).toHaveBeenNthCalledWith(
      2,
      "/api/client-orders/order-guid/invoices/invoice-1/download",
      {
        timeoutMs: 60_000,
        headers: { Accept: "application/pdf" },
      },
    );
  });

  it("loads invoice states for the visible list in one lightweight batch", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        items: [
          {
            identifier: "order-guid",
            invoices: [{ id: "invoice-1", version: 1, state: "QUEUED" }],
          },
        ],
      },
    } as any);

    await expect(
      getClientOrderInvoiceStatuses(["order-guid", "order-guid", ""]),
    ).resolves.toEqual([
      {
        identifier: "order-guid",
        invoices: [{ id: "invoice-1", version: 1, state: "QUEUED" }],
      },
    ]);
    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders/invoice-statuses",
      {
        method: "POST",
        body: { identifiers: ["order-guid"] },
      },
    );
  });

  it("requests invoice generation for an existing application order", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 202,
      data: {
        requested: true,
        message: "Формирование счёта запрошено",
        items: [{ id: "invoice-1", version: 1 }],
      },
    } as any);

    await expect(requestClientOrderInvoice("order-guid")).resolves.toEqual({
      requested: true,
      message: "Формирование счёта запрошено",
      items: [{ id: "invoice-1", version: 1 }],
    });
    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders/order-guid/invoices/request",
      {
        method: "POST",
        body: {},
      },
    );
  });

  it("passes product picker context and inStockOnly to API", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { items: [{ guid: "product-guid", name: "Товар" }] },
      meta: { total: 1 },
    } as any);

    await searchClientOrderProducts({
      search: "молоко",
      organizationGuid: "org-guid",
      counterpartyGuid: "counterparty-guid",
      agreementGuid: "agreement-guid",
      warehouseGuid: "warehouse-guid",
      priceTypeGuid: "price-type-guid",
      inStockOnly: true,
      limit: 25,
      offset: 50,
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders/products?search=%D0%BC%D0%BE%D0%BB%D0%BE%D0%BA%D0%BE&organizationGuid=org-guid&counterpartyGuid=counterparty-guid&agreementGuid=agreement-guid&warehouseGuid=warehouse-guid&priceTypeGuid=price-type-guid&inStockOnly=true&limit=25&offset=50",
      { timeoutMs: 65_000 },
    );
  });

  it("passes managerOnly to counterparty picker API", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        items: [
          {
            guid: "counterparty-guid",
            name: "Counterparty",
            managerGuid: "manager-guid",
          },
        ],
      },
      meta: { total: 1 },
    } as any);

    await searchClientOrderCounterparties({
      search: "beer",
      managerOnly: true,
      organizationGuid: "org-guid",
      limit: 25,
      offset: 0,
    });

    expect(apiClientMock).toHaveBeenCalledTimes(1);
    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders/counterparties?search=beer&managerOnly=true&organizationGuid=org-guid&limit=25&offset=0&debtStatus=all",
      { timeoutMs: 65_000 },
    );
  });

  it('online-only automatic pricing never uses a previously cached value or offline fallback', async () => {
    const payload = { productGuids: ['online-only-product'], counterpartyGuid: 'online-only-client' };
    apiClientMock.mockResolvedValueOnce({ok: true, status: 200, data: {items: [{guid: 'online-only-product', basePrice: 50}]}} as any);
    await getClientOrderProductsBatch(payload);
    apiClientMock.mockResolvedValueOnce({ok: false, status: 503} as any);
    await expect(getClientOrderProductsBatch(payload, {onlineOnly: true})).rejects.toMatchObject({status: 503});
    expect(apiClientMock).toHaveBeenCalledTimes(2);
    setServerUnavailable('test');
    await expect(getClientOrderProductsBatch(payload, {onlineOnly: true})).rejects.toThrow('подключение');
    expect(apiClientMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates product batch requests independently of guid order", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        items: [
          { guid: "a", name: "A" },
          { guid: "b", name: "B" },
        ],
      },
    } as any);

    const first = getClientOrderProductsBatch({
      productGuids: ["b", "a", "a"],
      warehouseGuid: "warehouse-guid",
      receiptPriceAt: "2026-07-10T14:30:00",
    });
    const second = getClientOrderProductsBatch({
      productGuids: ["a", "b"],
      warehouseGuid: "warehouse-guid",
      receiptPriceAt: "2026-07-10T14:30:00",
    });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(apiClientMock).toHaveBeenCalledTimes(1);
    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders/products/batch",
      {
        method: "POST",
        body: {
          productGuids: ["a", "b"],
          warehouseGuid: "warehouse-guid",
          receiptPriceAt: "2026-07-10T14:30:00",
        },
        timeoutMs: 65_000,
      },
    );
  });

  it("uses the extended 1C timeout for submit and copy commands", async () => {
    apiClientMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { guid: "order-guid", revision: 2, items: [], events: [] },
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: { guid: "copy-guid", revision: 1, items: [], events: [] },
      } as any);

    await submitClientOrder("order-guid", 1);
    await copyClientOrder("order-guid", 2);

    expect(apiClientMock).toHaveBeenNthCalledWith(
      1,
      "/api/client-orders/order-guid/submit",
      {
        method: "POST",
        body: { revision: 1 },
      timeoutMs: 65_000,
      },
    );
    expect(apiClientMock).toHaveBeenNthCalledWith(
      2,
      "/api/client-orders/order-guid/copy",
      {
        method: "POST",
        body: { revision: 2 },
      timeoutMs: 65_000,
      },
    );
  });

  it("sends idempotent mobile mutations through the client id endpoint", async () => {
    apiClientMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        guid: "order-guid",
        clientOrderId: "client-order-id",
        clientRevision: 3,
        items: [],
        events: [],
      },
    } as any);

    await putClientOrderByClientId(
      "client-order-id",
      { organizationGuid: "org", counterpartyGuid: "counterparty", items: [] },
      { clientRevision: 3, intent: "SUBMIT" },
    );

    expect(apiClientMock).toHaveBeenCalledWith(
      "/api/client-orders/by-client-id/client-order-id",
      {
        method: "PUT",
        body: {
          organizationGuid: "org",
          counterpartyGuid: "counterparty",
          items: [],
          clientRevision: 3,
          intent: "SUBMIT",
        },
      timeoutMs: 65_000,
      },
    );
  });
});

describe('source-bound linked order reads',()=>{
 const guid='b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664';
 beforeEach(()=>apiClientMock.mockReset());
 it('pins the requesting account, source and cancellation while using the existing detail endpoint',async()=>{
  const controller=new AbortController();apiClientMock.mockResolvedValue({ok:true,status:200,data:{guid,sourceBaseKey:'torg2026',readOnly:true,items:[],events:[]}} as any);
  const result=await getClientOrder(guid,{baseKey:'torg2026',expectedUserId:121,signal:controller.signal});
  expect(result.sourceBaseKey).toBe('torg2026');expect(apiClientMock).toHaveBeenCalledWith('/api/client-orders/'+guid+'?baseKey=torg2026',expect.objectContaining({expectedUserId:121,signal:controller.signal,networkRetryCount:0}));
 });
 it.each([{guid,sourceBaseKey:'other',readOnly:true},{guid,sourceBaseKey:'torg2026',readOnly:false},{guid:'11111111-1111-4111-8111-111111111111',sourceBaseKey:'torg2026',readOnly:true}])('rejects a different source/document or editable result without fallback: %j',async data=>{
  apiClientMock.mockResolvedValue({ok:true,status:200,data} as any);await expect(getClientOrder(guid,{baseKey:'torg2026',expectedUserId:121})).rejects.toMatchObject({code:'CLIENT_ORDER_SOURCE_MISMATCH'});expect(apiClientMock).toHaveBeenCalledTimes(1);
 });
 it('preserves personal connection errors for the protected form',async()=>{
  apiClientMock.mockResolvedValue({ok:false,status:422,backendErrorCode:'ONEC_AUTH_REQUIRED',message:'Нужно подключение 1С'} as any);await expect(getClientOrder(guid,{baseKey:'torg2026',expectedUserId:121})).rejects.toMatchObject({code:'ONEC_AUTH_REQUIRED'});
 });
});


it('does not normalize HTTP202 pending detail into an empty order', async () => {
  apiClientMock.mockResolvedValueOnce({ok: true, status: 202, data: {pending: true, item: null, readState: {source: 'none', refreshPending: true}}} as any);
  await expect(getClientOrder('pending-order', {expectedUserId: 121})).rejects.toMatchObject({code: 'CLIENT_ORDER_READ_PENDING', readState: {source: 'none'}});
});


it('refreshes pending reference pages invisibly and clears them after access revocation', async () => {
  jest.useFakeTimers();
  const signal = new AbortController(); const onRefresh = jest.fn();
  apiClientMock.mockResolvedValueOnce({ok:true,status:200,data:{items:[{guid:'old',name:'Old'}],pending:true,readState:{source:'local',stale:true,refreshPending:true,verificationRequired:true}}} as any)
    .mockResolvedValueOnce({ok:false,status:403} as any);
  const result = await searchClientOrderCounterparties({search:'old'}, {signal:signal.signal,onRefresh});
  expect(result.meta.pending).toBe(true); expect(result.items[0].guid).toBe('old');
  await jest.advanceTimersByTimeAsync(2000);
  expect(onRefresh).toHaveBeenCalledWith({items:[],meta:{accessDenied:true,accessStatus:403}});
  signal.abort(); jest.useRealTimers();
});
