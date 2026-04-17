import { API_ENDPOINTS } from './apiEndpoints';
import { apiClient } from './apiClient';

export type PaginationMeta = {
  total?: number;
  count?: number;
  limit?: number;
  offset?: number;
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
  isActive?: boolean;
};

export type ClientOrderAgreementOption = {
  guid: string;
  name: string;
  currency?: string | null;
  isActive?: boolean;
  contract?: { guid: string; number: string } | null;
  warehouse?: { guid: string; name: string } | null;
  priceType?: { guid: string; name: string } | null;
};

export type ClientOrderContractOption = {
  guid: string;
  number: string;
  date?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  isActive?: boolean;
};

export type ClientOrderWarehouseOption = {
  guid: string;
  name: string;
  code?: string | null;
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
  isDefault?: boolean;
  isActive?: boolean;
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

export type ResolvedClientOrderDefaults = {
  organization?: ClientOrderOrganization | null;
  counterparty?: ClientOrderCounterpartyOption | null;
  agreement?: ClientOrderAgreementOption | null;
  contract?: ClientOrderContractOption | null;
  warehouse?: ClientOrderWarehouseOption | null;
  deliveryAddress?: ClientOrderDeliveryAddressOption | null;
  currency: 'RUB';
  deliveryDate?: string | null;
  deliveryDateIssue?: 'FIXED_DATE_REQUIRED' | 'FIXED_DATE_IN_PAST' | null;
  deliveryDateIssueMessage?: string | null;
  discountsEnabled?: boolean;
};

export type ClientOrderItem = {
  product: { guid: string; name: string; code?: string | null; article?: string | null; sku?: string | null; isWeight?: boolean | null };
  package?: { guid?: string | null; name?: string | null; multiplier?: number | null } | null;
  unit?: { guid?: string | null; name?: string | null; symbol?: string | null } | null;
  quantity: number;
  quantityBase?: number | null;
  basePrice?: number | null;
  price?: number | null;
  isManualPrice?: boolean;
  manualPrice?: number | null;
  priceSource?: string | null;
  priceType?: { guid: string; name: string } | null;
  discountPercent?: number | null;
  appliedDiscountPercent?: number | null;
  lineAmount?: number | null;
  comment?: string | null;
  stock?: { quantity?: number | null; reserved?: number | null; available?: number | null } | null;
};

export type ClientOrder = {
  guid: string;
  number1c?: string | null;
  date1c?: string | null;
  source: string;
  createdAt?: string;
  updatedAt?: string;
  sourceUpdatedAt?: string | null;
  revision: number;
  syncState: string;
  status: string;
  comment?: string | null;
  deliveryDate?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  generalDiscountPercent?: number | null;
  generalDiscountAmount?: number | null;
  queuedAt?: string | null;
  sentTo1cAt?: string | null;
  lastStatusSyncAt?: string | null;
  exportAttempts?: number;
  lastExportError?: string | null;
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
  deliveryAddress?: { guid?: string | null; fullAddress?: string | null; name?: string | null } | null;
  organization?: ClientOrderOrganization | null;
  createdByUser?: {
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    middleName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
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

export type ClientOrderProduct = {
  guid: string;
  name: string;
  code?: string | null;
  article?: string | null;
  sku?: string | null;
  isWeight?: boolean | null;
  baseUnit?: { guid: string; name: string; symbol?: string | null } | null;
  packages: {
    guid: string;
    name: string;
    multiplier?: number | null;
    isDefault?: boolean;
    unit?: { guid: string; name: string; symbol?: string | null } | null;
  }[];
  basePrice?: number | null;
  receiptPrice?: number | null;
  currency?: string | null;
  priceType?: { guid: string; name: string } | null;
  stock?: { quantity?: number | null; reserved?: number | null; available?: number | null } | null;
  priceMatch?: any;
  priceError?: string | null;
};

function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  return query.toString();
}

function getErrorMessage(fallback: string, message?: string) {
  return message || fallback;
}

function mapPagedResponse<T>(res: { ok: boolean; data?: { items?: T[] } | T[]; meta?: PaginationMeta; message?: string }, fallback: string): PagedResult<T> {
  if (!res.ok || !res.data) throw new Error(getErrorMessage(fallback, res.message));
  const data = Array.isArray(res.data) ? res.data : res.data.items;
  return {
    items: Array.isArray(data) ? data : [],
    meta: res.meta || {},
  };
}

export async function getClientOrders(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
  counterpartyGuid?: string;
}) {
  const query = buildQuery(params || {});
  const path = query ? `${API_ENDPOINTS.CLIENT_ORDERS.LIST}?${query}` : API_ENDPOINTS.CLIENT_ORDERS.LIST;
  const res = await apiClient<void, { items: ClientOrder[] }>(path);
  return mapPagedResponse(res, 'Не удалось загрузить заказы клиентов');
}

export async function getClientOrder(guid: string) {
  const res = await apiClient<void, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.DETAIL(guid));
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось загрузить заказ клиента', res.message));
  return res.data;
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

export async function getClientOrderDefaults(params: { organizationGuid: string; counterpartyGuid: string }) {
  const query = buildQuery(params);
  const res = await apiClient<void, ResolvedClientOrderDefaults>(`${API_ENDPOINTS.CLIENT_ORDERS.DEFAULTS}?${query}`);
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось получить данные по умолчанию', res.message));
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
  const res = await apiClient<void, { items: T[] }>(path);
  return mapPagedResponse(res, fallbackMessage);
}

export function searchClientOrderCounterparties(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
}) {
  return getPagedSelector<ClientOrderCounterpartyOption>(
    API_ENDPOINTS.CLIENT_ORDERS.COUNTERPARTIES,
    params || {},
    'Не удалось загрузить контрагентов'
  );
}

export function searchClientOrderAgreements(params?: {
  counterpartyGuid?: string;
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

export async function createClientOrder(payload: any) {
  const res = await apiClient<typeof payload, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.LIST, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось создать заказ клиента', res.message));
  return res.data;
}

export async function updateClientOrder(guid: string, payload: any) {
  const res = await apiClient<typeof payload, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.DETAIL(guid), {
    method: 'PATCH',
    body: payload,
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось обновить заказ клиента', res.message));
  return res.data;
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
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось отправить заказ клиента', res.message));
  return res.data;
}

export async function cancelClientOrder(guid: string, revision: number, reason?: string) {
  const res = await apiClient<{ revision: number; reason?: string }, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.CANCEL(guid), {
    method: 'POST',
    body: { revision, reason },
  });
  if (!res.ok || !res.data) throw new Error(getErrorMessage('Не удалось отменить заказ клиента', res.message));
  return res.data;
}
