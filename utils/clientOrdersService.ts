import { API_ENDPOINTS } from './apiEndpoints';
import { apiClient } from './apiClient';
import { toUserErrorMessage } from '@/src/shared/errors/userErrorMessage';
import { scheduleProductCatalogSync, searchCatalogProducts } from '@/src/features/productCatalog';

const CLIENT_ORDERS_REQUEST_TIMEOUT_MS = 65_000;

export type PaginationMeta = {
  total?: number;
  count?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  statusCounts?: Record<string, number>;
  liveSource?: {
    status: string;
    message?: string;
  };
};

export type PagedResult<T> = {
  items: T[];
  meta: PaginationMeta;
};

export type ClientOrdersTodaySummary = {
  date: string;
  ordersCount: number;
  clientsCount: number;
  totalAmount: number;
  profit: number | null;
  profitAvailable: boolean;
  profitBasisAmount: number;
  profitabilityPercent: number | null;
  missingReceiptPriceCount: number;
  skippedReceiptPriceCount: number;
  currency: 'RUB';
  calculatedAt: string;
  stale?: boolean;
};

export type ClientOrderEvent = {
  id: string;
  revision: number;
  source: string;
  eventType: string;
  payload: any;
  note?: string | null;
  createdAt: string;
  actorUser?: {
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    middleName?: string | null;
    email?: string | null;
  } | null;
};

export type ClientOrderOrganization = {
  guid: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
  isSelectable?: boolean;
};

export type ClientOrderCounterpartyOption = {
  guid: string;
  name: string;
  fullName?: string | null;
  inn?: string | null;
  kpp?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  managerGuid?: string | null;
  managerName?: string | null;
  manager?: { guid?: string | null; name?: string | null } | null;
  hasDebt?: boolean;
  shipmentProhibited?: boolean;
  debtReason?: string | null;
};

export type ClientOrderDebtStatus = 'all' | 'with_debt' | 'without_debt';

export type ClientOrderAgreementOption = {
  guid: string;
  name: string;
  number?: string | null;
  date?: string | null;
  counterpartyGuid?: string | null;
  organizationGuid?: string | null;
  organization?: ClientOrderOrganization | null;
  managerGuid?: string | null;
  managerName?: string | null;
  manager?: { guid?: string | null; name?: string | null } | null;
  contractGuid?: string | null;
  warehouseGuid?: string | null;
  priceTypeGuid?: string | null;
  currency?: string | null;
  status?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  contract?: { guid: string; number: string } | null;
  warehouse?: { guid: string; name: string } | null;
  priceType?: { guid: string; name: string } | null;
};

export type ClientOrderContractOption = {
  guid: string;
  number: string;
  name?: string | null;
  date?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  counterpartyGuid?: string | null;
  organizationGuid?: string | null;
  organization?: ClientOrderOrganization | null;
  managerGuid?: string | null;
  managerName?: string | null;
  manager?: { guid?: string | null; name?: string | null } | null;
  status?: string | null;
  currency?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
};

export type ClientOrderWarehouseOption = {
  guid: string;
  name: string;
  code?: string | null;
  address?: string | null;
  isDefault?: boolean;
  isPickup?: boolean;
  isActive?: boolean;
  parentGuid?: string | null;
  parentName?: string | null;
  cityGuid?: string | null;
  cityName?: string | null;
  sortOrder?: number | null;
  isSelectable?: boolean;
};

export type ClientOrderPriceTypeOption = {
  guid: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
};

export type ClientOrderReferenceKind =
  | 'organization'
  | 'counterparty'
  | 'agreement'
  | 'contract'
  | 'warehouse'
  | 'delivery-address'
  | 'price-type';

export type ClientOrderReferenceDetailsSection = {
  title: string;
  rows: { label: string; value: unknown }[];
};

export type ClientOrderReferenceDetails = {
  kind: ClientOrderReferenceKind;
  guid: string;
  title: string;
  subtitle?: string | null;
  sections: ClientOrderReferenceDetailsSection[];
  debug: unknown;
};

export type ClientOrderDeliveryAddressOption = {
  guid?: string | null;
  name?: string | null;
  fullAddress?: string | null;
  address?: string | null;
  deliveryNumber?: string | null;
  number?: string | null;
  comment?: string | null;
  deliveryComment?: string | null;
  kindName?: string | null;
  contactInfoKind?: string | null;
  counterpartyGuid?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
};

export type ClientOrderEnumOption = {
  code?: string | null;
  name?: string | null;
  label?: string | null;
};

export type ClientOrderSettings = {
  organizations: ClientOrderOrganization[];
  preferredOrganization?: ClientOrderOrganization | null;
  deliveryDateMode: 'NEXT_DAY' | 'OFFSET_DAYS' | 'FIXED_DATE';
  deliveryDateOffsetDays: number;
  fixedDeliveryDate?: string | null;
  resolvedDeliveryDate?: string | null;
  deliveryDateIssue?: 'FIXED_DATE_REQUIRED' | 'FIXED_DATE_IN_PAST' | null;
  deliveryDateIssueMessage?: string | null;
  currency: 'RUB';
};

export type ClientOrderItem = {
  lineGuid?: string | null;
  product: {
    guid: string;
    name: string;
    code?: string | null;
    article?: string | null;
    sku?: string | null;
    isWeight?: boolean | null;
    weight?: number | null;
    weightUnit?: { guid?: string | null; name?: string | null; symbol?: string | null } | null;
    imageThumbUrl?: string | null;
    imagePreviewUrl?: string | null;
    imageHash?: string | null;
    images?: ClientOrderProductImage[];
  };
  package?: { guid?: string | null; name?: string | null; multiplier?: number | null; weight?: number | null; weightUnit?: { guid?: string | null; name?: string | null; symbol?: string | null } | null } | null;
  unit?: { guid?: string | null; name?: string | null; symbol?: string | null } | null;
  quantity: number;
  quantityBase?: number | null;
  basePrice?: number | null;
  receiptPrice?: number | null;
  price?: number | null;
  isManualPrice?: boolean;
  manualPrice?: number | null;
  priceSource?: string | null;
  isCancelled?: boolean;
  cancelReasonGuid?: string | null;
  cancelReasonName?: string | null;
  cancelReason?: string | null;
  cancelledAmount?: number | null;
  priceType?: { guid: string; name: string } | null;
  discountPercent?: number | null;
  appliedDiscountPercent?: number | null;
  lineAmount?: number | null;
  comment?: string | null;
  stock?: {
    quantity?: number | null;
    reserved?: number | null;
    available?: number | null;
    freeAvailable?: number | null;
    myReserved?: number | null;
  } | null;
};

export type ClientOrderProductImage = {
  id: string;
  fileGuid: string;
  thumbUrl: string;
  previewUrl: string;
  isMain: boolean;
  hash: string;
};

export type ClientOrderExportItemError = {
  code?: string | null;
  lineGuid?: string | null;
  productGuid?: string | null;
  productName?: string | null;
  requiredBase?: number | null;
  available?: number | null;
  message: string;
};

export type ClientOrderExportValidation = {
  message?: string | null;
  itemErrors?: ClientOrderExportItemError[];
};

export type ClientOrderInvoiceState =
  | 'NOT_REQUESTED'
  | 'WAITING'
  | 'QUEUED'
  | 'SENDING'
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'SENT'
  | 'ERROR';

export type ClientOrderInvoice = {
  id: string;
  realizationGuid?: string | null;
  realizationNumber?: string | null;
  realizationDate?: string | null;
  version: number;
  state: ClientOrderInvoiceState;
  waitReason?: string | null;
  downloadAvailable?: boolean;
  fileName?: string | null;
  createdAt?: string | null;
  sentAt?: string | null;
  updatedAt?: string | null;
};

export type ClientOrder = {
  guid: string;
  clientOrderId?: string | null;
  clientRevision?: number | null;
  appGuid?: string | null;
  documentGuid?: string | null;
  number1c?: string | null;
  date1c?: string | null;
  source: string;
  origin?: 'local' | 'onec' | 'merged' | string;
  readOnly?: boolean;
  readOnlyReason?: string | null;
  hasRealization?: boolean;
  invoiceRequested?: boolean;
  invoiceState?: ClientOrderInvoiceState;
  invoiceWaitReason?: string | null;
  latestInvoiceVersion?: number | null;
  invoiceCount?: number;
  invoiceDownloadAvailable?: boolean;
  /** Client-only optimistic marker used until the invoice queue appears in API summaries. */
  invoiceRequestPending?: boolean;
  invoices?: ClientOrderInvoice[];
  realizationDetectedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sourceUpdatedAt?: string | null;
  revision: number;
  syncState: string;
  status: string;
  queuePosition?: number | null;
  status1c?: string | null;
  currentState1c?: string | null;
  documentStatus1c?: string | null;
  comment?: string | null;
  deliveryDate?: string | null;
  paymentForm?: string | null;
  deliveryMethod?: string | null;
  totalAmount?: number | null;
  profit?: number | null;
  profitAvailable?: boolean;
  profitBasisAmount?: number | null;
  profitabilityPercent?: number | null;
  missingReceiptPriceCount?: number;
  currency?: string | null;
  priceType?: { guid: string; name: string } | null;
  generalDiscountPercent?: number | null;
  generalDiscountAmount?: number | null;
  queuedAt?: string | null;
  sentTo1cAt?: string | null;
  lastStatusSyncAt?: string | null;
  exportAttempts?: number;
  lastExportError?: string | null;
  exportValidation?: ClientOrderExportValidation | null;
  isPostedIn1c?: boolean;
  postedAt1c?: string | null;
  cancelRequestedAt?: string | null;
  cancelReason?: string | null;
  last1cError?: string | null;
  hasDebt?: boolean;
  shipmentProhibited?: boolean;
  debtReason?: string | null;
  last1cSnapshot?: any;
  counterparty?: ClientOrderCounterpartyOption | null;
  agreement?: ClientOrderAgreementOption | null;
  contract?: { guid: string; number: string } | null;
  warehouse?: { guid: string; name: string; code?: string | null } | null;
  deliveryAddress?: ClientOrderDeliveryAddressOption | null;
  organization?: ClientOrderOrganization | null;
  createdByUser?: {
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    middleName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  itemsCount?: number;
  items: ClientOrderItem[];
  events: ClientOrderEvent[];
};

export type ClientOrdersReferenceData = {
  counterparties: ClientOrderCounterpartyOption[];
  agreements: ClientOrderAgreementOption[];
  contracts: ClientOrderContractOption[];
  deliveryAddresses: ClientOrderDeliveryAddressOption[];
  warehouses: ClientOrderWarehouseOption[];
};

export type ClientOrderDefaults = {
  organization?: ClientOrderOrganization | null;
  counterparty?: ClientOrderCounterpartyOption | null;
  agreement?: ClientOrderAgreementOption | null;
  contract?: ClientOrderContractOption | null;
  warehouse?: ClientOrderWarehouseOption | null;
  deliveryAddress?: ClientOrderDeliveryAddressOption | null;
  priceType?: ClientOrderPriceTypeOption | null;
  paymentForm?: string | null;
  paymentForms?: ClientOrderEnumOption[];
  deliveryMethod?: string | null;
  deliveryMethods?: ClientOrderEnumOption[];
  currency?: string | null;
  deliveryDate?: string | null;
  deliveryDateIssue?: string | null;
  deliveryDateIssueMessage?: string | null;
  discountsEnabled?: boolean;
  invoiceRequested?: boolean;
  warnings?: string[];
  hasDebt?: boolean;
  shipmentProhibited?: boolean;
  debtReason?: string | null;
};

export type ClientOrderProduct = {
  guid: string;
  name: string;
  code?: string | null;
  article?: string | null;
  sku?: string | null;
  isWeight?: boolean | null;
  baseUnit?: { guid: string; name: string; symbol?: string | null } | null;
  weight?: number | null;
  weightUnit?: { guid: string; name: string; symbol?: string | null } | null;
  packages: {
    guid: string;
    name: string;
    multiplier?: number | null;
    weight?: number | null;
    weightUnit?: { guid: string; name: string; symbol?: string | null } | null;
    isDefault?: boolean;
    unit?: { guid: string; name: string; symbol?: string | null } | null;
  }[];
  basePrice?: number | null;
  receiptPrice?: number | null;
  currency?: string | null;
  priceType?: { guid: string; name: string } | null;
  stock?: {
    quantity?: number | null;
    reserved?: number | null;
    available?: number | null;
    freeAvailable?: number | null;
    myReserved?: number | null;
  } | null;
  priceMatch?: any;
  priceError?: string | null;
  imageThumbUrl?: string | null;
  imagePreviewUrl?: string | null;
  imageHash?: string | null;
  images?: ClientOrderProductImage[];
};

function buildQuery(params: Record<string, string | number | boolean | string[] | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item || '').trim()).filter(Boolean);
      if (items.length) query.set(key, items.join(','));
      return;
    }
    query.set(key, String(value));
  });
  return query.toString();
}

const pendingClientOrderReads = new Map<string, Promise<unknown>>();

function dedupeRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const pending = pendingClientOrderReads.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const task = loader().finally(() => {
    pendingClientOrderReads.delete(key);
  });
  pendingClientOrderReads.set(key, task);
  return task;
}

function getErrorMessage(fallback: string, message?: string) {
  return toUserErrorMessage(message, fallback);
}

function throwApiError(fallback: string, res: { message?: string; status?: number; errorCode?: string }): never {
  const error = new Error(toUserErrorMessage(res, fallback)) as Error & {
    status?: number;
    errorCode?: string;
  };
  error.status = res.status;
  error.errorCode = res.errorCode;
  throw error;
}

function mapPagedResponse<T>(res: { ok: boolean; data?: { items?: T[] } | T[]; meta?: PaginationMeta; message?: string }, fallback: string): PagedResult<T> {
  if (!res.ok || !res.data) throw new Error(getErrorMessage(fallback, res.message));
  const data = Array.isArray(res.data) ? res.data : res.data.items;
  return {
    items: Array.isArray(data) ? data : [],
    meta: res.meta || {},
  };
}

function normalizeClientOrder(order: ClientOrder): ClientOrder {
  const items = Array.isArray((order as any).items) ? order.items : [];
  const events = Array.isArray((order as any).events) ? order.events : [];
  const invoices: ClientOrderInvoice[] = Array.isArray(order.invoices) ? order.invoices : [];
  return {
    ...order,
    items,
    events,
    invoices,
    invoiceRequested: !!order.invoiceRequested,
    invoiceState: order.invoiceState || (order.invoiceRequested ? 'WAITING' : 'NOT_REQUESTED'),
    invoiceCount: Math.max(Number(order.invoiceCount || 0), invoices.length),
    invoiceDownloadAvailable: !!order.invoiceDownloadAvailable || invoices.some((invoice) => !!invoice?.downloadAvailable),
    itemsCount: order.itemsCount ?? items.length,
  };
}

function normalizeClientOrderPage(result: PagedResult<ClientOrder>): PagedResult<ClientOrder> {
  return {
    ...result,
    items: result.items.map(normalizeClientOrder),
  };
}

export async function getClientOrders(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  statuses?: string[];
  syncState?: string;
  search?: string;
  counterpartyGuid?: string;
  organizationGuid?: string;
  warehouseGuid?: string;
  priceTypeGuid?: string;
  amountMin?: string;
  amountMax?: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  itemsMin?: string;
  itemsMax?: string;
  hasNumber1c?: string;
  onlyProblems?: boolean;
}) {
  const query = buildQuery(params || {});
  const path = query ? `${API_ENDPOINTS.CLIENT_ORDERS.LIST}?${query}` : API_ENDPOINTS.CLIENT_ORDERS.LIST;
  return dedupeRead(`GET ${path}`, async () => {
    const res = await apiClient<void, { items: ClientOrder[] }>(path, {
      timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
    });
    return normalizeClientOrderPage(mapPagedResponse(res, 'Не удалось загрузить заказы клиентов'));
  });
}

export async function getClientOrdersTodaySummary(options: { force?: boolean } = {}) {
  const path = options.force
    ? `${API_ENDPOINTS.CLIENT_ORDERS.TODAY_SUMMARY}?force=1`
    : API_ENDPOINTS.CLIENT_ORDERS.TODAY_SUMMARY;
  const load = async () => {
    const res = await apiClient<void, ClientOrdersTodaySummary>(path, {
      timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
    });
    if (!res.ok || !res.data) {
      throwApiError('Не удалось загрузить статистику заказов за сегодня', res);
    }
    return res.data;
  };
  return options.force ? load() : dedupeRead(`GET ${path}`, load);
}

export async function getClientOrder(guid: string) {
  const path = API_ENDPOINTS.CLIENT_ORDERS.DETAIL(guid);
  return dedupeRead(`GET ${path}`, async () => {
    const res = await apiClient<void, ClientOrder>(path, {
      timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
    });
    if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось загрузить заказ клиента', res.message));
    return normalizeClientOrder(res.data);
  });
}

export async function getClientOrderInvoices(guid: string) {
  const path = API_ENDPOINTS.CLIENT_ORDERS.INVOICES(guid);
  const res = await apiClient<void, { items?: ClientOrderInvoice[] } | ClientOrderInvoice[]>(path);
  if (!res.ok || !res.data) throwApiError('Не удалось загрузить счета заказа', res);
  const items = Array.isArray(res.data) ? res.data : res.data.items;
  return Array.isArray(items) ? items : [];
}

export type ClientOrderInvoiceStatus = {
  identifier: string;
  invoices: ClientOrderInvoice[];
};

const PRODUCT_BATCH_VALUE_TTL_MS = 15_000;
const PRODUCT_BATCH_VALUE_CACHE_MAX = 1_500;
const productBatchValueCache = new Map<string, { item: ClientOrderProduct; cachedAt: number }>();

export async function getClientOrderInvoiceStatuses(identifiers: string[]) {
  const uniqueIdentifiers = Array.from(new Set(
    identifiers.map((value) => value.trim()).filter(Boolean)
  ));
  if (!uniqueIdentifiers.length) return [];

  const res = await apiClient<{ identifiers: string[] }, { items?: ClientOrderInvoiceStatus[] }>(
    API_ENDPOINTS.CLIENT_ORDERS.INVOICE_STATUSES,
    {
      method: 'POST',
      body: { identifiers: uniqueIdentifiers },
    }
  );
  if (!res.ok || !res.data) throwApiError('Не удалось обновить статусы счетов', res);
  return Array.isArray(res.data.items) ? res.data.items : [];
}

export async function requestClientOrderInvoice(guid: string) {
  const path = API_ENDPOINTS.CLIENT_ORDERS.INVOICE_REQUEST(guid);
  const res = await apiClient<Record<string, never>, { requested?: boolean; message?: string | null; items?: ClientOrderInvoice[] }>(path, {
    method: 'POST',
    body: {},
  });
  if (!res.ok || !res.data) throwApiError('Не удалось запросить счёт', res);
  return {
    requested: res.data.requested !== false,
    message: res.data.message ?? null,
    items: Array.isArray(res.data.items) ? res.data.items : [],
  };
}

export async function downloadClientOrderInvoice(guid: string, invoiceId: string) {
  const res = await apiClient<void, Blob>(API_ENDPOINTS.CLIENT_ORDERS.INVOICE_DOWNLOAD(guid, invoiceId), {
    timeoutMs: 60_000,
    headers: { Accept: 'application/pdf' },
  });
  if (!res.ok || !res.data) throwApiError('Не удалось скачать счёт', res);
  return res.data;
}

export async function getClientOrdersReferenceData(counterpartyGuid?: string) {
  // Legacy compatibility only. New client-orders screens use paged selector endpoints.
  const query = buildQuery({ counterpartyGuid });
  const path = query
    ? `${API_ENDPOINTS.CLIENT_ORDERS.REFERENCE_DATA}?${query}`
    : API_ENDPOINTS.CLIENT_ORDERS.REFERENCE_DATA;
  const res = await apiClient<void, ClientOrdersReferenceData>(path, {
    timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось загрузить справочники заказа', res.message));
  return res.data;
}

export async function getClientOrderDefaults(params: {
  organizationGuid: string;
  counterpartyGuid: string;
}) {
  const query = buildQuery(params);
  const path = `${API_ENDPOINTS.CLIENT_ORDERS.DEFAULTS}?${query}`;
  return dedupeRead(`GET ${path}`, async () => {
    const res = await apiClient<void, ClientOrderDefaults>(path, {
      timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
    });
    if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось получить значения по умолчанию', res.message));
    return res.data;
  });
}

export async function getClientOrderSettings() {
  const res = await apiClient<void, ClientOrderSettings>(API_ENDPOINTS.CLIENT_ORDERS.SETTINGS);
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось загрузить настройки заказов клиентов', res.message));
  return res.data;
}

export async function updateClientOrderSettings(payload: {
  preferredOrganizationGuid?: string | null;
  deliveryDateMode?: 'NEXT_DAY' | 'OFFSET_DAYS' | 'FIXED_DATE';
  deliveryDateOffsetDays?: number;
  fixedDeliveryDate?: string | null;
}) {
  const res = await apiClient<typeof payload, ClientOrderSettings>(API_ENDPOINTS.CLIENT_ORDERS.SETTINGS, {
    method: 'PUT',
    body: payload,
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось обновить настройки заказов клиентов', res.message));
  return res.data;
}

export async function getClientOrderReferenceDetails(kind: ClientOrderReferenceKind, guid: string) {
  const res = await apiClient<void, ClientOrderReferenceDetails>(API_ENDPOINTS.CLIENT_ORDERS.REFERENCE_DETAILS(kind, guid));
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось загрузить карточку реквизита', res.message));
  return res.data;
}

async function getPagedSelector<T>(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined | null>,
  fallbackMessage: string
) {
  const query = buildQuery(params);
  const path = query ? `${endpoint}?${query}` : endpoint;
  return dedupeRead(`GET ${path}`, async () => {
    const res = await apiClient<void, { items: T[] }>(path, {
      timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
    });
    return mapPagedResponse(res, fallbackMessage);
  });
}

export function searchClientOrderCounterparties(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
  managerOnly?: boolean;
  organizationGuid?: string;
  debtStatus?: ClientOrderDebtStatus;
}) {
  return getPagedSelector<ClientOrderCounterpartyOption>(
    API_ENDPOINTS.CLIENT_ORDERS.COUNTERPARTIES,
    { ...(params || {}), debtStatus: params?.debtStatus ?? 'all' },
    'Не удалось загрузить контрагентов'
  );
}

export function searchClientOrderAgreements(params?: {
  counterpartyGuid?: string;
  organizationGuid?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}) {
  return getPagedSelector<ClientOrderAgreementOption>(
    API_ENDPOINTS.CLIENT_ORDERS.AGREEMENTS,
    params || {},
    'Не удалось загрузить соглашения'
  );
}

export function searchClientOrderContracts(params?: {
  counterpartyGuid?: string;
  organizationGuid?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}) {
  return getPagedSelector<ClientOrderContractOption>(
    API_ENDPOINTS.CLIENT_ORDERS.CONTRACTS,
    params || {},
    'Не удалось загрузить договоры'
  );
}

export function searchClientOrderWarehouses(params?: {
  counterpartyGuid?: string;
  organizationGuid?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}) {
  return getPagedSelector<ClientOrderWarehouseOption>(
    API_ENDPOINTS.CLIENT_ORDERS.WAREHOUSES,
    params || {},
    'Не удалось загрузить склады'
  );
}

export function searchClientOrderPriceTypes(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}) {
  return getPagedSelector<ClientOrderPriceTypeOption>(
    API_ENDPOINTS.CLIENT_ORDERS.PRICE_TYPES,
    params || {},
    'Не удалось загрузить виды цен'
  );
}

export function searchClientOrderDeliveryAddresses(params?: {
  counterpartyGuid?: string;
  organizationGuid?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}) {
  return getPagedSelector<ClientOrderDeliveryAddressOption>(
    API_ENDPOINTS.CLIENT_ORDERS.DELIVERY_ADDRESSES,
    params || {},
    'Не удалось загрузить адреса доставки'
  );
}

export async function searchClientOrderProducts(params: {
  search?: string;
  organizationGuid?: string;
  counterpartyGuid?: string;
  agreementGuid?: string;
  warehouseGuid?: string;
  priceTypeGuid?: string;
  inStockOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  scheduleProductCatalogSync();
  // Точный фильтр наличия зависит от склада и собственного резерва менеджера.
  // Поэтому только этот режим остаётся живым запросом, обычный поиск идёт из SQLite.
  if (!params.inStockOnly) {
    try {
      const local = await searchCatalogProducts(params.search || '', params.limit || 50, params.offset || 0);
      if (local) {
        return {
          items: local.items,
          meta: {
            total: local.total,
            count: local.items.length,
            limit: params.limit || 50,
            offset: params.offset || 0,
            hasMore: local.hasMore,
          },
          localCatalog: true as const,
        };
      }
    } catch (error) {
      console.warn('[catalog] local search failed, using API fallback', error);
    }
  }
  return getPagedSelector<ClientOrderProduct>(API_ENDPOINTS.CLIENT_ORDERS.PRODUCTS, params, 'Не удалось загрузить номенклатуру');
}

export async function getClientOrderProductsBatch(payload: {
  productGuids: string[];
  organizationGuid?: string;
  counterpartyGuid?: string;
  agreementGuid?: string;
  warehouseGuid?: string;
  priceTypeGuid?: string;
  receiptPriceAt?: string;
}) {
  const productGuids = [...new Set(payload.productGuids)].sort();
  const contextKey = JSON.stringify({
    organizationGuid: payload.organizationGuid || '',
    counterpartyGuid: payload.counterpartyGuid || '',
    agreementGuid: payload.agreementGuid || '',
    warehouseGuid: payload.warehouseGuid || '',
    priceTypeGuid: payload.priceTypeGuid || '',
    receiptPriceAt: payload.receiptPriceAt || '',
  });
  const now = Date.now();
  const cachedByGuid = new Map<string, ClientOrderProduct>();
  const missingGuids: string[] = [];
  for (const guid of productGuids) {
    const cached = productBatchValueCache.get(`${contextKey}|${guid}`);
    if (cached && now - cached.cachedAt <= PRODUCT_BATCH_VALUE_TTL_MS) {
      cachedByGuid.set(guid, cached.item);
    } else {
      missingGuids.push(guid);
    }
  }
  if (!missingGuids.length) return productGuids.map((guid) => cachedByGuid.get(guid)!).filter(Boolean);

  const requestPayload = { ...payload, productGuids: missingGuids };
  const key = `POST ${API_ENDPOINTS.CLIENT_ORDERS.PRODUCTS_BATCH} ${JSON.stringify(requestPayload)}`;
  const freshItems = await dedupeRead(key, async () => {
    const res = await apiClient<typeof requestPayload, { items: ClientOrderProduct[] }>(
      API_ENDPOINTS.CLIENT_ORDERS.PRODUCTS_BATCH,
      { method: 'POST', body: requestPayload, timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS }
    );
    if (!res.ok || !res.data) {
      throw new Error(getErrorMessage('Не удалось обновить цены и остатки товаров', res.message));
    }
    return Array.isArray(res.data.items) ? res.data.items : [];
  });
  for (const item of freshItems) {
    cachedByGuid.set(item.guid, item);
    productBatchValueCache.set(`${contextKey}|${item.guid}`, { item, cachedAt: Date.now() });
  }
  while (productBatchValueCache.size > PRODUCT_BATCH_VALUE_CACHE_MAX) {
    const oldest = productBatchValueCache.keys().next().value;
    if (!oldest) break;
    productBatchValueCache.delete(oldest);
  }
  return productGuids.map((guid) => cachedByGuid.get(guid)).filter((item): item is ClientOrderProduct => !!item);
}

export async function createClientOrder(payload: any) {
  const res = await apiClient<typeof payload, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.LIST, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok || !res.data) throwApiError('Не удалось создать заказ клиента', res);
  return normalizeClientOrder(res.data);
}

export async function putClientOrderByClientId(
  clientOrderId: string,
  payload: any,
  options: { clientRevision: number; intent: 'SAVE' | 'SUBMIT' }
) {
  const body = { ...payload, ...options };
  const res = await apiClient<typeof body, ClientOrder>(
    API_ENDPOINTS.CLIENT_ORDERS.BY_CLIENT_ID(clientOrderId),
    {
      method: 'PUT',
      body,
      timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
    }
  );
  if (!res.ok || !res.data) {
    throwApiError('Не удалось сохранить заказ клиента', res);
  }
  return normalizeClientOrder(res.data);
}

export async function updateClientOrder(guid: string, payload: any) {
  const res = await apiClient<typeof payload, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.DETAIL(guid), {
    method: 'PATCH',
    body: payload,
  });
  if (!res.ok || !res.data) throwApiError('Не удалось обновить заказ клиента', res);
  return normalizeClientOrder(res.data);
}

export async function deleteClientOrder(guid: string) {
  const res = await apiClient<void, { deleted: boolean; guid: string }>(API_ENDPOINTS.CLIENT_ORDERS.DELETE(guid), {
    method: 'DELETE',
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось удалить черновик заказа клиента', res.message));
  return res.data;
}

export async function submitClientOrder(guid: string, revision: number) {
  const res = await apiClient<{ revision: number }, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.SUBMIT(guid), {
    method: 'POST',
    body: { revision },
    timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось отправить заказ клиента', res.message));
  return normalizeClientOrder(res.data);
}

export async function unqueueClientOrder(guid: string, revision: number) {
  const res = await apiClient<{ revision: number }, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.UNQUEUE(guid), {
    method: 'POST',
    body: { revision },
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось снять заказ с очереди', res.message));
  return normalizeClientOrder(res.data);
}

export async function restoreClientOrder(guid: string, revision: number) {
  const res = await apiClient<{ revision: number }, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.RESTORE(guid), {
    method: 'POST',
    body: { revision },
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось восстановить заказ клиента', res.message));
  return normalizeClientOrder(res.data);
}

export async function copyClientOrder(guid: string, revision?: number) {
  const res = await apiClient<{ revision?: number }, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.COPY(guid), {
    method: 'POST',
    body: revision ? { revision } : {},
    timeoutMs: CLIENT_ORDERS_REQUEST_TIMEOUT_MS,
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось скопировать заказ клиента', res.message));
  return normalizeClientOrder(res.data);
}

export async function cancelClientOrder(guid: string, revision: number, reason?: string) {
  const res = await apiClient<{ revision: number; reason?: string }, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.CANCEL(guid), {
    method: 'POST',
    body: { revision, reason },
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось отменить заказ клиента', res.message));
  return normalizeClientOrder(res.data);
}
