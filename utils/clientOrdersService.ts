import { API_ENDPOINTS } from './apiEndpoints';
import { apiClient } from './apiClient';

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

export type ClientOrderItem = {
  product: { guid: string; name: string; code?: string | null; article?: string | null };
  package?: { guid?: string | null; name?: string | null; multiplier?: number | null } | null;
  unit?: { guid?: string | null; name?: string | null; symbol?: string | null } | null;
  quantity: number;
  quantityBase?: number | null;
  basePrice?: number | null;
  price?: number | null;
  isManualPrice?: boolean;
  manualPrice?: number | null;
  priceSource?: string | null;
  discountPercent?: number | null;
  appliedDiscountPercent?: number | null;
  lineAmount?: number | null;
  comment?: string | null;
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
  agreement?: { guid: string; name: string; currency?: string | null; priceType?: { guid: string; name: string } | null } | null;
  contract?: { guid: string; number: string } | null;
  warehouse?: { guid: string; name: string } | null;
  deliveryAddress?: { guid?: string | null; fullAddress?: string | null } | null;
  organization?: { guid: string; name: string; code?: string | null } | null;
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
  counterparties: Array<{ guid: string; name: string; fullName?: string | null; inn?: string | null; isActive?: boolean }>;
  agreements: Array<{
    guid: string;
    name: string;
    currency?: string | null;
    isActive?: boolean;
    contract?: { guid: string; number: string } | null;
    warehouse?: { guid: string; name: string } | null;
    priceType?: { guid: string; name: string } | null;
  }>;
  contracts: Array<{ guid: string; number: string; date?: string | null; isActive?: boolean }>;
  deliveryAddresses: Array<{ guid?: string | null; name?: string | null; fullAddress: string; isActive?: boolean }>;
  warehouses: Array<{ guid: string; name: string; code?: string | null; isDefault?: boolean; isPickup?: boolean; isActive?: boolean }>;
};

export type ClientOrderProduct = {
  guid: string;
  name: string;
  code?: string | null;
  article?: string | null;
  sku?: string | null;
  baseUnit?: { guid: string; name: string; symbol?: string | null } | null;
  packages: Array<{ guid: string; name: string; multiplier?: number | null; isDefault?: boolean; unit?: { guid: string; name: string; symbol?: string | null } | null }>;
  basePrice?: number | null;
  currency?: string | null;
  priceMatch?: any;
  priceError?: string | null;
};

type ClientOrdersListResponse = { items: ClientOrder[] };

export async function getClientOrders(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
  counterpartyGuid?: string;
}) {
  const query = new URLSearchParams();
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);
  if (params?.counterpartyGuid) query.set('counterpartyGuid', params.counterpartyGuid);

  const path = query.size ? `${API_ENDPOINTS.CLIENT_ORDERS.LIST}?${query.toString()}` : API_ENDPOINTS.CLIENT_ORDERS.LIST;
  const res = await apiClient<void, ClientOrdersListResponse>(path);
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось загрузить заказы клиентов');
  return Array.isArray(res.data.items) ? res.data.items : [];
}

export async function getClientOrder(guid: string) {
  const res = await apiClient<void, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.DETAIL(guid));
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось загрузить заказ клиента');
  return {
    counterparties: Array.isArray(res.data.counterparties) ? res.data.counterparties : [],
    agreements: Array.isArray(res.data.agreements) ? res.data.agreements : [],
    contracts: Array.isArray(res.data.contracts) ? res.data.contracts : [],
    deliveryAddresses: Array.isArray(res.data.deliveryAddresses) ? res.data.deliveryAddresses : [],
    warehouses: Array.isArray(res.data.warehouses) ? res.data.warehouses : [],
  };
}

export async function getClientOrdersReferenceData(counterpartyGuid?: string) {
  const query = new URLSearchParams();
  if (counterpartyGuid) query.set('counterpartyGuid', counterpartyGuid);
  const path = query.size
    ? `${API_ENDPOINTS.CLIENT_ORDERS.REFERENCE_DATA}?${query.toString()}`
    : API_ENDPOINTS.CLIENT_ORDERS.REFERENCE_DATA;
  const res = await apiClient<void, ClientOrdersReferenceData>(path);
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось загрузить справочники заказа');
  return res.data;
}

export async function searchClientOrderProducts(params: {
  search?: string;
  counterpartyGuid?: string;
  agreementGuid?: string;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.counterpartyGuid) query.set('counterpartyGuid', params.counterpartyGuid);
  if (params.agreementGuid) query.set('agreementGuid', params.agreementGuid);
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.offset != null) query.set('offset', String(params.offset));

  const res = await apiClient<void, { items: ClientOrderProduct[] }>(
    `${API_ENDPOINTS.CLIENT_ORDERS.PRODUCTS}?${query.toString()}`
  );
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось загрузить номенклатуру');
  return Array.isArray(res.data.items) ? res.data.items : [];
}

export async function createClientOrder(payload: any) {
  const res = await apiClient<typeof payload, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.LIST, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось создать заказ клиента');
  return res.data;
}

export async function updateClientOrder(guid: string, payload: any) {
  const res = await apiClient<typeof payload, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.DETAIL(guid), {
    method: 'PATCH',
    body: payload,
  });
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось обновить заказ клиента');
  return res.data;
}

export async function submitClientOrder(guid: string, revision: number) {
  const res = await apiClient<{ revision: number }, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.SUBMIT(guid), {
    method: 'POST',
    body: { revision },
  });
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось отправить заказ клиента');
  return res.data;
}

export async function cancelClientOrder(guid: string, revision: number, reason?: string) {
  const res = await apiClient<{ revision: number; reason?: string }, ClientOrder>(API_ENDPOINTS.CLIENT_ORDERS.CANCEL(guid), {
    method: 'POST',
    body: { revision, reason },
  });
  if (!res.ok || !res.data) throw new Error(res.message || 'Не удалось отменить заказ клиента');
  return res.data;
}
