import {
  copyClientOrder,
  downloadClientOrderInvoice,
  getClientOrder,
  getClientOrderInvoices,
  getClientOrderInvoiceStatuses,
  getClientOrderProductsBatch,
  getClientOrders,
  getClientOrdersTodaySummary,
  putClientOrderByClientId,
  searchClientOrderCounterparties,
  searchClientOrderProducts,
  requestClientOrderInvoice,
  submitClientOrder,
} from "../utils/clientOrdersService";
import { apiClient } from "../utils/apiClient";

jest.mock("../utils/apiClient", () => ({
  apiClient: jest.fn(),
}));

jest.mock("@/src/features/productCatalog", () => ({
  scheduleProductCatalogSync: jest.fn(),
  searchCatalogProducts: jest.fn(async () => null),
}));

const apiClientMock = jest.mocked(apiClient);

describe("clientOrdersService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      "/api/client-orders/order-guid/invoices",
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
