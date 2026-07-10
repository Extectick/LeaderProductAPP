import { API_ENDPOINTS } from './apiEndpoints';
import { apiClient } from './apiClient';

const CLIENT_ORDERS_REQUEST_TIMEOUT_MS = 10_000;

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
};

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

export type ClientOrder = {
  guid: string;
  appGuid?: string | null;
  documentGuid?: string | null;
  number1c?: string | null;
  date1c?: string | null;
  source: string;
  origin?: 'local' | 'onec' | 'merged' | string;
  readOnly?: boolean;
  readOnlyReason?: string | null;
  hasRealization?: boolean;
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
  last1cSnapshot?: any;
  counterparty?: { guid: string; name: string } | null;
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
  warnings?: string[];
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
  if (!message) return fallback;
  const normalized = String(message).trim();
  const looksTechnical =
    normalized.startsWith('{') ||
    normalized.startsWith('[') ||
    normalized.startsWith('<!DOCTYPE') ||
    normalized.includes('"path"') ||
    normalized.includes('"code"') ||
    normalized.includes('ZodError') ||
    normalized.includes('expected number') ||
    normalized.includes('\n    at ');
  return looksTechnical ? fallback : normalized.slice(0, 240);
}

function throwApiError(fallback: string, res: { message?: string; status?: number; errorCode?: string }): never {
  const error = new Error(getErrorMessage(fallback, res.message)) as Error & {
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
  return {
    ...order,
    items,
    events,
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
    const res = await apiClient<void, { items: ClientOrder[] }>(path);
    return normalizeClientOrderPage(mapPagedResponse(res, 'Не удалось загрузить заказы клиентов'));
  });
}

export async function getClientOrder(guid: string) {
  const path = API_ENDPOINTS.CLIENT_ORDERS.DETAIL(guid);
  return dedupeRead(`GET ${path}`, async () => {
    const res = await apiClient<void, ClientOrder>(path);
    if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось загрузить заказ клиента', res.message));
    return normalizeClientOrder(res.data);
  });
}

export async function getClientOrdersReferenceData(counterpartyGuid?: string) {
  // Legacy compatibility only. New client-orders screens use paged selector endpoints.
  const query = buildQuery({ counterpartyGuid });
  const path = query
    ? `${API_ENDPOINTS.CLIENT_ORDERS.REFERENCE_DATA}?${query}`
    : API_ENDPOINTS.CLIENT_ORDERS.REFERENCE_DATA;
  const res = await apiClient<void, ClientOrdersReferenceData>(path);
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
    const res = await apiClient<void, ClientOrderDefaults>(path);
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
    const res = await apiClient<void, { items: T[] }>(path);
    return mapPagedResponse(res, fallbackMessage);
  });
}

export function searchClientOrderCounterparties(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
  managerOnly?: boolean;
}) {
  return getPagedSelector<ClientOrderCounterpartyOption>(
    API_ENDPOINTS.CLIENT_ORDERS.COUNTERPARTIES,
    params || {},
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
  return getPagedSelector<ClientOrderProduct>(API_ENDPOINTS.CLIENT_ORDERS.PRODUCTS, params, 'Не удалось загрузить номенклатуру');
}

export async function getClientOrderProductsBatch(payload: {
  productGuids: string[];
  organizationGuid?: string;
  counterpartyGuid?: string;
  agreementGuid?: string;
  warehouseGuid?: string;
  priceTypeGuid?: string;
}) {
  const productGuids = [...new Set(payload.productGuids)].sort();
  const key = `POST ${API_ENDPOINTS.CLIENT_ORDERS.PRODUCTS_BATCH} ${JSON.stringify({ ...payload, productGuids })}`;
  return dedupeRead(key, async () => {
    const res = await apiClient<typeof payload, { items: ClientOrderProduct[] }>(
      API_ENDPOINTS.CLIENT_ORDERS.PRODUCTS_BATCH,
      { method: 'POST', body: payload }
    );
    if (!res.ok || !res.data) {
      throw new Error(getErrorMessage('Не удалось обновить цены и остатки товаров', res.message));
    }
    return Array.isArray(res.data.items) ? res.data.items : [];
  });
}

export async function createClientOrder(payload: any) {
  const res = await apiClient<typeof payload, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.LIST, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok || !res.data) throwApiError('Не удалось создать заказ клиента', res);
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
