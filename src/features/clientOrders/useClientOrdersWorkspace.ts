import { AuthContext } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelClientOrder,
  copyClientOrder,
  createClientOrder,
  deleteClientOrder,
  getClientOrderDefaults,
  getClientOrder,
  getClientOrderInvoices,
  getClientOrderInvoiceStatuses,
  getClientOrderProductsBatch,
  getClientOrderSettings,
  getClientOrders,
  getClientOrdersTodaySummary,
  putClientOrderByClientId,
  searchClientOrderAgreements,
  searchClientOrderContracts,
  searchClientOrderCounterparties,
  searchClientOrderDeliveryAddresses,
  searchClientOrderPriceTypes,
  searchClientOrderProducts,
  searchClientOrderWarehouses,
  submitClientOrder,
  restoreClientOrder,
  unqueueClientOrder,
  updateClientOrder,
  updateClientOrderSettings,
  type ClientOrder,
  type ClientOrderInvoice,
  type ClientOrderAgreementOption,
  type ClientOrderContractOption,
  type ClientOrderCounterpartyOption,
  type ClientOrderDeliveryAddressOption,
  type ClientOrderEnumOption,
  type ClientOrderOrganization,
  type ClientOrderProduct,
  type ClientOrderPriceTypeOption,
  type ClientOrderSettings,
  type ClientOrdersTodaySummary,
  type ClientOrderWarehouseOption,
} from '@/utils/clientOrdersService';
import React from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { getServerStatus } from '@/src/shared/network/serverStatus';
import {
  isNetworkUnavailableError as isSharedNetworkUnavailableError,
  toUserErrorMessage,
} from '@/src/shared/errors/userErrorMessage';
import {
  buildNewItem,
  buildCopyPayload,
  buildPayload,
  computeDraftMetrics,
  computeDraftTotal,
  computeLineTotal,
  DEFAULT_ORDER_CURRENCY,
  emptyDraft,
  getClientOrderItems,
  getClientOrderItemsCount,
  getOrderDisplayStatusLabel,
  getOrderDisplayStatus,
  mergeDraftPackagesForProduct,
  makeKey,
  makeClientOrderId,
  makeLineGuid,
  getOrderActivityAt,
  hasManualPrice,
  getDefaultClientOrderDeliveryDate,
  normalizePackageGuid,
  normalizeDraftOrder,
  orderToDraft,
  STATUS_LABELS,
  SYNC_LABELS,
  validateDraft,
  type ClientOrdersFilters,
  type DraftItem,
  type DraftOrder,
} from './clientOrdersShared';
import {
  getClientOrderInvoiceIdentifier,
  getClientOrderInvoicePresentation,
  hasPendingClientOrderInvoice,
} from './lib/clientOrderInvoices';

type AutosaveState = 'idle' | 'saved' | 'error';
type SaveOptions = { silent?: boolean; reason?: 'manual' | 'autosave'; intent?: 'SAVE' | 'SUBMIT' };
type DiscardDecision = 'save' | 'discard' | 'cancel';
type DiscardConfirmContext = {
  draftMode: boolean;
  hasPersistedDraft: boolean;
  blockingMessage: string | null;
};
type UseClientOrdersWorkspaceOptions = {
  confirmDiscard?: (context: DiscardConfirmContext) => Promise<DiscardDecision | boolean>;
  /** Mobile screens use this to suspend work that is not visible to the user. */
  screenMode?: 'orders' | 'editor';
  isScreenActive?: boolean;
};
type DraftSelections = {
  organization: ClientOrderOrganization | null;
  counterparty: ClientOrderCounterpartyOption | null;
  agreement: ClientOrderAgreementOption | null;
  contract: ClientOrderContractOption | null;
  warehouse: ClientOrderWarehouseOption | null;
  deliveryAddress: ClientOrderDeliveryAddressOption | null;
};
type ClientOrderSavePayload = ReturnType<typeof buildPayload>;
type DeviceDraftEntry = {
  id: string;
  clientOrderId: string;
  clientRevision: number;
  intent: 'SAVE' | 'SUBMIT';
  serverGuid: string | null;
  serverRevision: number | null;
  order: ClientOrder;
  payload: ClientOrderSavePayload;
  createdAt: string;
  updatedAt: string;
  lastSyncError?: string | null;
  syncAttempts?: number;
  nextSyncAt?: string | null;
};

const FILTERS_STORAGE_PREFIX = 'client_orders_filters_v1';
const DEVICE_DRAFTS_STORAGE_PREFIX = 'client_orders_device_drafts_v1';
const ORDERS_CACHE_STORAGE_PREFIX = 'client_orders_list_cache_v1';
const TODAY_SUMMARY_CACHE_STORAGE_PREFIX = 'client_orders_today_summary_cache_v1';
const DEVICE_DRAFT_GUID_PREFIX = 'device-order-';
const DEVICE_DRAFT_SYNC_BACKOFF_MS = [0, 15_000, 60_000, 180_000, 300_000, 600_000];
const QUEUED_ORDERS_REFRESH_INTERVAL_MS = 15_000;
const PENDING_INVOICES_REFRESH_INTERVAL_MS = 5_000;
const OPEN_ORDER_INVOICES_REFRESH_INTERVAL_MS = 15_000;
const TODAY_SUMMARY_REFRESH_INTERVAL_MS = 60_000;
const ORDERS_PAGE_SIZE = 20;
const ORDERS_CACHE_LIMIT = 80;

type OrdersCacheEntry = {
  signature: string;
  orders: ClientOrder[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore?: boolean;
    statusCounts: Record<string, number>;
  };
  nextOffset: number;
  storedAt: string;
};

type TodaySummaryCacheEntry = {
  date: string;
  summary: ClientOrdersTodaySummary;
};

const OMSK_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Omsk',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getOmskDateKey(date = new Date()) {
  const parts = OMSK_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Не удалось определить текущую дату');
  return `${year}-${month}-${day}`;
}

function sanitizeTodaySummary(value: unknown, expectedDate: string): ClientOrdersTodaySummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ClientOrdersTodaySummary>;
  if (raw.date !== expectedDate || typeof raw.calculatedAt !== 'string') return null;
  if (
    typeof raw.ordersCount !== 'number' || !Number.isFinite(raw.ordersCount) ||
    typeof raw.clientsCount !== 'number' || !Number.isFinite(raw.clientsCount) ||
    typeof raw.totalAmount !== 'number' || !Number.isFinite(raw.totalAmount) ||
    typeof raw.profitAvailable !== 'boolean' ||
    typeof raw.missingReceiptPriceCount !== 'number' || !Number.isFinite(raw.missingReceiptPriceCount) ||
    (raw.profit !== null && (typeof raw.profit !== 'number' || !Number.isFinite(raw.profit)))
  ) return null;
  const profitBasisAmount = typeof raw.profitBasisAmount === 'number' && Number.isFinite(raw.profitBasisAmount)
    ? raw.profitBasisAmount
    : raw.profitAvailable ? raw.totalAmount : 0;
  const profitabilityPercent = typeof raw.profitabilityPercent === 'number' && Number.isFinite(raw.profitabilityPercent)
    ? raw.profitabilityPercent
    : raw.profitAvailable && raw.profit !== null && profitBasisAmount !== 0
      ? raw.profit / profitBasisAmount * 100
      : null;
  return {
    date: raw.date,
    ordersCount: Math.max(0, raw.ordersCount),
    clientsCount: Math.max(0, raw.clientsCount),
    totalAmount: raw.totalAmount,
    profit: raw.profit,
    profitAvailable: raw.profitAvailable,
    profitBasisAmount,
    profitabilityPercent,
    missingReceiptPriceCount: Math.max(0, raw.missingReceiptPriceCount),
    skippedReceiptPriceCount: typeof raw.skippedReceiptPriceCount === 'number' && Number.isFinite(raw.skippedReceiptPriceCount)
      ? Math.max(0, raw.skippedReceiptPriceCount)
      : Math.max(0, raw.missingReceiptPriceCount),
    currency: 'RUB',
    calculatedAt: raw.calculatedAt,
    stale: raw.stale === true,
  };
}

function sanitizeTodaySummaryCacheEntry(value: unknown, expectedDate: string): TodaySummaryCacheEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<TodaySummaryCacheEntry>;
  if (raw.date !== expectedDate) return null;
  const summary = sanitizeTodaySummary(raw.summary, expectedDate);
  return summary ? { date: expectedDate, summary } : null;
}

async function readStoredTodaySummary(storageKey: string, date: string) {
  try {
    const raw = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.localStorage.getItem(storageKey)
      : await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    return sanitizeTodaySummaryCacheEntry(JSON.parse(raw), date);
  } catch {
    return null;
  }
}

async function writeStoredTodaySummary(storageKey: string, entry: TodaySummaryCacheEntry) {
  const payload = JSON.stringify(entry);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey, payload);
    return;
  }
  await AsyncStorage.setItem(storageKey, payload);
}

function emptyFilters(): ClientOrdersFilters {
  return {
    search: '',
    statuses: [],
    counterpartyGuid: '',
    amountMin: '',
    amountMax: '',
    deliveryDateFrom: '',
    deliveryDateTo: '',
    updatedFrom: '',
    updatedTo: '',
    itemsMin: '',
    itemsMax: '',
    syncState: '',
    organizationGuid: '',
    warehouseGuid: '',
    priceTypeGuid: '',
    hasNumber1c: '',
    onlyProblems: false,
  };
}

function sanitizeStoredFilters(value: unknown): ClientOrdersFilters | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ClientOrdersFilters>;
  const legacyStatus = typeof (raw as { status?: unknown }).status === 'string' ? String((raw as { status?: string }).status).trim() : '';
  const rawStatuses = Array.isArray(raw.statuses)
    ? raw.statuses
    : legacyStatus
      ? [legacyStatus]
      : [];
  return {
    ...emptyFilters(),
    search: typeof raw.search === 'string' ? raw.search : '',
    statuses: Array.from(new Set(rawStatuses.map((item) => String(item || '').trim()).filter(Boolean))),
    counterpartyGuid: typeof raw.counterpartyGuid === 'string' ? raw.counterpartyGuid : '',
    amountMin: typeof raw.amountMin === 'string' ? raw.amountMin : '',
    amountMax: typeof raw.amountMax === 'string' ? raw.amountMax : '',
    deliveryDateFrom: typeof raw.deliveryDateFrom === 'string' ? raw.deliveryDateFrom : '',
    deliveryDateTo: typeof raw.deliveryDateTo === 'string' ? raw.deliveryDateTo : '',
    updatedFrom: typeof raw.updatedFrom === 'string' ? raw.updatedFrom : '',
    updatedTo: typeof raw.updatedTo === 'string' ? raw.updatedTo : '',
    itemsMin: typeof raw.itemsMin === 'string' ? raw.itemsMin : '',
    itemsMax: typeof raw.itemsMax === 'string' ? raw.itemsMax : '',
    syncState: typeof raw.syncState === 'string' ? raw.syncState : '',
    organizationGuid: typeof raw.organizationGuid === 'string' ? raw.organizationGuid : '',
    warehouseGuid: typeof raw.warehouseGuid === 'string' ? raw.warehouseGuid : '',
    priceTypeGuid: typeof raw.priceTypeGuid === 'string' ? raw.priceTypeGuid : '',
    hasNumber1c: typeof raw.hasNumber1c === 'string' ? raw.hasNumber1c : '',
    onlyProblems: raw.onlyProblems === true,
  };
}

async function readStoredFilters(storageKey: string) {
  try {
    const raw = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.localStorage.getItem(storageKey)
      : await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    return sanitizeStoredFilters(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeStoredFilters(storageKey: string, filters: ClientOrdersFilters) {
  const payload = JSON.stringify(filters);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey, payload);
    return;
  }
  await AsyncStorage.setItem(storageKey, payload);
}

async function removeStoredFilters(storageKey: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.removeItem(storageKey);
    return;
  }
  await AsyncStorage.removeItem(storageKey);
}

function ordersFilterSignature(filters: ClientOrdersFilters) {
  return JSON.stringify({
    search: filters.search.trim(),
    statuses: [...filters.statuses].sort(),
    counterpartyGuid: filters.counterpartyGuid,
    amountMin: filters.amountMin.trim(),
    amountMax: filters.amountMax.trim(),
    deliveryDateFrom: filters.deliveryDateFrom.trim(),
    deliveryDateTo: filters.deliveryDateTo.trim(),
    updatedFrom: filters.updatedFrom.trim(),
    updatedTo: filters.updatedTo.trim(),
    itemsMin: filters.itemsMin.trim(),
    itemsMax: filters.itemsMax.trim(),
    syncState: filters.syncState,
    organizationGuid: filters.organizationGuid,
    warehouseGuid: filters.warehouseGuid,
    priceTypeGuid: filters.priceTypeGuid,
    hasNumber1c: filters.hasNumber1c,
    onlyProblems: filters.onlyProblems === true,
  });
}

function sanitizeCachedOrders(value: unknown): ClientOrder[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof (item as ClientOrder).guid !== 'string') return [];
    const order = item as ClientOrder;
    return [{
      ...order,
      items: Array.isArray(order.items) ? order.items : [],
      events: Array.isArray(order.events) ? order.events : [],
    }];
  });
}

function sanitizeOrdersCacheEntry(value: unknown, signature: string): OrdersCacheEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<OrdersCacheEntry>;
  if (raw.signature !== signature) return null;
  const orders = sanitizeCachedOrders(raw.orders);
  if (!orders.length) return null;
  const meta = raw.meta && typeof raw.meta === 'object'
    ? raw.meta
    : { total: orders.length, limit: ORDERS_PAGE_SIZE, offset: 0, statusCounts: {} };
  return {
    signature,
    orders,
    meta: {
      total: typeof meta.total === 'number' ? meta.total : orders.length,
      limit: typeof meta.limit === 'number' ? meta.limit : ORDERS_PAGE_SIZE,
      offset: typeof meta.offset === 'number' ? meta.offset : 0,
      hasMore: typeof meta.hasMore === 'boolean' ? meta.hasMore : undefined,
      statusCounts: meta.statusCounts && typeof meta.statusCounts === 'object' ? meta.statusCounts : {},
    },
    nextOffset: typeof raw.nextOffset === 'number' ? Math.max(0, raw.nextOffset) : orders.length,
    storedAt: typeof raw.storedAt === 'string' ? raw.storedAt : new Date(0).toISOString(),
  };
}

async function readStoredOrdersCache(storageKey: string, signature: string) {
  try {
    const raw = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.localStorage.getItem(storageKey)
      : await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    return sanitizeOrdersCacheEntry(JSON.parse(raw), signature);
  } catch {
    return null;
  }
}

async function writeStoredOrdersCache(storageKey: string, entry: OrdersCacheEntry) {
  const payload = JSON.stringify(entry);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey, payload);
    return;
  }
  await AsyncStorage.setItem(storageKey, payload);
}

function sanitizeDeviceDraftEntries(value: unknown): DeviceDraftEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Partial<DeviceDraftEntry>;
    if (!raw.id || typeof raw.id !== 'string') return [];
    if (!raw.order || typeof raw.order !== 'object') return [];
    if (!raw.payload || typeof raw.payload !== 'object') return [];
    return [{
      id: raw.id,
      clientOrderId:
        typeof raw.clientOrderId === 'string' && raw.clientOrderId
          ? raw.clientOrderId
          : typeof (raw.order as ClientOrder).clientOrderId === 'string' && (raw.order as ClientOrder).clientOrderId
            ? (raw.order as ClientOrder).clientOrderId!
            : `legacy:${raw.id}`,
      clientRevision:
        typeof raw.clientRevision === 'number' && Number.isFinite(raw.clientRevision)
          ? Math.max(1, raw.clientRevision)
          : Math.max(1, Number((raw.order as ClientOrder).clientRevision || 1)),
      intent: raw.intent === 'SUBMIT' ? 'SUBMIT' : 'SAVE',
      serverGuid: typeof raw.serverGuid === 'string' && raw.serverGuid ? raw.serverGuid : null,
      serverRevision: typeof raw.serverRevision === 'number' ? raw.serverRevision : null,
      order: {
        ...(raw.order as ClientOrder),
        items: Array.isArray((raw.order as ClientOrder).items) ? (raw.order as ClientOrder).items : [],
        events: Array.isArray((raw.order as ClientOrder).events) ? (raw.order as ClientOrder).events : [],
      },
      payload: raw.payload as ClientOrderSavePayload,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      lastSyncError: typeof raw.lastSyncError === 'string' ? raw.lastSyncError : null,
      syncAttempts: typeof raw.syncAttempts === 'number' && Number.isFinite(raw.syncAttempts) ? Math.max(0, raw.syncAttempts) : 0,
      nextSyncAt: typeof raw.nextSyncAt === 'string' && raw.nextSyncAt ? raw.nextSyncAt : null,
    }];
  });
}

async function readStoredDeviceDrafts(storageKey: string) {
  try {
    const raw = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.localStorage.getItem(storageKey)
      : await AsyncStorage.getItem(storageKey);
    if (!raw) return [];
    return sanitizeDeviceDraftEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeStoredDeviceDrafts(storageKey: string, entries: DeviceDraftEntry[]) {
  const payload = JSON.stringify(entries);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey, payload);
    return;
  }
  await AsyncStorage.setItem(storageKey, payload);
}

function userErrorMessage(error: unknown, fallback: string) {
  if (isSharedNetworkUnavailableError(error)) return toUserErrorMessage(error, fallback);
  const message = error instanceof Error ? error.message.trim() : '';
  const lower = message.toLocaleLowerCase('ru');
  const looksTechnical =
    !message ||
    message.startsWith('{') ||
    message.startsWith('[') ||
    message.startsWith('<!DOCTYPE') ||
    message.includes('errorId=') ||
    message.includes('HTTP ') ||
    message.includes('"path"') ||
    message.includes('"code"') ||
    message.includes('ZodError') ||
    message.includes('INTERNAL_ERROR') ||
    message.includes('Непредвиденная ошибка') ||
    message.includes('Поле объекта не обнаружено') ||
    message.includes('Метод объекта не обнаружен') ||
    message.includes('expected number') ||
    message.includes('\n    at ') ||
    lower.includes('timeout') ||
    lower.includes('failed to fetch');
  return looksTechnical ? fallback : message.slice(0, 240);
}

function isRevisionConflictError(error: unknown) {
  const record = error as { status?: number; message?: string } | null;
  const message = error instanceof Error ? error.message : record?.message || '';
  return (
    record?.status === 409 ||
    message.toLocaleLowerCase('ru').includes('версия заказа устарела')
  );
}

function emptySelections(): DraftSelections {
  return {
    organization: null,
    counterparty: null,
    agreement: null,
    contract: null,
    warehouse: null,
    deliveryAddress: null,
  };
}

function buildDraftBase(settings: ClientOrderSettings | null) {
  return {
    organizationGuid: settings?.preferredOrganization?.guid || '',
    deliveryDate: getDefaultClientOrderDeliveryDate(),
    currency: DEFAULT_ORDER_CURRENCY,
    priceTypeGuid: null,
    priceTypeName: null,
    paymentForm: null,
    deliveryMethod: null,
  };
}

function buildPricingContextSignature(draft: DraftOrder) {
  if (!draft.organizationGuid || !draft.counterpartyGuid || !draft.items.length) return '';
  return [
    draft.organizationGuid,
    draft.counterpartyGuid,
    draft.agreementGuid || '',
    draft.warehouseGuid || '',
    draft.priceTypeGuid || '',
  ].join('||');
}

function includesSearchToken(value: string | null | undefined, search: string) {
  return (value || '').toLowerCase().includes(search);
}

function normalizeFilterSearch(search: string) {
  return search.trim().toLowerCase();
}

function normalizeSearchTokens(search: string) {
  return normalizeFilterSearch(search)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseFilterAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseFilterInteger(value: string) {
  const normalized = value.trim().replace(/\s/g, '');
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.trunc(amount) : null;
}

function parseFilterDate(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const dotted = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const next = dotted ? `${dotted[3]}-${dotted[2]}-${dotted[1]}` : iso ? normalized : '';
  if (!next) return null;
  const date = new Date(`${next}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function parseOrderDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function orderHasPriceType(order: ClientOrder, priceTypeGuid: string) {
  if (!priceTypeGuid) return true;
  if (order.priceType?.guid === priceTypeGuid) return true;
  return getClientOrderItems(order).some((item) => item.priceType?.guid === priceTypeGuid);
}

function orderHasProblem(order: ClientOrder) {
  return !!(
    (order.shipmentProhibited && !order.isPostedIn1c) ||
    order.lastExportError ||
    order.last1cError ||
    order.cancelRequestedAt ||
    ['ERROR', 'FAILED', 'CONFLICT', 'CANCEL_REQUESTED'].includes(order.syncState)
  );
}

function orderIsApplicationOnlyDraft(order: ClientOrder) {
  return !order.number1c;
}

function orderWorkspaceRank(order: ClientOrder) {
  return orderIsApplicationOnlyDraft(order) ? 0 : 1;
}

function orderDocumentDate(order: ClientOrder) {
  if (orderIsApplicationOnlyDraft(order)) {
    return parseOrderDate(getOrderActivityAt(order)) ?? parseOrderDate(order.createdAt) ?? 0;
  }
  return parseOrderDate(order.date1c)
    ?? parseOrderDate(order.createdAt)
    ?? parseOrderDate(getOrderActivityAt(order))
    ?? 0;
}

function orderMatchesFilters(order: ClientOrder, filters: ClientOrdersFilters) {
  const statuses = Array.isArray(filters.statuses) ? filters.statuses.filter(Boolean) : [];
  if (statuses.length && !statuses.includes(getOrderDisplayStatus(order))) return false;
  if (filters.counterpartyGuid && order.counterparty?.guid !== filters.counterpartyGuid) return false;
  if (filters.syncState && order.syncState !== filters.syncState) return false;
  if (filters.organizationGuid && order.organization?.guid !== filters.organizationGuid) return false;
  if (filters.warehouseGuid && order.warehouse?.guid !== filters.warehouseGuid) return false;
  if (filters.priceTypeGuid && !orderHasPriceType(order, filters.priceTypeGuid)) return false;
  if (filters.hasNumber1c === 'yes' && !order.number1c) return false;
  if (filters.hasNumber1c === 'no' && order.number1c) return false;
  if (filters.onlyProblems && !orderHasProblem(order)) return false;
  const amount = Number(order.totalAmount || 0);
  const amountMin = parseFilterAmount(filters.amountMin);
  const amountMax = parseFilterAmount(filters.amountMax);
  if (amountMin !== null && amount < amountMin) return false;
  if (amountMax !== null && amount > amountMax) return false;
  const itemsCount = getClientOrderItemsCount(order);
  const itemsMin = parseFilterInteger(filters.itemsMin);
  const itemsMax = parseFilterInteger(filters.itemsMax);
  if (itemsMin !== null && itemsCount < itemsMin) return false;
  if (itemsMax !== null && itemsCount > itemsMax) return false;
  const deliveryDate = parseOrderDate(order.deliveryDate);
  const deliveryFrom = parseFilterDate(filters.deliveryDateFrom);
  const deliveryTo = parseFilterDate(filters.deliveryDateTo);
  if (deliveryFrom !== null && (deliveryDate === null || deliveryDate < deliveryFrom)) return false;
  if (deliveryTo !== null && (deliveryDate === null || deliveryDate > deliveryTo + 86399999)) return false;
  const updatedDate = parseOrderDate(order.updatedAt || order.sourceUpdatedAt || order.createdAt);
  const updatedFrom = parseFilterDate(filters.updatedFrom);
  const updatedTo = parseFilterDate(filters.updatedTo);
  if (updatedFrom !== null && (updatedDate === null || updatedDate < updatedFrom)) return false;
  if (updatedTo !== null && (updatedDate === null || updatedDate > updatedTo + 86399999)) return false;

  const searchTokens = normalizeSearchTokens(filters.search);
  if (!searchTokens.length) return true;

  const searchableValues = [
    order.guid,
    order.number1c,
    order.comment,
    order.organization?.name,
    order.counterparty?.name,
    order.status,
    getOrderDisplayStatusLabel(order),
    order.status1c,
    order.currentState1c,
    order.documentStatus1c,
  ];
  return searchTokens.every((token) => searchableValues.some((value) => includesSearchToken(value, token)));
}

function sortClientOrdersForWorkspace(items: ClientOrder[]) {
  return [...items].sort((a, b) => {
    const rankDiff = orderWorkspaceRank(a) - orderWorkspaceRank(b);
    if (rankDiff !== 0) return rankDiff;
    const documentDateDiff = orderDocumentDate(b) - orderDocumentDate(a);
    if (documentDateDiff !== 0) return documentDateDiff;
    const createdDiff = (parseOrderDate(b.createdAt) ?? 0) - (parseOrderDate(a.createdAt) ?? 0);
    if (createdDiff !== 0) return createdDiff;
    return String(b.guid).localeCompare(String(a.guid));
  });
}

function makeDeviceDraftGuid() {
  return `${DEVICE_DRAFT_GUID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDeviceDraftGuid(guid?: string | null) {
  return !!guid && guid.startsWith(DEVICE_DRAFT_GUID_PREFIX);
}

function isNetworkUnavailableError(error: unknown) {
  if (isSharedNetworkUnavailableError(error)) return true;
  const record = error as { status?: number; errorCode?: string; message?: string } | null;
  const message = String(record?.message || '').toLowerCase();
  return (
    record?.status === 0 ||
    record?.errorCode === 'NETWORK_UNAVAILABLE' ||
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('request timeout') ||
    message.includes('ошибка сети') ||
    message.includes('нет соединения') ||
    message.includes('не удалось подключиться')
  );
}

function isTransientDeviceDraftSyncError(error: unknown) {
  const record = error as { status?: number } | null;
  return isNetworkUnavailableError(error) || record?.status === 502 || record?.status === 503 || record?.status === 504;
}

function getDeviceDraftBackoffMs(attempts: number) {
  const index = Math.min(Math.max(attempts, 0), DEVICE_DRAFT_SYNC_BACKOFF_MS.length - 1);
  return DEVICE_DRAFT_SYNC_BACKOFF_MS[index];
}

function isDeviceDraftSyncDue(entry: DeviceDraftEntry, nowMs = Date.now()) {
  if (!entry.nextSyncAt) return true;
  const nextTime = Date.parse(entry.nextSyncAt);
  return Number.isNaN(nextTime) || nextTime <= nowMs;
}

function isQueuedClientOrder(order?: Pick<ClientOrder, 'status' | 'syncState'> | null) {
  return order?.syncState === 'QUEUED' || order?.syncState === 'CANCEL_REQUESTED';
}

function orderListContentSignature(order: ClientOrder) {
  return JSON.stringify([
    order.guid,
    order.appGuid,
    order.documentGuid,
    order.revision,
    order.updatedAt,
    order.sourceUpdatedAt,
    order.status,
    order.syncState,
    order.queuePosition,
    order.number1c,
    order.date1c,
    order.deliveryDate,
    order.totalAmount,
    order.currency,
    order.itemsCount,
    order.counterparty?.guid,
    order.counterparty?.name,
    order.counterparty?.shipmentProhibited,
    order.shipmentProhibited,
    order.debtReason,
    order.origin,
    order.status1c,
    order.currentState1c,
    order.documentStatus1c,
    order.lastExportError,
    order.last1cError,
    order.readOnly,
    order.hasRealization,
    order.invoiceRequested,
    order.invoiceState,
    order.invoiceWaitReason,
    order.latestInvoiceVersion,
    order.invoiceCount,
    order.invoiceDownloadAvailable,
    order.invoiceRequestPending,
    order.invoices?.map((invoice) => [
      invoice.id,
      invoice.realizationGuid,
      invoice.realizationNumber,
      invoice.realizationDate,
      invoice.version,
      invoice.state,
      invoice.waitReason,
      invoice.downloadAvailable,
      invoice.fileName,
      invoice.sentAt,
      invoice.updatedAt,
    ]),
  ]);
}

function ordersCacheContentSignature(orders: ClientOrder[]) {
  return JSON.stringify(orders.map(orderListContentSignature));
}

function mergeOrderListMetadata(current: ClientOrder, summary: ClientOrder): ClientOrder {
  const serverFinishedInvoice = !!summary.invoiceDownloadAvailable
    || ['AVAILABLE', 'SENT', 'PARTIAL', 'ERROR'].includes(summary.invoiceState || '');
  return {
    ...current,
    revision: Math.max(current.revision || 0, summary.revision || 0),
    appGuid: summary.appGuid ?? current.appGuid,
    documentGuid: summary.documentGuid ?? current.documentGuid,
    number1c: summary.number1c ?? current.number1c,
    date1c: summary.date1c ?? current.date1c,
    status: summary.status ?? current.status,
    syncState: summary.syncState ?? current.syncState,
    status1c: summary.status1c ?? current.status1c,
    currentState1c: summary.currentState1c ?? current.currentState1c,
    documentStatus1c: summary.documentStatus1c ?? current.documentStatus1c,
    queuePosition: summary.queuePosition ?? current.queuePosition,
    queuedAt: summary.queuedAt ?? current.queuedAt,
    sentTo1cAt: summary.sentTo1cAt ?? current.sentTo1cAt,
    cancelRequestedAt: summary.cancelRequestedAt ?? current.cancelRequestedAt,
    sourceUpdatedAt: summary.sourceUpdatedAt ?? current.sourceUpdatedAt,
    updatedAt: summary.updatedAt ?? current.updatedAt,
    totalAmount: summary.totalAmount ?? current.totalAmount,
    paymentForm: summary.paymentForm ?? current.paymentForm,
    deliveryMethod: summary.deliveryMethod ?? current.deliveryMethod,
    itemsCount: summary.itemsCount ?? current.itemsCount,
    lastExportError: summary.lastExportError ?? current.lastExportError,
    last1cError: summary.last1cError ?? current.last1cError,
    hasDebt: summary.hasDebt ?? current.hasDebt,
    shipmentProhibited: summary.shipmentProhibited ?? current.shipmentProhibited,
    debtReason: summary.debtReason !== undefined ? summary.debtReason : current.debtReason,
    counterparty: summary.counterparty ?? current.counterparty,
    isPostedIn1c: summary.isPostedIn1c ?? current.isPostedIn1c,
    hasRealization: summary.hasRealization ?? current.hasRealization,
    realizationDetectedAt: summary.realizationDetectedAt ?? current.realizationDetectedAt,
    invoiceRequested: summary.invoiceRequested ?? current.invoiceRequested,
    invoiceState: summary.invoiceState ?? current.invoiceState,
    invoiceWaitReason: summary.invoiceWaitReason !== undefined ? summary.invoiceWaitReason : current.invoiceWaitReason,
    latestInvoiceVersion: summary.latestInvoiceVersion !== undefined ? summary.latestInvoiceVersion : current.latestInvoiceVersion,
    invoiceCount: summary.invoiceCount ?? current.invoiceCount,
    invoiceDownloadAvailable: summary.invoiceDownloadAvailable ?? current.invoiceDownloadAvailable,
    invoiceRequestPending: serverFinishedInvoice
      ? false
      : (summary.invoiceRequestPending ?? !!current.invoiceRequestPending),
    invoices: Array.isArray(summary.invoices) && summary.invoices.length ? summary.invoices : current.invoices,
    readOnly: summary.readOnly ?? current.readOnly,
    readOnlyReason: summary.readOnlyReason ?? current.readOnlyReason,
  };
}

function preserveTransientInvoiceListState(current: ClientOrder, summary: ClientOrder): ClientOrder {
  const serverFinishedInvoice = !!summary.invoiceDownloadAvailable
    || ['AVAILABLE', 'SENT', 'PARTIAL', 'ERROR'].includes(summary.invoiceState || '');
  if (serverFinishedInvoice) return { ...summary, invoiceRequestPending: false };
  if (!current.invoiceRequestPending) return summary;
  return {
    ...summary,
    invoiceState: 'WAITING',
    invoiceWaitReason: current.invoiceWaitReason || 'Счёт формируется',
    invoiceRequestPending: true,
    invoices: current.invoices,
  };
}

function mergeOrderInvoices(current: ClientOrder, invoices: NonNullable<ClientOrder['invoices']>): ClientOrder {
  const active = invoices.filter((invoice) => !['SUPERSEDED', 'CANCELLED'].includes(invoice.state));
  const latestVersion = active.reduce((max, invoice) => Math.max(max, Number(invoice.version || 0)), 0) || null;
  const hasDownload = active.some((invoice) => !!invoice.downloadAvailable);
  const hasTerminalState = active.some((invoice) => ['AVAILABLE', 'SENT', 'PARTIAL', 'ERROR'].includes(invoice.state));
  const next: ClientOrder = {
    ...current,
    invoices: active,
    latestInvoiceVersion: latestVersion,
    invoiceCount: active.length,
    invoiceDownloadAvailable: hasDownload,
    invoiceRequestPending: !!current.invoiceRequestPending && !hasDownload && !hasTerminalState,
  };
  const presentation = getClientOrderInvoicePresentation(next);
  return {
    ...next,
    invoiceState: presentation.state,
    invoiceWaitReason: presentation.reason,
  };
}

function clientOrderInvoiceSignature(order: ClientOrder) {
  return JSON.stringify({
    state: order.invoiceState,
    reason: order.invoiceWaitReason,
    version: order.latestInvoiceVersion,
    count: order.invoiceCount,
    download: order.invoiceDownloadAvailable,
    pending: order.invoiceRequestPending,
    invoices: (order.invoices ?? []).map((invoice) => [
      invoice.id,
      invoice.state,
      invoice.version,
      invoice.downloadAvailable,
      invoice.waitReason,
      invoice.updatedAt,
    ]),
  });
}

function orderMatchesInvoiceIdentifier(order: ClientOrder, identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return [order.guid, order.appGuid, order.documentGuid]
    .some((value) => value?.trim().toLowerCase() === normalized);
}

function withDeviceDraftSyncFailure(entry: DeviceDraftEntry, message: string): DeviceDraftEntry {
  const attempts = Math.min((entry.syncAttempts ?? 0) + 1, DEVICE_DRAFT_SYNC_BACKOFF_MS.length - 1);
  const now = Date.now();
  const nextSyncAt = new Date(now + getDeviceDraftBackoffMs(attempts)).toISOString();
  const updatedAt = new Date(now).toISOString();
  return {
    ...entry,
    syncAttempts: attempts,
    nextSyncAt,
    lastSyncError: message,
    updatedAt,
    order: { ...entry.order, lastExportError: message, updatedAt },
  };
}

function selectedDraftPackage(item: DraftItem) {
  return item.packageGuid ? item.packages.find((pack) => pack.guid === item.packageGuid) ?? null : null;
}

function parseDraftNumber(value: string) {
  const parsed = Number(String(value || '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildDeviceOrderFromDraft(args: {
  draft: DraftOrder;
  selections: DraftSelections;
  guid: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  lastSyncError?: string | null;
}): ClientOrder {
  const { draft, selections, guid, revision, createdAt, updatedAt, lastSyncError } = args;
  const totalAmount = computeDraftTotal(draft);
  const items = draft.items.map((item) => {
    const pack = selectedDraftPackage(item);
    const quantity = parseDraftNumber(item.quantity);
    const multiplier = Number(pack?.multiplier ?? 1);
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    const manualPrice = hasManualPrice(item) ? parseDraftNumber(item.manualPrice) : null;
    const priceType = item.priceTypeGuid
      ? { guid: item.priceTypeGuid, name: item.priceTypeName || draft.priceTypeName || 'Вид цены' }
      : draft.priceTypeGuid
        ? { guid: draft.priceTypeGuid, name: draft.priceTypeName || 'Вид цены' }
        : null;
    return {
      product: {
        guid: item.productGuid,
        name: item.productName,
        code: item.productCode ?? null,
        article: item.productArticle ?? null,
        sku: item.productSku ?? null,
        isWeight: item.productIsWeight ?? null,
        weight: item.productWeight ?? null,
        weightUnit: item.weightUnit ?? null,
      },
      package: pack
        ? {
            guid: pack.guid,
            name: pack.name,
            multiplier: pack.multiplier ?? null,
            weight: pack.weight ?? null,
            weightUnit: pack.weightUnit ?? null,
          }
        : null,
      unit: pack?.unit ?? item.baseUnit ?? null,
      quantity,
      quantityBase: quantity * safeMultiplier,
      basePrice: item.basePrice ?? null,
      price: manualPrice ?? item.basePrice ?? null,
      isManualPrice: manualPrice !== null,
      manualPrice,
      priceSource: item.priceSource ?? null,
      isCancelled: item.isCancelled ?? false,
      cancelReasonGuid: item.cancelReasonGuid ?? null,
      cancelReasonName: item.cancelReasonName ?? null,
      cancelReason: item.cancelReason ?? null,
      cancelledAmount: item.cancelledAmount ?? null,
      priceType,
      discountPercent: item.discountPercent.trim() ? parseDraftNumber(item.discountPercent) : null,
      appliedDiscountPercent: item.discountPercent.trim()
        ? parseDraftNumber(item.discountPercent)
        : draft.generalDiscountPercent.trim()
          ? parseDraftNumber(draft.generalDiscountPercent)
          : null,
      lineAmount: computeLineTotal(item, draft.generalDiscountPercent),
      comment: item.comment || null,
      stock: item.stock ?? null,
    };
  });

  return {
    guid,
    clientOrderId: draft.clientOrderId ?? null,
    clientRevision: draft.clientRevision,
    appGuid: guid,
    documentGuid: guid,
    number1c: null,
    date1c: null,
    source: 'DEVICE_LOCAL',
    origin: 'device',
    readOnly: false,
    revision,
    syncState: 'DRAFT',
    status: 'DRAFT',
    comment: draft.comment || null,
    deliveryDate: draft.deliveryDate ?? null,
    paymentForm: draft.paymentForm ?? null,
    deliveryMethod: draft.deliveryMethod ?? null,
    totalAmount,
    currency: draft.currency || DEFAULT_ORDER_CURRENCY,
    priceType: draft.priceTypeGuid ? { guid: draft.priceTypeGuid, name: draft.priceTypeName || 'Вид цены' } : null,
    generalDiscountPercent: draft.generalDiscountPercent.trim() ? parseDraftNumber(draft.generalDiscountPercent) : null,
    generalDiscountAmount: null,
    invoiceRequested: !!draft.invoiceRequested,
    invoiceState: draft.invoiceRequested ? 'WAITING' : 'NOT_REQUESTED',
    invoiceWaitReason: draft.invoiceRequested ? 'Заказ ещё не закрыт' : null,
    latestInvoiceVersion: null,
    invoiceCount: 0,
    invoiceDownloadAvailable: false,
    invoices: [],
    queuedAt: null,
    sentTo1cAt: null,
    lastStatusSyncAt: null,
    exportAttempts: 0,
    lastExportError: lastSyncError || null,
    isPostedIn1c: false,
    postedAt1c: null,
    cancelRequestedAt: null,
    cancelReason: null,
    last1cError: null,
    hasDebt: !!selections.counterparty?.hasDebt,
    shipmentProhibited: !!selections.counterparty?.shipmentProhibited,
    debtReason: selections.counterparty?.debtReason || null,
    counterparty: selections.counterparty
      ? { ...selections.counterparty }
      : draft.counterpartyGuid
        ? { guid: draft.counterpartyGuid, name: draft.counterpartyGuid }
        : null,
    agreement: selections.agreement,
    contract: selections.contract ? { guid: selections.contract.guid, number: selections.contract.number } : null,
    warehouse: selections.warehouse ? { guid: selections.warehouse.guid, name: selections.warehouse.name, code: selections.warehouse.code ?? null } : null,
    deliveryAddress: selections.deliveryAddress
      ? {
          guid: selections.deliveryAddress.guid ?? null,
          fullAddress: selections.deliveryAddress.fullAddress ?? selections.deliveryAddress.address ?? selections.deliveryAddress.name ?? null,
          name: selections.deliveryAddress.name ?? null,
        }
      : null,
    organization: selections.organization
      ? {
          guid: selections.organization.guid,
          name: selections.organization.name,
          code: selections.organization.code ?? null,
          isActive: selections.organization.isActive ?? true,
        }
      : draft.organizationGuid
        ? { guid: draft.organizationGuid, name: draft.organizationGuid, code: null, isActive: true }
        : null,
    itemsCount: items.filter((item) => !item.isCancelled).length,
    items,
    events: [],
    createdAt,
    updatedAt,
    sourceUpdatedAt: updatedAt,
  };
}

export function useClientOrdersWorkspace(options: UseClientOrdersWorkspaceOptions = {}) {
  const confirmDiscard = options.confirmDiscard;
  const ordersPollingEnabled = options.isScreenActive !== false
    && (!options.screenMode || options.screenMode === 'orders');
  const invoicePollingEnabled = options.isScreenActive !== false
    && (!options.screenMode || options.screenMode === 'editor');
  const auth = React.useContext(AuthContext);
  const serverStatus = useServerStatus();
  const filtersStorageKey = React.useMemo(
    () => `${FILTERS_STORAGE_PREFIX}:${auth?.profile?.id ?? 'anonymous'}`,
    [auth?.profile?.id]
  );
  const ordersCacheStorageKey = React.useMemo(
    () => `${ORDERS_CACHE_STORAGE_PREFIX}:${auth?.profile?.id ?? 'anonymous'}`,
    [auth?.profile?.id]
  );
  const deviceDraftsStorageKey = React.useMemo(
    () => `${DEVICE_DRAFTS_STORAGE_PREFIX}:${auth?.profile?.id ?? 'anonymous'}`,
    [auth?.profile?.id]
  );
  const [todayDateKey, setTodayDateKey] = React.useState(() => getOmskDateKey());
  const todaySummaryStorageKey = React.useMemo(
    () => auth?.profile?.id == null
      ? null
      : `${TODAY_SUMMARY_CACHE_STORAGE_PREFIX}:${auth.profile.id}:${todayDateKey}`,
    [auth?.profile?.id, todayDateKey]
  );
  const [orders, setOrders] = React.useState<ClientOrder[]>([]);
  const [deviceDraftEntries, setDeviceDraftEntries] = React.useState<DeviceDraftEntry[]>([]);
  const [deviceDraftsHydrated, setDeviceDraftsHydrated] = React.useState(false);
  const [ordersMeta, setOrdersMeta] = React.useState<{
    total: number;
    limit: number;
    offset: number;
    hasMore?: boolean;
    statusCounts: Record<string, number>;
  }>({ total: 0, limit: ORDERS_PAGE_SIZE, offset: 0, statusCounts: {} });
  const [filters, setFilters] = React.useState<ClientOrdersFilters>(emptyFilters());
  const [filtersHydrated, setFiltersHydrated] = React.useState(false);
  const [ordersCacheHydrated, setOrdersCacheHydrated] = React.useState(false);
  const [ordersInitialLoadDone, setOrdersInitialLoadDone] = React.useState(false);
  const [todaySummary, setTodaySummary] = React.useState<ClientOrdersTodaySummary | null>(null);
  const [todaySummaryHydrated, setTodaySummaryHydrated] = React.useState(false);
  const [loadingTodaySummary, setLoadingTodaySummary] = React.useState(true);
  const [calculatingTodayProfit, setCalculatingTodayProfit] = React.useState(false);
  const [todaySummaryError, setTodaySummaryError] = React.useState<string | null>(null);
  const [selectedGuid, setSelectedGuid] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<ClientOrder | null>(null);
  const [draft, setDraft] = React.useState<DraftOrder>(() => emptyDraft());
  const [selections, setSelections] = React.useState<DraftSelections>(emptySelections());
  const [paymentFormOptions, setPaymentFormOptions] = React.useState<ClientOrderEnumOption[]>([]);
  const [deliveryMethodOptions, setDeliveryMethodOptions] = React.useState<ClientOrderEnumOption[]>([]);
  const [settings, setSettings] = React.useState<ClientOrderSettings | null>(null);
  const [loadingOrders, setLoadingOrders] = React.useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [loadingReceiptPrices, setLoadingReceiptPrices] = React.useState(false);
  const [loadingDefaults, setLoadingDefaults] = React.useState(false);
  const [loadingSettings, setLoadingSettings] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [deletingDraft, setDeletingDraft] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ordersError, setOrdersError] = React.useState<string | null>(null);
  const [ordersAppendError, setOrdersAppendError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [documentStarted, setDocumentStarted] = React.useState(false);
  const [autosaveState, setAutosaveState] = React.useState<AutosaveState>('idle');
  const [autosaveError, setAutosaveError] = React.useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const settingsRef = React.useRef<ClientOrderSettings | null>(null);
  const apiOrdersRef = React.useRef<ClientOrder[]>([]);
  const ordersRef = React.useRef<ClientOrder[]>([]);
  const deviceDraftEntriesRef = React.useRef<DeviceDraftEntry[]>([]);
  const documentStartedRef = React.useRef(false);
  const dirtyRef = React.useRef(false);
  const selectedGuidRef = React.useRef<string | null>(null);
  const contextRefreshSignatureRef = React.useRef('');
  const ordersRequestIdRef = React.useRef(0);
  const silentOrdersRequestIdRef = React.useRef(0);
  const detailRequestIdRef = React.useRef(0);
  const defaultsRequestIdRef = React.useRef(0);
  const enumOptionsRequestIdRef = React.useRef(0);
  const deliveryAddressManualVersionRef = React.useRef(0);
  const pricingRequestIdRef = React.useRef(0);
  const receiptPriceLoadingRequestIdRef = React.useRef(0);
  const ordersAppendLoadingRef = React.useRef(false);
  const ordersNextOffsetRef = React.useRef(0);
  const ordersInitialLoadDoneRef = React.useRef(false);
  const deviceDraftSyncingRef = React.useRef(false);
  const invoicePollingRef = React.useRef(false);
  const queueRefreshInFlightRef = React.useRef(false);
  const invoiceStatusesInFlightRef = React.useRef(false);
  const todaySummaryRequestIdRef = React.useRef(0);
  const todaySummaryInFlightRef = React.useRef<Promise<ClientOrdersTodaySummary | null> | null>(null);
  const todaySummaryRef = React.useRef<ClientOrdersTodaySummary | null>(null);
  const previousServerReachableRef = React.useRef(serverStatus.isReachable);

  React.useEffect(() => {
    todaySummaryRef.current = todaySummary;
  }, [todaySummary]);

  const markOrdersInitialLoadDone = React.useCallback(() => {
    if (ordersInitialLoadDoneRef.current) return;
    ordersInitialLoadDoneRef.current = true;
    setOrdersInitialLoadDone(true);
  }, []);

  const refreshTodaySummary = React.useCallback((options: { force?: boolean } = {}): Promise<ClientOrdersTodaySummary | null> => {
    if (todaySummaryInFlightRef.current) return todaySummaryInFlightRef.current;
    const requestId = ++todaySummaryRequestIdRef.current;
    if (!todaySummaryRef.current) setLoadingTodaySummary(true);
    if (options.force) setCalculatingTodayProfit(true);
    setTodaySummaryError(null);

    const task = (async () => {
      try {
        const result = await getClientOrdersTodaySummary(options);
        const currentDate = getOmskDateKey();
        if (currentDate !== todayDateKey) {
          setTodayDateKey(currentDate);
          return null;
        }
        const normalized = sanitizeTodaySummary(result, currentDate);
        if (!normalized) throw new Error('Некорректные данные статистики заказов за сегодня');
        if (todaySummaryRequestIdRef.current !== requestId) return null;
        todaySummaryRef.current = normalized;
        setTodaySummary(normalized);
        if (todaySummaryStorageKey) {
          void writeStoredTodaySummary(todaySummaryStorageKey, { date: currentDate, summary: normalized });
        }
        return normalized;
      } catch (error) {
        if (todaySummaryRequestIdRef.current === requestId) {
          setTodaySummaryError(userErrorMessage(error, 'Не удалось обновить статистику заказов за сегодня.'));
        }
        return null;
      } finally {
        if (todaySummaryRequestIdRef.current === requestId) setLoadingTodaySummary(false);
        if (todaySummaryRequestIdRef.current === requestId) setCalculatingTodayProfit(false);
        todaySummaryInFlightRef.current = null;
      }
    })();
    todaySummaryInFlightRef.current = task;
    return task;
  }, [todayDateKey, todaySummaryStorageKey]);

  const draftMode = !draft.guid;
  const filtersSignature = React.useMemo(() => ordersFilterSignature(filters), [filters]);
  const readOnly = !!selectedOrder?.readOnly || !!selectedOrder?.hasRealization;
  const mutationLocked = saving || submitting || copying || cancelling || deletingDraft;
  const selectedOrderQueued = isQueuedClientOrder(selectedOrder);
  const selectedOrderSynced = !!selectedOrder && (
    selectedOrder.syncState === 'SYNCED' ||
    selectedOrder.status === 'SENT_TO_1C' ||
    selectedOrder.status === 'CONFIRMED'
  );
  const selectedOrderHas1cError = !!(selectedOrder?.last1cError || selectedOrder?.lastExportError);
  const baseValidation = React.useMemo(() => validateDraft(draft), [draft]);
  const validation = React.useMemo(() => {
    let nextValidation = baseValidation;
    const exportValidation = !dirty ? selectedOrder?.exportValidation : null;
    if (exportValidation?.itemErrors?.length) {
      const itemMessages = { ...nextValidation.itemMessages };
      const lineKeyByGuid = new Map(draft.items.map((item) => [item.lineGuid, item.key]));
      let hasServerItemErrors = false;

      for (const itemError of exportValidation.itemErrors) {
        if (!itemError.lineGuid) continue;
        const key = lineKeyByGuid.get(itemError.lineGuid);
        const message = itemError.message?.trim();
        if (!key || !message) continue;
        const currentMessages = itemMessages[key] ?? [];
        if (!currentMessages.includes(message)) {
          itemMessages[key] = [...currentMessages, message];
        }
        hasServerItemErrors = true;
      }

      if (hasServerItemErrors) {
        nextValidation = {
          ...nextValidation,
          canSubmit: false,
          itemMessages,
          blockingMessage: nextValidation.blockingMessage || 'Исправьте ошибки по остаткам в строках заказа.',
        };
      }
    } else if (exportValidation?.message) {
      nextValidation = {
        ...nextValidation,
        canSubmit: false,
        blockingMessage: nextValidation.blockingMessage || exportValidation.message,
      };
    }

    if (draftMode && settings?.deliveryDateIssue) {
      return {
        ...nextValidation,
        canSave: false,
        canAutosave: false,
        canSubmit: false,
        blockingMessage: settings.deliveryDateIssueMessage || 'Проверьте настройки даты отгрузки.',
      };
    }
    return nextValidation;
  }, [
    baseValidation,
    dirty,
    draft.items,
    draftMode,
    selectedOrder?.exportValidation,
    settings?.deliveryDateIssue,
    settings?.deliveryDateIssueMessage,
  ]);
  const canSubmitOrder =
    validation.canSubmit &&
    (!selectedOrderQueued || dirty || selectedOrderHas1cError) &&
    (!selectedOrderSynced || dirty || selectedOrderHas1cError);
  const draftMetrics = React.useMemo(
    () => computeDraftMetrics(draft),
    [draft.generalDiscountPercent, draft.items]
  );
  const localTotal = draftMetrics.total;
  const localProfit = draftMetrics.profit;
  const localProfitBasisAmount = draftMetrics.profitBasisAmount;
  const localProfitabilityPercent = draftMetrics.profitBasisAmount !== 0
    ? draftMetrics.profit / draftMetrics.profitBasisAmount * 100
    : null;
  const localWeight = draftMetrics.weight;
  const localProfitAvailable = draftMetrics.profitItems > 0;
  const visibleDeviceOrders = React.useMemo(
    () => deviceDraftEntries.map((entry) => entry.order).filter((order) => orderMatchesFilters(order, filters)),
    [deviceDraftEntries, filters]
  );
  const visibleApiOrders = React.useMemo(
    () => orders.filter((order) => orderMatchesFilters(order, filters)),
    [orders, filters]
  );
  const sortedOrders = React.useMemo(() => {
    // The API already returns documents in their canonical pagination order.
    // Re-sorting the entire accumulated window after every appended page can
    // insert new rows above the current viewport and visibly move the list.
    // Only device drafts need local ordering and pinning above server results.
    const sortedDeviceOrders = sortClientOrdersForWorkspace(visibleDeviceOrders);
    const deviceGuids = new Set(sortedDeviceOrders.map((order) => order.guid));
    const deviceClientOrderIds = new Set(
      sortedDeviceOrders.map((order) => order.clientOrderId).filter(Boolean)
    );
    return [
      ...sortedDeviceOrders,
      ...visibleApiOrders.filter((order) => (
        !deviceGuids.has(order.guid)
        && (!order.clientOrderId || !deviceClientOrderIds.has(order.clientOrderId))
      )),
    ];
  }, [visibleApiOrders, visibleDeviceOrders]);
  const latestDraftOrder = React.useMemo(() => sortedOrders.find((item) => item.status === 'DRAFT') || null, [sortedOrders]);
  const pendingInvoiceIdentifiers = React.useMemo(
    () => Array.from(new Set(sortedOrders
      .filter((order) => hasPendingClientOrderInvoice(order))
      .map((order) => getClientOrderInvoiceIdentifier(order))
      .filter((identifier): identifier is string => !!identifier))),
    [sortedOrders]
  );
  const hasQueuedOrders = React.useMemo(
    () => sortedOrders.some((order) => isQueuedClientOrder(order))
      || isQueuedClientOrder(selectedOrder),
    [selectedOrder, sortedOrders]
  );
  const hasEditableDocument = documentStarted || !!draft.guid || !!selectedGuid || !!selectedOrder;
  const statusCounts = React.useMemo(() => {
    const loadedCounts = sortedOrders.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    const counts = Object.keys(ordersMeta.statusCounts).length
      ? visibleDeviceOrders.reduce<Record<string, number>>((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        }, { ...ordersMeta.statusCounts })
      : loadedCounts;
    const allCount = Object.keys(ordersMeta.statusCounts).length
      ? Object.values(ordersMeta.statusCounts).reduce((sum, count) => sum + count, 0) + visibleDeviceOrders.length
      : ordersMeta.total || sortedOrders.length;
    return {
      all: allCount,
      draft: counts.DRAFT || 0,
      queued: counts.QUEUED || 0,
      sent: counts.SENT_TO_1C || 0,
      cancelled: counts.CANCELLED || 0,
    };
  }, [ordersMeta.statusCounts, ordersMeta.total, sortedOrders, visibleDeviceOrders]);

  const hasMoreOrders = typeof ordersMeta.hasMore === 'boolean'
    ? ordersMeta.hasMore
    : ordersNextOffsetRef.current < (ordersMeta.total || 0);

  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  React.useEffect(() => {
    apiOrdersRef.current = orders;
  }, [orders]);

  React.useEffect(() => {
    ordersRef.current = sortedOrders;
  }, [sortedOrders]);

  React.useEffect(() => {
    deviceDraftEntriesRef.current = deviceDraftEntries;
  }, [deviceDraftEntries]);

  React.useEffect(() => {
    documentStartedRef.current = documentStarted;
  }, [documentStarted]);

  React.useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  React.useEffect(() => {
    if (!readOnly || !dirty) return;
    dirtyRef.current = false;
    setDirty(false);
    setAutosaveState('idle');
    setAutosaveError(null);
  }, [dirty, readOnly]);

  React.useEffect(() => {
    selectedGuidRef.current = selectedGuid;
  }, [selectedGuid]);

  React.useEffect(() => {
    let cancelled = false;
    ordersInitialLoadDoneRef.current = false;
    apiOrdersRef.current = [];
    ordersNextOffsetRef.current = 0;
    setOrders([]);
    setOrdersInitialLoadDone(false);
    setLoadingOrders(false);
    setFiltersHydrated(false);
    void readStoredFilters(filtersStorageKey).then((stored) => {
      if (cancelled) return;
      setFilters(stored ?? emptyFilters());
      setFiltersHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [filtersStorageKey]);

  React.useEffect(() => {
    if (!filtersHydrated) {
      setOrdersCacheHydrated(false);
      return undefined;
    }
    let cancelled = false;
    setOrdersCacheHydrated(false);
    void readStoredOrdersCache(ordersCacheStorageKey, filtersSignature).then((cache) => {
      if (cancelled) return;
      if (cache) {
        apiOrdersRef.current = cache.orders;
        setOrders(cache.orders);
        ordersNextOffsetRef.current = Math.max(cache.nextOffset, cache.orders.length);
        setOrdersMeta(cache.meta);
        markOrdersInitialLoadDone();
      } else {
        ordersNextOffsetRef.current = 0;
        if (!ordersInitialLoadDoneRef.current && apiOrdersRef.current.length === 0) {
          apiOrdersRef.current = [];
          setOrders([]);
          setOrdersMeta({ total: 0, limit: ORDERS_PAGE_SIZE, offset: 0, statusCounts: {} });
          setLoadingOrders(true);
        }
      }
      setOrdersCacheHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [filtersHydrated, filtersSignature, markOrdersInitialLoadDone, ordersCacheStorageKey]);

  React.useEffect(() => {
    let cancelled = false;
    setDeviceDraftsHydrated(false);
    void readStoredDeviceDrafts(deviceDraftsStorageKey).then((entries) => {
      if (cancelled) return;
      setDeviceDraftEntries(entries);
      setDeviceDraftsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [deviceDraftsStorageKey]);

  React.useEffect(() => {
    let cancelled = false;
    todaySummaryRequestIdRef.current += 1;
    todaySummaryInFlightRef.current = null;
    todaySummaryRef.current = null;
    setTodaySummary(null);
    setTodaySummaryError(null);
    setLoadingTodaySummary(true);
    setTodaySummaryHydrated(false);
    if (!todaySummaryStorageKey) {
      setTodaySummaryHydrated(true);
      return undefined;
    }
    void readStoredTodaySummary(todaySummaryStorageKey, todayDateKey).then((entry) => {
      if (cancelled) return;
      if (entry) {
        todaySummaryRef.current = entry.summary;
        setTodaySummary(entry.summary);
        setLoadingTodaySummary(false);
      }
      setTodaySummaryHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [todayDateKey, todaySummaryStorageKey]);

  React.useEffect(() => {
    if (!filtersHydrated) return;
    const timer = setTimeout(() => {
      void writeStoredFilters(filtersStorageKey, filters);
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, filtersHydrated, filtersStorageKey]);

  const resetDraftToBase = React.useCallback((nextSettings?: ClientOrderSettings | null) => {
    const base = buildDraftBase(nextSettings ?? settings);
    selectedGuidRef.current = null;
    documentStartedRef.current = false;
    contextRefreshSignatureRef.current = '';
    defaultsRequestIdRef.current += 1;
    enumOptionsRequestIdRef.current += 1;
    deliveryAddressManualVersionRef.current += 1;
    setDraft(normalizeDraftOrder({ ...emptyDraft(), ...base }));
    setSelections({
      ...emptySelections(),
      organization: (nextSettings ?? settings)?.preferredOrganization || null,
    });
    setSelectedGuid(null);
    setSelectedOrder(null);
    setPaymentFormOptions([]);
    setDeliveryMethodOptions([]);
    setDocumentStarted(false);
    setDirty(false);
    setAutosaveState('idle');
    setAutosaveError(null);
    setError(null);
  }, [settings]);

  const markDirty = React.useCallback(() => {
    setDirty(true);
    setAutosaveError(null);
    setAutosaveState('idle');
  }, []);

  const patchDraft = React.useCallback((patch: Partial<DraftOrder> | ((prev: DraftOrder) => DraftOrder)) => {
    setDraft((prev) => normalizeDraftOrder(
      typeof patch === 'function' ? patch(prev) : { ...prev, ...patch },
      prev
    ));
    markDirty();
  }, [markDirty]);

  const applySavedOrderToList = React.useCallback((order: ClientOrder) => {
    const matches = orderMatchesFilters(order, filters);
    setOrders((prev) => {
      const existingIndex = prev.findIndex((item) => item.guid === order.guid);
      if (matches) {
        const next = existingIndex >= 0
          ? prev.map((item) => (item.guid === order.guid ? order : item))
          : [order, ...prev];
        return sortClientOrdersForWorkspace(next);
      }
      if (existingIndex < 0) return prev;
      return prev.filter((item) => item.guid !== order.guid);
    });
    setOrdersMeta((prev) => {
      const existingVisible = ordersRef.current.some((item) => item.guid === order.guid);
      if (matches && !existingVisible) {
        return { ...prev, total: prev.total + 1 };
      }
      if (!matches && existingVisible) {
        return { ...prev, total: Math.max(0, prev.total - 1) };
      }
      return prev;
    });
  }, [filters]);

  const setItemPatch = React.useCallback((lineKey: string, patch: Partial<DraftItem>) => {
    patchDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.key !== lineKey) return item;
        const changed = (Object.keys(patch) as Array<keyof DraftItem>)
          .some((key) => item[key] !== patch[key]);
        return changed ? { ...item, ...patch } : item;
      }),
    }));
  }, [patchDraft]);

  const setItemMetadataPatches = React.useCallback((patches: Array<{ lineKey: string; patch: Partial<DraftItem> }>) => {
    if (!patches.length) return;
    const patchByKey = new Map(patches.map((entry) => [entry.lineKey, entry.patch]));
    setDraft((prev) => {
      let changed = false;
      const items = prev.items.map((item) => {
        const patch = patchByKey.get(item.key);
        if (!patch) return item;
        const patchKeys = Object.keys(patch) as Array<keyof DraftItem>;
        if (!patchKeys.some((key) => !Object.is(item[key], patch[key]))) return item;
        changed = true;
        return { ...item, ...patch };
      });
      return changed ? normalizeDraftOrder({ ...prev, items }, prev) : prev;
    });
  }, []);

  const enrichItemsMetadata = React.useCallback(async (
    sourceDraft: DraftOrder,
    options?: { refreshCommercialData?: boolean; receiptPriceAt?: string }
  ) => {
    const loadingRequestId = ++receiptPriceLoadingRequestIdRef.current;
    if (!sourceDraft.counterpartyGuid || !sourceDraft.items.length) {
      setLoadingReceiptPrices(false);
      return;
    }
    const productGuids = Array.from(new Set(sourceDraft.items.map((item) => item.productGuid).filter(Boolean)));
    if (!productGuids.length) {
      setLoadingReceiptPrices(false);
      return;
    }

    const requestId = ++pricingRequestIdRef.current;
    const targetGuid = sourceDraft.guid || null;
    setLoadingReceiptPrices(true);
    try {
      const products = await getClientOrderProductsBatch({
        productGuids,
        organizationGuid: sourceDraft.organizationGuid || undefined,
        counterpartyGuid: sourceDraft.counterpartyGuid,
        agreementGuid: sourceDraft.agreementGuid || undefined,
        warehouseGuid: sourceDraft.warehouseGuid || undefined,
        priceTypeGuid: sourceDraft.priceTypeGuid || undefined,
        receiptPriceAt: options?.receiptPriceAt,
      });
      if (pricingRequestIdRef.current !== requestId) return;

      const productByGuid = new Map(products.map((product) => [product.guid, product]));
      if (options?.refreshCommercialData) setDirty(true);
      setDraft((prev) => {
        if (targetGuid && prev.guid !== targetGuid) return prev;
        if (!targetGuid && prev.guid) return prev;

        return normalizeDraftOrder({
          ...prev,
          items: prev.items.map((item) => {
            const product = productByGuid.get(item.productGuid);
            if (!product) return item;
            const isManualPrice = hasManualPrice(item);
            const refreshCommercialData = options?.refreshCommercialData === true;
            const packages = mergeDraftPackagesForProduct(product, item.packages, item.baseUnit);
            const hasProductPackages = Array.isArray(product.packages);
            return {
              ...item,
              packageGuid: normalizePackageGuid(item.packageGuid, packages),
              basePrice: refreshCommercialData && !isManualPrice
                ? product.basePrice ?? null
                : item.basePrice,
              // Себестоимость и цена продажи — разные величины. Всегда берем
              // актуальную себестоимость товара; сохраненное значение оставляем
              // только как резерв при недоступности коммерческих данных.
              receiptPrice: product.receiptPrice ?? item.receiptPrice ?? null,
              priceTypeGuid: refreshCommercialData && !isManualPrice
                ? sourceDraft.priceTypeGuid ?? product.priceType?.guid ?? null
                : item.priceTypeGuid,
              priceTypeName: refreshCommercialData && !isManualPrice
                ? sourceDraft.priceTypeName ?? product.priceType?.name ?? null
                : item.priceTypeName,
              priceSource: refreshCommercialData && !isManualPrice
                ? product.priceMatch?.source
                  ? `${product.priceMatch.source}:${product.priceMatch.level ?? ''}`
                  : null
                : item.priceSource,
              baseUnit: product.baseUnit ?? item.baseUnit ?? null,
              productWeight: product.weight ?? item.productWeight ?? null,
              weightUnit: product.weightUnit ?? item.weightUnit ?? null,
              stock: product.stock ?? item.stock ?? null,
              packages: hasProductPackages ? packages : item.packages,
              packagesLoaded: hasProductPackages ? true : item.packagesLoaded,
              imageThumbUrl: product.imageThumbUrl ?? item.imageThumbUrl ?? null,
              imagePreviewUrl: product.imagePreviewUrl ?? item.imagePreviewUrl ?? null,
              imageHash: product.imageHash ?? item.imageHash ?? null,
              images: product.images ?? item.images ?? [],
            };
          }),
        }, prev);
      });
    } catch {
      // Metadata is optional on open: keep saved document values intact.
    } finally {
      if (receiptPriceLoadingRequestIdRef.current === loadingRequestId) {
        setLoadingReceiptPrices(false);
      }
    }
  }, []);

  const enrichItemMetadata = React.useCallback((lineKey: string) => {
    const item = draft.items.find((next) => next.key === lineKey);
    if (!item) return Promise.resolve();
    return enrichItemsMetadata(
      { ...draft, items: [item] },
      { receiptPriceAt: readOnly ? selectedOrder?.date1c ?? undefined : undefined }
    );
  }, [draft, enrichItemsMetadata, readOnly, selectedOrder?.date1c]);

  const refreshDocumentProfit = React.useCallback(() => {
    if (loadingReceiptPrices) return Promise.resolve();
    return enrichItemsMetadata(
      draft,
      { receiptPriceAt: readOnly ? selectedOrder?.date1c ?? undefined : undefined }
    );
  }, [draft, enrichItemsMetadata, loadingReceiptPrices, readOnly, selectedOrder?.date1c]);

  const mergeSavedOrderIntoDraft = React.useCallback((
    order: ClientOrder,
    options?: { preservedDeliveryAddressGuid?: string | null }
  ) => {
    setDraft((prev) => normalizeDraftOrder({
      ...prev,
      guid: order.guid,
      clientOrderId: order.clientOrderId ?? prev.clientOrderId ?? null,
      clientRevision: Number(order.clientRevision ?? prev.clientRevision ?? 0),
      revision: order.revision,
      deliveryDate: order.deliveryDate ?? prev.deliveryDate ?? null,
      comment: order.comment ?? prev.comment,
      organizationGuid: order.organization?.guid ?? prev.organizationGuid,
      counterpartyGuid: order.counterparty?.guid ?? prev.counterpartyGuid,
      agreementGuid: order.agreement?.guid ?? prev.agreementGuid,
      contractGuid: order.contract?.guid ?? prev.contractGuid,
      warehouseGuid: order.warehouse?.guid ?? prev.warehouseGuid,
      deliveryAddressGuid: options?.preservedDeliveryAddressGuid
        ?? order.deliveryAddress?.guid
        ?? prev.deliveryAddressGuid,
      paymentForm: order.paymentForm ?? prev.paymentForm ?? null,
      deliveryMethod: order.deliveryMethod ?? prev.deliveryMethod ?? null,
      invoiceRequested: order.invoiceRequested ?? prev.invoiceRequested,
    }, prev));
  }, []);

  const mergeServerRevisionIntoOpenDraft = React.useCallback((order: ClientOrder) => {
    setSelectedOrder((prev) => {
      if (prev?.guid !== order.guid) return prev;
      const next = mergeOrderListMetadata(prev, order);
      return orderListContentSignature(prev) === orderListContentSignature(next) ? prev : next;
    });
    setDraft((prev) => {
      if (prev.guid !== order.guid) return prev;
      const serverRevision = Number(order.revision || 0);
      if (!Number.isFinite(serverRevision) || serverRevision <= (prev.revision || 0)) return prev;
      return normalizeDraftOrder({ ...prev, revision: serverRevision }, prev);
    });
  }, []);

  const refreshSelectedOrderInvoices = React.useCallback(async () => {
    const guid = selectedGuidRef.current;
    if (!guid || isDeviceDraftGuid(guid) || invoicePollingRef.current) return;
    const invoiceIdentifier = getClientOrderInvoiceIdentifier(selectedOrder) || guid;
    invoicePollingRef.current = true;
    try {
      const invoices = await getClientOrderInvoices(invoiceIdentifier);
      if (selectedGuidRef.current !== guid) return;
      setSelectedOrder((prev) => {
        if (prev?.guid !== guid) return prev;
        const next = mergeOrderInvoices(prev, invoices);
        return orderListContentSignature(prev) === orderListContentSignature(next) ? prev : next;
      });
      setOrders((prev) => {
        let changed = false;
        const next = prev.map((order) => {
          if (order.guid !== guid) return order;
          const merged = mergeOrderInvoices(order, invoices);
          if (orderListContentSignature(order) === orderListContentSignature(merged)) return order;
          changed = true;
          return merged;
        });
        return changed ? next : prev;
      });
    } catch {
      // Polling is opportunistic: regular detail refresh remains the fallback.
    } finally {
      invoicePollingRef.current = false;
    }
  }, [selectedOrder?.appGuid]);

  const applyInvoiceRequestResult = React.useCallback((identifier: string, invoices: ClientOrderInvoice[]) => {
    const apply = (order: ClientOrder | null) => {
      if (!order || !orderMatchesInvoiceIdentifier(order, identifier)) return order;
      return mergeOrderInvoices({
        ...order,
        invoiceState: 'WAITING',
        invoiceWaitReason: 'Счёт формируется',
        invoiceRequestPending: true,
      }, invoices);
    };
    setSelectedOrder((current) => apply(current));
    setOrders((current) => {
      const next = current.map((order) => apply(order) ?? order);
      // Keep the mutable read model in sync before a fast return to the list
      // can start a server refresh with an older invoice snapshot.
      apiOrdersRef.current = next;
      return next;
    });
  }, []);

  const loadEnumOptionsForContext = React.useCallback(async (organizationGuid?: string | null, counterpartyGuid?: string | null) => {
    const requestId = ++enumOptionsRequestIdRef.current;
    if (!organizationGuid || !counterpartyGuid) {
      setPaymentFormOptions([]);
      setDeliveryMethodOptions([]);
      return;
    }
    try {
      const defaults = await getClientOrderDefaults({ organizationGuid, counterpartyGuid });
      if (enumOptionsRequestIdRef.current !== requestId) return;
      setPaymentFormOptions(defaults.paymentForms || []);
      setDeliveryMethodOptions(defaults.deliveryMethods || []);
      setSelections((current) => {
        if (!current.counterparty || current.counterparty.guid.toLowerCase() !== counterpartyGuid.toLowerCase()) {
          return current;
        }
        const defaultsCounterparty = defaults.counterparty?.guid.toLowerCase() === counterpartyGuid.toLowerCase()
          ? defaults.counterparty
          : null;
        return {
          ...current,
          counterparty: {
            ...current.counterparty,
            ...(defaultsCounterparty || {}),
            hasDebt: defaultsCounterparty?.hasDebt ?? defaults.hasDebt ?? current.counterparty.hasDebt ?? false,
            shipmentProhibited: defaultsCounterparty?.shipmentProhibited
              ?? defaults.shipmentProhibited
              ?? current.counterparty.shipmentProhibited
              ?? false,
            debtReason: defaultsCounterparty?.debtReason
              ?? defaults.debtReason
              ?? current.counterparty.debtReason
              ?? null,
          },
        };
      });
    } catch {
      if (enumOptionsRequestIdRef.current !== requestId) return;
    }
  }, []);

  const applyOrderDetail = React.useCallback((
    order: ClientOrder,
    options?: { refreshCommercialData?: boolean }
  ) => {
    const hasDebt = !!(order.hasDebt || order.counterparty?.hasDebt);
    const shipmentProhibited = !!(order.shipmentProhibited || order.counterparty?.shipmentProhibited);
    const debtReason = order.debtReason || order.counterparty?.debtReason || null;
    const normalizedOrder: ClientOrder = {
      ...order,
      hasDebt,
      shipmentProhibited,
      debtReason,
      counterparty: order.counterparty
        ? { ...order.counterparty, hasDebt, shipmentProhibited, debtReason }
        : null,
    };
    const nextDraft = normalizeDraftOrder(orderToDraft(normalizedOrder));
    selectedGuidRef.current = normalizedOrder.guid;
    contextRefreshSignatureRef.current = buildPricingContextSignature(nextDraft);
    setSelectedGuid(normalizedOrder.guid);
    setSelectedOrder(normalizedOrder);
    setDraft(nextDraft);
    void enrichItemsMetadata(nextDraft, {
      ...options,
      receiptPriceAt: normalizedOrder.readOnly ? normalizedOrder.date1c ?? undefined : undefined,
    });
    setDocumentStarted(true);
    setSelections({
      organization: normalizedOrder.organization || null,
      counterparty: normalizedOrder.counterparty || null,
      agreement: normalizedOrder.agreement || null,
      contract: normalizedOrder.contract || null,
      warehouse: normalizedOrder.warehouse || null,
      deliveryAddress: normalizedOrder.deliveryAddress || null,
    });
    void loadEnumOptionsForContext(nextDraft.organizationGuid, nextDraft.counterpartyGuid);
    setDirty(false);
    setAutosaveState('idle');
    setAutosaveError(null);
  }, [enrichItemsMetadata, loadEnumOptionsForContext]);

  const replaceDeviceDraftEntries = React.useCallback((entries: DeviceDraftEntry[]) => {
    deviceDraftEntriesRef.current = entries;
    setDeviceDraftEntries(entries);
    void writeStoredDeviceDrafts(deviceDraftsStorageKey, entries);
  }, [deviceDraftsStorageKey]);

  const findDeviceDraftEntry = React.useCallback((guid?: string | null) => {
    if (!guid) return null;
    return deviceDraftEntriesRef.current.find((entry) => entry.order.guid === guid || entry.serverGuid === guid) ?? null;
  }, []);

  const removeDeviceDraftEntry = React.useCallback((guid?: string | null) => {
    if (!guid) return;
    const next = deviceDraftEntriesRef.current.filter((entry) => entry.order.guid !== guid && entry.serverGuid !== guid);
    replaceDeviceDraftEntries(next);
  }, [replaceDeviceDraftEntries]);

  const saveDraftOnDevice = React.useCallback((
    payload: ClientOrderSavePayload,
    syncError?: string | null,
    operation?: { clientOrderId: string; clientRevision: number; intent: 'SAVE' | 'SUBMIT' }
  ) => {
    const nowIso = new Date().toISOString();
    const existing = findDeviceDraftEntry(draft.guid);
    const serverGuid = existing?.serverGuid ?? (draft.guid && !isDeviceDraftGuid(draft.guid) ? draft.guid : null);
    const clientOrderId = operation?.clientOrderId
      ?? existing?.clientOrderId
      ?? draft.clientOrderId
      ?? (serverGuid ? `legacy-server:${serverGuid}` : makeClientOrderId());
    const clientRevision = operation?.clientRevision
      ?? existing?.clientRevision
      ?? Math.max(1, draft.clientRevision || 0);
    const intent = operation?.intent === 'SUBMIT' || existing?.intent === 'SUBMIT' ? 'SUBMIT' : 'SAVE';
    const localGuid = existing?.order.guid ?? draft.guid ?? makeDeviceDraftGuid();
    const createdAt = existing?.createdAt ?? selectedOrder?.createdAt ?? nowIso;
    const revision = Math.max(1, existing?.order.revision ?? draft.revision ?? 0);
    const entry: DeviceDraftEntry = {
      id: existing?.id ?? makeDeviceDraftGuid(),
      clientOrderId,
      clientRevision,
      intent,
      serverGuid,
      serverRevision: existing?.serverRevision ?? (serverGuid ? draft.revision : null),
      order: {
        ...buildDeviceOrderFromDraft({
          draft: { ...draft, guid: localGuid, clientOrderId, clientRevision, revision },
          selections,
          guid: localGuid,
          revision,
          createdAt,
          updatedAt: nowIso,
          lastSyncError: syncError ?? null,
        }),
        ...(intent === 'SUBMIT' ? { status: 'QUEUED', syncState: 'QUEUED' } : {}),
      },
      payload,
      createdAt,
      updatedAt: nowIso,
      lastSyncError: syncError ?? null,
      syncAttempts: syncError ? existing?.syncAttempts ?? 0 : 0,
      nextSyncAt: null,
    };
    const withoutCurrent = deviceDraftEntriesRef.current.filter((item) => item.id !== entry.id && item.order.guid !== localGuid && item.serverGuid !== serverGuid);
    replaceDeviceDraftEntries([entry, ...withoutCurrent]);
    return entry.order;
  }, [draft, findDeviceDraftEntry, replaceDeviceDraftEntries, selectedOrder?.createdAt, selections]);

  const createDeviceCopyFromCurrentDraft = React.useCallback(() => {
    const nowIso = new Date().toISOString();
    const localGuid = makeDeviceDraftGuid();
    const copiedDraft = normalizeDraftOrder({
      ...draft,
      guid: localGuid,
      clientOrderId: makeClientOrderId(),
      clientRevision: 1,
      revision: 1,
      items: draft.items.map((item) => {
        const keepsManualPrice = hasManualPrice(item);
        return {
          ...item,
          key: makeKey(),
          lineGuid: makeLineGuid(),
          basePrice: keepsManualPrice ? item.basePrice : null,
          priceSource: keepsManualPrice ? item.priceSource : null,
          isCancelled: false,
          cancelReasonGuid: null,
          cancelReasonName: null,
          cancelReason: null,
          cancelledAmount: null,
        };
      }),
    });
    const order = buildDeviceOrderFromDraft({
      draft: copiedDraft,
      selections,
      guid: localGuid,
      revision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastSyncError: null,
    });
    const entry: DeviceDraftEntry = {
      id: makeDeviceDraftGuid(),
      clientOrderId: copiedDraft.clientOrderId!,
      clientRevision: copiedDraft.clientRevision,
      intent: 'SAVE',
      serverGuid: null,
      serverRevision: null,
      order,
      payload: buildCopyPayload(copiedDraft),
      createdAt: nowIso,
      updatedAt: nowIso,
      lastSyncError: null,
      syncAttempts: 0,
      nextSyncAt: null,
    };
    replaceDeviceDraftEntries([entry, ...deviceDraftEntriesRef.current]);
    applySavedOrderToList(order);
    applyOrderDetail(order, { refreshCommercialData: true });
    // Preserve incomplete or malformed input exactly in the editable copy.
    setDraft(copiedDraft);
    setError(null);
    return order;
  }, [applyOrderDetail, applySavedOrderToList, draft, replaceDeviceDraftEntries, selections]);

  const syncDeviceDrafts = React.useCallback(async (syncOptions: { force?: boolean } = {}) => {
    if (!deviceDraftsHydrated || deviceDraftSyncingRef.current) return;
    const entries = deviceDraftEntriesRef.current;
    if (!entries.length) return;
    const dueEntries = syncOptions.force ? entries : entries.filter((entry) => isDeviceDraftSyncDue(entry));
    if (!dueEntries.length) return;

    deviceDraftSyncingRef.current = true;
    let nextEntries = entries;

    try {
      for (const entry of dueEntries) {
        try {
          let order: ClientOrder;
          if (entry.clientOrderId.startsWith('legacy-server:')) {
            order = entry.serverGuid
              ? await updateClientOrder(entry.serverGuid, {
                  ...entry.payload,
                  revision: entry.serverRevision ?? entry.order.revision,
                })
              : await createClientOrder(entry.payload);
            if (entry.intent === 'SUBMIT') {
              order = await submitClientOrder(order.guid, order.revision);
            }
          } else {
            order = await putClientOrderByClientId(
              entry.clientOrderId,
              entry.payload,
              { clientRevision: entry.clientRevision, intent: entry.intent }
            );
          }
          nextEntries = nextEntries.filter((item) => item.id !== entry.id);
          replaceDeviceDraftEntries(nextEntries);
          applySavedOrderToList(order);
          const currentGuid = selectedGuidRef.current;
          if (currentGuid === entry.order.guid || currentGuid === entry.serverGuid) {
            applyOrderDetail(order);
          }
        } catch (error) {
          const message = userErrorMessage(error, 'Не удалось перенести локальный документ в API.');
          nextEntries = nextEntries.map((item) => (
            item.id === entry.id ? withDeviceDraftSyncFailure(item, message) : item
          ));
          replaceDeviceDraftEntries(nextEntries);

          if (isTransientDeviceDraftSyncError(error)) {
            break;
          }
        }
      }
    } finally {
      deviceDraftSyncingRef.current = false;
    }
  }, [applyOrderDetail, applySavedOrderToList, deviceDraftsHydrated, replaceDeviceDraftEntries]);

  const removeItem = React.useCallback((lineKey: string) => {
    patchDraft((prev) => ({ ...prev, items: prev.items.filter((item) => item.key !== lineKey) }));
  }, [patchDraft]);

  const clearItems = React.useCallback(() => {
    patchDraft((prev) => ({ ...prev, items: [] }));
  }, [patchDraft]);

  const loadSettings = React.useCallback(async () => {
    setLoadingSettings(true);
    try {
      const nextSettings = await getClientOrderSettings();
      setSettings(nextSettings);
      setDraft((prev) => {
        if (prev.guid || prev.organizationGuid || prev.counterpartyGuid || prev.items.length) return prev;
        return normalizeDraftOrder({ ...prev, ...buildDraftBase(nextSettings) }, prev);
      });
      setSelections((prev) => ({
        ...prev,
        organization: prev.organization || nextSettings.preferredOrganization || null,
      }));
      return nextSettings;
    } catch (e: any) {
      setOrdersError(userErrorMessage(e, 'Не удалось загрузить настройки заказов клиентов.'));
      return null;
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const loadOrders = React.useCallback(async (mode: 'reset' | 'append' = 'reset', loadOptions?: { silent?: boolean }) => {
    if (mode === 'append' && ordersAppendLoadingRef.current) return;
    const silent = loadOptions?.silent === true;
    const offset = mode === 'append' ? ordersNextOffsetRef.current : 0;
    const requestId = silent ? ++silentOrdersRequestIdRef.current : ++ordersRequestIdRef.current;
    if (mode === 'append') {
      ordersAppendLoadingRef.current = true;
      setLoadingMoreOrders(true);
      setOrdersAppendError(null);
    } else if (!silent) {
      setLoadingOrders(true);
      setOrdersError(null);
      setOrdersAppendError(null);
    }

    try {
      const result = await getClientOrders({
        limit: ORDERS_PAGE_SIZE,
        offset,
        search: filters.search || undefined,
        statuses: filters.statuses.length ? filters.statuses : undefined,
        syncState: filters.syncState || undefined,
        counterpartyGuid: filters.counterpartyGuid || undefined,
        organizationGuid: filters.organizationGuid || undefined,
        warehouseGuid: filters.warehouseGuid || undefined,
        priceTypeGuid: filters.priceTypeGuid || undefined,
        amountMin: filters.amountMin || undefined,
        amountMax: filters.amountMax || undefined,
        deliveryDateFrom: filters.deliveryDateFrom || undefined,
        deliveryDateTo: filters.deliveryDateTo || undefined,
        updatedFrom: filters.updatedFrom || undefined,
        updatedTo: filters.updatedTo || undefined,
        itemsMin: filters.itemsMin || undefined,
        itemsMax: filters.itemsMax || undefined,
        hasNumber1c: filters.hasNumber1c || undefined,
        onlyProblems: filters.onlyProblems || undefined,
      });
      const requestIsStale = silent
        ? silentOrdersRequestIdRef.current !== requestId
        : ordersRequestIdRef.current !== requestId;
      if (requestIsStale) return;
      const liveSource = result.meta.liveSource;
      if (liveSource?.status && liveSource.status !== 'ok' && liveSource.message) {
        setOrdersError(userErrorMessage(liveSource.message, 'Нет связи с 1С. Повторите попытку позже.'));
      } else if (liveSource?.status === 'ok') {
        setOrdersError(null);
      }
      const rawList = Array.isArray(result.items) ? result.items : [];
      const currentOrders = apiOrdersRef.current;
      const currentOrderByIdentifier = new Map<string, ClientOrder>();
      for (const order of currentOrders) {
        for (const identifier of [order.guid, order.appGuid, order.documentGuid]) {
          const normalized = identifier?.trim().toLowerCase();
          if (normalized) currentOrderByIdentifier.set(normalized, order);
        }
      }
      const list = rawList.map((summary) => {
        const current = currentOrderByIdentifier.get(summary.guid.trim().toLowerCase());
        if (!current) return summary;
        const next = preserveTransientInvoiceListState(current, summary);
        return orderListContentSignature(current) === orderListContentSignature(next) ? current : next;
      });
      const fetchedNextOffset = offset + list.length;
      const knownOrderGuids = new Set(currentOrders.map((known) => known.guid));
      const preserveLoadedWindow = mode === 'reset' && silent && currentOrders.length > list.length;
      const refreshedOrderGuids = new Set(list.map((item) => item.guid));
      const nextOrders = mode !== 'append'
        ? preserveLoadedWindow
          ? [
              ...list,
              ...currentOrders.filter((item) => !refreshedOrderGuids.has(item.guid)),
            ]
          : list
        : [
            ...currentOrders,
            ...list.filter((item) => !knownOrderGuids.has(item.guid)),
          ];
      const resolvedNextOrders = nextOrders.length === currentOrders.length
        && nextOrders.every((order, index) => order === currentOrders[index])
        ? currentOrders
        : nextOrders;
      const nextOffset = preserveLoadedWindow
        ? Math.max(ordersNextOffsetRef.current, fetchedNextOffset)
        : fetchedNextOffset;
      ordersNextOffsetRef.current = nextOffset;
      apiOrdersRef.current = resolvedNextOrders;
      setOrders(resolvedNextOrders);
      const currentSelectedGuid = selectedGuidRef.current;
      const selectedSummary = currentSelectedGuid
        ? resolvedNextOrders.find((item) => item.guid === currentSelectedGuid)
        : null;
      if (selectedSummary) {
        mergeServerRevisionIntoOpenDraft(selectedSummary);
      }
      const nextTotal = mode === 'append' && list.length === 0
        ? ordersNextOffsetRef.current
        : result.meta.total || 0;
      const nextMeta = {
        total: nextTotal,
        limit: result.meta.limit || ORDERS_PAGE_SIZE,
        offset: result.meta.offset || offset,
        hasMore: typeof result.meta.hasMore === 'boolean' ? result.meta.hasMore : undefined,
        statusCounts: result.meta.statusCounts || {},
      };
      setOrdersMeta((previous) => {
        const sameCounts = JSON.stringify(previous.statusCounts) === JSON.stringify(nextMeta.statusCounts);
        return previous.total === nextMeta.total
          && previous.limit === nextMeta.limit
          && previous.offset === nextMeta.offset
          && previous.hasMore === nextMeta.hasMore
          && sameCounts
          ? previous
          : nextMeta;
      });
      const cachedOrders = resolvedNextOrders.slice(0, ORDERS_CACHE_LIMIT);
      const previousCachedOrders = currentOrders.slice(0, ORDERS_CACHE_LIMIT);
      if (!silent || ordersCacheContentSignature(cachedOrders) !== ordersCacheContentSignature(previousCachedOrders)) {
        void writeStoredOrdersCache(ordersCacheStorageKey, {
          signature: filtersSignature,
          orders: cachedOrders,
          meta: nextMeta,
          nextOffset: Math.min(nextOffset, cachedOrders.length),
          storedAt: new Date().toISOString(),
        });
      }
      if (mode === 'reset') {
        markOrdersInitialLoadDone();
        const nextSorted = sortClientOrdersForWorkspace(list);
        const latestDraft = nextSorted.find((item) => item.status === 'DRAFT') || null;
        setSelectedGuid((prev) => {
          if (prev && list.some((item) => item.guid === prev)) return prev;
          if (documentStartedRef.current) return prev;
          // The mobile list must not open/load an arbitrary draft in the background.
          // Web keeps the legacy combined list/editor behaviour when screenMode is omitted.
          return options.screenMode ? null : latestDraft?.guid ?? null;
        });
        if (!latestDraft && !documentStartedRef.current && !selectedGuidRef.current) {
          setDocumentStarted(false);
          setSelectedOrder(null);
          setDraft((prev) => (prev.guid ? normalizeDraftOrder({ ...emptyDraft(), ...buildDraftBase(settingsRef.current) }) : prev));
        }
      }
    } catch (e: any) {
      const requestIsStale = silent
        ? silentOrdersRequestIdRef.current !== requestId
        : ordersRequestIdRef.current !== requestId;
      if (requestIsStale) return;
      const message = userErrorMessage(e, mode === 'append' ? 'Не удалось загрузить ещё документы.' : 'Не удалось загрузить список заказов.');
      if (mode === 'append') {
        setOrdersAppendError(message);
      } else {
        setOrdersError(message);
        if (!silent) markOrdersInitialLoadDone();
      }
    } finally {
      if (mode === 'append') {
        ordersAppendLoadingRef.current = false;
        setLoadingMoreOrders(false);
      }
      if (mode !== 'append' && ordersRequestIdRef.current === requestId && !silent) {
        setLoadingOrders(false);
      }
    }
  }, [filters, filtersSignature, markOrdersInitialLoadDone, mergeServerRevisionIntoOpenDraft, options.screenMode, ordersCacheStorageKey]);

  const refreshQueueState = React.useCallback(async () => {
    if (queueRefreshInFlightRef.current) return;
    queueRefreshInFlightRef.current = true;
    try {
      await loadOrders('reset', { silent: true });
    } finally {
      queueRefreshInFlightRef.current = false;
    }
  }, [loadOrders]);

  const refreshInvoiceStates = React.useCallback(async () => {
    if (invoiceStatusesInFlightRef.current || !pendingInvoiceIdentifiers.length) return;
    invoiceStatusesInFlightRef.current = true;
    try {
      const statuses = await getClientOrderInvoiceStatuses(pendingInvoiceIdentifiers);
      const byIdentifier = new Map(statuses.map((item) => [item.identifier.trim().toLowerCase(), item.invoices]));
      setOrders((current) => {
        let changed = false;
        const next = current.map((order) => {
          const identifier = getClientOrderInvoiceIdentifier(order)?.trim().toLowerCase();
          if (!identifier || !byIdentifier.has(identifier)) return order;
          const invoices = byIdentifier.get(identifier) ?? [];
          // An empty response can occur in the short interval before the 1C queue
          // is mirrored locally. Keep the optimistic clock instead of flickering.
          if (!invoices.length && order.invoiceRequestPending) return order;
          const merged = mergeOrderInvoices(order, invoices);
          if (clientOrderInvoiceSignature(merged) === clientOrderInvoiceSignature(order)) return order;
          changed = true;
          return merged;
        });
        if (!changed) return current;
        apiOrdersRef.current = next;
        return next;
      });
    } catch (error) {
      if (!isNetworkUnavailableError(error)) {
        console.warn('[client-orders] invoice status refresh failed', error);
      }
    } finally {
      invoiceStatusesInFlightRef.current = false;
    }
  }, [pendingInvoiceIdentifiers]);

  const loadDetail = React.useCallback(async (guid: string) => {
    const deviceEntry = findDeviceDraftEntry(guid);
    if (deviceEntry) {
      applyOrderDetail(deviceEntry.order);
      return deviceEntry.order;
    }

    const requestId = ++detailRequestIdRef.current;
    setLoadingDetail(true);
    setError(null);
    try {
      const order = await getClientOrder(guid);
      if (detailRequestIdRef.current !== requestId || selectedGuidRef.current !== guid) return null;
      applyOrderDetail(order);
      return order;
    } catch (e: any) {
      if (detailRequestIdRef.current !== requestId) return null;
      setError(userErrorMessage(e, 'Не удалось загрузить карточку заказа.'));
      return null;
    } finally {
      if (detailRequestIdRef.current === requestId) setLoadingDetail(false);
    }
  }, [applyOrderDetail, findDeviceDraftEntry]);

  const cancelDetailLoading = React.useCallback(() => {
    detailRequestIdRef.current += 1;
    selectedGuidRef.current = selectedGuid;
    setLoadingDetail(false);
  }, [selectedGuid]);

  const applyResolvedDefaults = React.useCallback(async (
    organizationGuid: string,
    counterpartyGuid: string,
    overrides: {
      organization?: ClientOrderOrganization | null;
      agreement?: ClientOrderAgreementOption | null;
      contract?: ClientOrderContractOption | null;
    } = {}
  ) => {
    if (!organizationGuid || !counterpartyGuid) return;
    const requestId = ++defaultsRequestIdRef.current;
    const deliveryAddressManualVersion = deliveryAddressManualVersionRef.current;
    setLoadingDefaults(true);
    try {
      const defaults = await getClientOrderDefaults({ organizationGuid, counterpartyGuid });
      if (defaultsRequestIdRef.current !== requestId) return;

      const agreement = overrides.agreement ?? defaults.agreement ?? null;
      const contract = overrides.contract ?? agreement?.contract ?? defaults.contract ?? null;
      const warehouse = agreement?.warehouse ?? defaults.warehouse ?? null;
      const deliveryAddress = defaults.deliveryAddress ?? null;
      const priceType = agreement?.priceType ?? defaults.priceType ?? null;
      const shouldApplyDeliveryAddress = deliveryAddressManualVersionRef.current === deliveryAddressManualVersion;
      setPaymentFormOptions(defaults.paymentForms || []);
      setDeliveryMethodOptions(defaults.deliveryMethods || []);

      setDraft((prev) => normalizeDraftOrder({
        ...prev,
        organizationGuid,
        agreementGuid: agreement?.guid || '',
        contractGuid: contract?.guid || '',
        warehouseGuid: warehouse?.guid || '',
        deliveryAddressGuid: shouldApplyDeliveryAddress
          ? deliveryAddress?.guid || ''
          : prev.deliveryAddressGuid,
        deliveryDate: prev.deliveryDate ?? defaults.deliveryDate ?? settingsRef.current?.resolvedDeliveryDate ?? null,
        paymentForm: prev.paymentForm ?? defaults.paymentForm ?? null,
        deliveryMethod: prev.deliveryMethod ?? defaults.deliveryMethod ?? null,
        invoiceRequested: !!defaults.invoiceRequested,
        currency: defaults.currency || DEFAULT_ORDER_CURRENCY,
        priceTypeGuid: priceType?.guid ?? null,
        priceTypeName: priceType?.name ?? null,
        items: prev.items.map((item) => {
          if (hasManualPrice(item)) return item;
          const priceTypeGuid = priceType?.guid ?? null;
          const priceTypeName = priceType?.name ?? null;
          return item.priceTypeGuid === priceTypeGuid && item.priceTypeName === priceTypeName
            ? item
            : { ...item, priceTypeGuid, priceTypeName };
        }),
      }, prev));
      setSelections((prev) => ({
        organization: overrides.organization ?? prev.organization,
        counterparty: defaults.counterparty
          ? {
              ...prev.counterparty,
              ...defaults.counterparty,
              hasDebt: defaults.counterparty.hasDebt ?? defaults.hasDebt ?? false,
              shipmentProhibited: defaults.counterparty.shipmentProhibited ?? defaults.shipmentProhibited ?? false,
              debtReason: defaults.counterparty.debtReason ?? defaults.debtReason ?? null,
            }
          : prev.counterparty,
        agreement,
        contract,
        warehouse,
        deliveryAddress: shouldApplyDeliveryAddress ? deliveryAddress : prev.deliveryAddress,
      }));
    } catch (e: any) {
      if (defaultsRequestIdRef.current !== requestId) return;
      if (isNetworkUnavailableError(e)) return;
      setError(userErrorMessage(e, 'Не удалось подставить значения по умолчанию.'));
    } finally {
      if (defaultsRequestIdRef.current === requestId) setLoadingDefaults(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  React.useEffect(() => {
    if (!filtersHydrated || !ordersCacheHydrated) return;
    ordersRequestIdRef.current += 1;
    setOrdersAppendError(null);
    setLoadingOrders(true);
  }, [filtersSignature, filtersHydrated, ordersCacheHydrated]);

  React.useEffect(() => {
    if (!filtersHydrated || !ordersCacheHydrated) return;
    const debounceMs = filters.search.trim() ? 650 : 120;
    const timer = setTimeout(() => {
      void loadOrders('reset');
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [filters, filtersHydrated, loadOrders, ordersCacheHydrated]);

  React.useEffect(() => {
    if (!filtersHydrated || !hasQueuedOrders || !ordersPollingEnabled) return undefined;
    const appIsActive = () => !AppState?.currentState || AppState.currentState === 'active';
    const timer = setInterval(() => {
      if (appIsActive()) void refreshQueueState();
    }, QUEUED_ORDERS_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [filtersHydrated, hasQueuedOrders, ordersPollingEnabled, refreshQueueState]);

  React.useEffect(() => {
    if (!filtersHydrated || !pendingInvoiceIdentifiers.length || !ordersPollingEnabled) return undefined;
    const appIsActive = () => !AppState?.currentState || AppState.currentState === 'active';
    if (appIsActive()) void refreshInvoiceStates();
    const timer = setInterval(() => {
      if (appIsActive()) void refreshInvoiceStates();
    }, PENDING_INVOICES_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [filtersHydrated, ordersPollingEnabled, pendingInvoiceIdentifiers, refreshInvoiceStates]);

  React.useEffect(() => {
    if (!todaySummaryHydrated || !ordersPollingEnabled) return undefined;
    const appIsActive = () => !AppState?.currentState || AppState.currentState === 'active';
    const refreshIfActive = () => {
      if (!appIsActive()) return;
      const currentDate = getOmskDateKey();
      if (currentDate !== todayDateKey) {
        setTodayDateKey(currentDate);
        return;
      }
      void refreshTodaySummary();
    };

    refreshIfActive();
    const timer = setInterval(refreshIfActive, TODAY_SUMMARY_REFRESH_INTERVAL_MS);
    const subscription = typeof AppState?.addEventListener === 'function'
      ? AppState.addEventListener('change', (state) => {
          if (state === 'active') refreshIfActive();
        })
      : null;
    return () => {
      clearInterval(timer);
      subscription?.remove();
    };
  }, [ordersPollingEnabled, refreshTodaySummary, todayDateKey, todaySummaryHydrated]);

  const refreshOrders = React.useCallback(() => {
    if (ordersPollingEnabled) void refreshTodaySummary();
    return loadOrders('reset');
  }, [loadOrders, ordersPollingEnabled, refreshTodaySummary]);
  const loadMoreOrders = React.useCallback(
    () => (hasMoreOrders && !ordersAppendLoadingRef.current ? loadOrders('append') : Promise.resolve()),
    [hasMoreOrders, loadOrders]
  );

  React.useEffect(() => {
    if (!filtersHydrated || !deviceDraftsHydrated) return;
    void syncDeviceDrafts();
  }, [deviceDraftsHydrated, filtersHydrated, syncDeviceDrafts]);

  React.useEffect(() => {
    const wasReachable = previousServerReachableRef.current;
    previousServerReachableRef.current = serverStatus.isReachable;
    if (!ordersPollingEnabled || !serverStatus.isReachable || wasReachable) return;

    // Resume durable writes only after a successful read proved that the API
    // is reachable. The PUT by clientOrderId remains idempotent.
    void syncDeviceDrafts({ force: true });
    void loadSettings();
    void refreshTodaySummary();
  }, [loadSettings, ordersPollingEnabled, refreshTodaySummary, serverStatus.isReachable, syncDeviceDrafts]);

  React.useEffect(() => {
    const connectionUnavailable = !!ordersError && isSharedNetworkUnavailableError(ordersError);
    if (
      !filtersHydrated
      || !ordersCacheHydrated
      || !ordersPollingEnabled
      || (serverStatus.isReachable && !connectionUnavailable)
    ) return undefined;

    const delays = [3_000, 10_000, 30_000, 60_000] as const;
    let cancelled = false;
    let attempt = 0;
    let retrying = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void retry(), delay);
    };
    const retry = async () => {
      if (cancelled || retrying || (AppState?.currentState && AppState.currentState !== 'active')) return;
      retrying = true;
      try {
        await loadOrders('reset', { silent: true });
      } finally {
        retrying = false;
      }
      if (cancelled || (getServerStatus().isReachable && !connectionUnavailable)) return;
      attempt = Math.min(attempt + 1, delays.length - 1);
      schedule(delays[attempt]);
    };

    schedule(delays[0]);
    const subscription = typeof AppState?.addEventListener === 'function'
      ? AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            attempt = 0;
            schedule(500);
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        })
      : null;
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription?.remove();
    };
  }, [filtersHydrated, loadOrders, ordersCacheHydrated, ordersError, ordersPollingEnabled, serverStatus.isReachable]);

  React.useEffect(() => {
    if (!selectedGuid) return;
    if (selectedOrder?.guid === selectedGuid) return;
    void loadDetail(selectedGuid);
  }, [loadDetail, selectedGuid, selectedOrder?.guid]);

  React.useEffect(() => {
    if (!invoicePollingEnabled || !selectedGuid || isDeviceDraftGuid(selectedGuid)) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (cancelled) return;
      if (!AppState?.currentState || AppState.currentState === 'active') await refreshSelectedOrderInvoices();
      if (!cancelled) timer = setTimeout(poll, OPEN_ORDER_INVOICES_REFRESH_INTERVAL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [invoicePollingEnabled, refreshSelectedOrderInvoices, selectedGuid]);

  const saveUserSettings = React.useCallback(async (payload: Parameters<typeof updateClientOrderSettings>[0]) => {
    setSavingSettings(true);
    try {
      const nextSettings = await updateClientOrderSettings(payload);
      setSettings(nextSettings);
      if (payload.preferredOrganizationGuid !== undefined) {
        const organization = nextSettings.organizations.find((item) => item.guid === payload.preferredOrganizationGuid) || null;
        setSelections((prev) => ({ ...prev, organization }));
      }
      return nextSettings;
    } catch (e: any) {
      setError(userErrorMessage(e, 'Не удалось обновить настройки.'));
      return null;
    } finally {
      setSavingSettings(false);
    }
  }, []);

  const saveDraft = React.useCallback(async (options?: SaveOptions) => {
    if (readOnly) return null;
    let payload: ClientOrderSavePayload | null = null;
    let stagedDeviceOrder: ClientOrder | null = null;
    const deviceEntry = findDeviceDraftEntry(draft.guid);
    try {
      setSaving(true);
      setAutosaveError(null);

      payload = buildPayload(draft, options?.reason || 'manual');
      const intent = options?.intent === 'SUBMIT' || deviceEntry?.intent === 'SUBMIT' ? 'SUBMIT' : 'SAVE';
      const clientOrderId = deviceEntry?.clientOrderId ?? draft.clientOrderId ?? null;
      const clientRevision = clientOrderId
        ? Math.max(
            0,
            draft.clientRevision || 0,
            deviceEntry?.clientRevision || 0,
            Number(selectedOrder?.clientRevision || 0)
          ) + 1
        : 0;
      const updateTargetGuid = deviceEntry?.serverGuid
        ?? (draft.guid && !isDeviceDraftGuid(draft.guid) && !deviceEntry ? draft.guid : null);
      const initialRevision = updateTargetGuid === deviceEntry?.serverGuid
        ? deviceEntry.serverRevision ?? draft.revision
        : draft.revision;
      const saveToApi = (revision: number) => {
        if (clientOrderId) {
          return putClientOrderByClientId(clientOrderId, payload, { clientRevision, intent });
        }
        return updateTargetGuid
          ? updateClientOrder(updateTargetGuid, { ...payload, revision })
          : createClientOrder(payload);
      };

      // Persist the exact operation before sending it. If the server commits but
      // the response is lost, every retry carries the same client identity.
      if (clientOrderId) {
        stagedDeviceOrder = saveDraftOnDevice(payload, null, { clientOrderId, clientRevision, intent });
        await writeStoredDeviceDrafts(deviceDraftsStorageKey, deviceDraftEntriesRef.current);
      }

      let order: ClientOrder;
      try {
        order = await saveToApi(initialRevision);
      } catch (e) {
        if (clientOrderId || !updateTargetGuid || !isRevisionConflictError(e)) {
          throw e;
        }

        const freshOrder = await getClientOrder(updateTargetGuid);
        applySavedOrderToList(freshOrder);
        mergeServerRevisionIntoOpenDraft(freshOrder);

        if (freshOrder.readOnly || freshOrder.hasRealization || freshOrder.status === 'CANCELLED') {
          throw e;
        }

        order = await saveToApi(freshOrder.revision);
      }

      removeDeviceDraftEntry(
        draft.guid || deviceEntry?.order.guid || deviceEntry?.serverGuid || stagedDeviceOrder?.guid
      );
      const savedDeliveryAddressGuid = order.deliveryAddress?.guid ?? null;
      const requestedDeliveryAddressGuid = payload.deliveryAddressGuid ?? null;
      const selectedDeliveryAddressForSave =
        requestedDeliveryAddressGuid && selections.deliveryAddress?.guid === requestedDeliveryAddressGuid
          ? selections.deliveryAddress
          : null;
      const preservedDeliveryAddress =
        requestedDeliveryAddressGuid && selectedDeliveryAddressForSave && savedDeliveryAddressGuid !== requestedDeliveryAddressGuid
          ? selectedDeliveryAddressForSave
          : null;
      selectedGuidRef.current = order.guid;
      documentStartedRef.current = true;
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      mergeSavedOrderIntoDraft(order, { preservedDeliveryAddressGuid: preservedDeliveryAddress?.guid ?? null });
      setDocumentStarted(true);
      setSelections({
        organization: order.organization || selections.organization,
        counterparty: order.counterparty || selections.counterparty,
        agreement: order.agreement || selections.agreement,
        contract: order.contract || selections.contract,
        warehouse: order.warehouse || selections.warehouse,
        deliveryAddress: preservedDeliveryAddress || order.deliveryAddress || selections.deliveryAddress,
      });
      setError(null);
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
      setAutosaveState('saved');
      applySavedOrderToList(order);
      return order;
    } catch (e: any) {
      if (payload && isNetworkUnavailableError(e)) {
        const localOrder = stagedDeviceOrder ?? saveDraftOnDevice(payload);
        applyOrderDetail(localOrder);
        setError(null);
        setDirty(false);
        setLastSavedAt(new Date().toISOString());
        setAutosaveState('saved');
        return localOrder;
      }
      if (stagedDeviceOrder) {
        removeDeviceDraftEntry(stagedDeviceOrder.guid);
      }
      const message = userErrorMessage(e, 'Не удалось сохранить заказ. Проверьте данные и повторите попытку.');
      setError(message);
      setAutosaveError(message);
      setAutosaveState('error');
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    applyOrderDetail,
    applySavedOrderToList,
    draft,
    findDeviceDraftEntry,
    mergeServerRevisionIntoOpenDraft,
    mergeSavedOrderIntoDraft,
    readOnly,
    removeDeviceDraftEntry,
    saveDraftOnDevice,
    selectedOrder?.clientRevision,
    selections,
    deviceDraftsStorageKey,
  ]);

  const saveAndResubmitQueuedDraft = React.useCallback(async () => {
    const saved = await saveDraft({ silent: true, reason: 'manual' });
    if (!saved) return false;
    if (!selectedOrderQueued && !selectedOrderSynced) return true;
    if ((saved as any).origin === 'device' || findDeviceDraftEntry(saved.guid)) return true;
    try {
      setSubmitting(true);
      let order: ClientOrder;
      try {
        order = await submitClientOrder(saved.guid, saved.revision);
      } catch (e) {
        if (!isRevisionConflictError(e)) {
          throw e;
        }
        const freshOrder = await getClientOrder(saved.guid);
        applySavedOrderToList(freshOrder);
        mergeServerRevisionIntoOpenDraft(freshOrder);
        if (freshOrder.readOnly || freshOrder.hasRealization || freshOrder.status === 'CANCELLED') {
          throw e;
        }
        order = await submitClientOrder(saved.guid, freshOrder.revision);
      }
      applySavedOrderToList(order);
      applyOrderDetail(order);
      void loadOrders('reset');
      setError(null);
      return true;
    } catch (e: any) {
      const message = isNetworkUnavailableError(e)
        ? 'Не удалось переотправить заказ: нет связи или сервер не ответил. Документ сохранен, повторите отправку позже.'
        : userErrorMessage(e, 'Не удалось переотправить заказ.');
      setError(message);
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [applyOrderDetail, applySavedOrderToList, findDeviceDraftEntry, loadOrders, mergeServerRevisionIntoOpenDraft, saveDraft, selectedOrderQueued, selectedOrderSynced]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || readOnly) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, readOnly]);

  const confirmDiscardIfNeeded = React.useCallback(async () => {
    if (!dirty || readOnly) return true;
    let decision: DiscardDecision;
    if (confirmDiscard) {
      const result = await confirmDiscard({
        draftMode,
        hasPersistedDraft: !!draft.guid,
        blockingMessage: validation.blockingMessage,
      });
      decision = typeof result === 'boolean' ? (result ? 'discard' : 'cancel') : result;
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      decision = window.confirm('Выйти из документа? Несохраненные изменения будут потеряны.') ? 'discard' : 'cancel';
    } else {
      decision = await new Promise<DiscardDecision>((resolve) => {
        Alert.alert('Выйти из документа?', 'Несохраненные изменения будут потеряны.', [
          { text: 'Остаться', style: 'cancel', onPress: () => resolve('cancel') },
          { text: 'Выйти', style: 'destructive', onPress: () => resolve('discard') },
        ]);
      });
    }
    if (decision === 'cancel') return false;
    if (decision === 'save') {
      return selectedOrderQueued || selectedOrderSynced
        ? saveAndResubmitQueuedDraft()
        : !!(await saveDraft({ reason: 'manual' }));
    }
    if (selectedOrder) {
      const nextDraft = normalizeDraftOrder(orderToDraft(selectedOrder));
      contextRefreshSignatureRef.current = buildPricingContextSignature(nextDraft);
      setDraft(nextDraft);
      setSelections({
        organization: selectedOrder.organization || null,
        counterparty: selectedOrder.counterparty || null,
        agreement: selectedOrder.agreement || null,
        contract: selectedOrder.contract || null,
        warehouse: selectedOrder.warehouse || null,
        deliveryAddress: selectedOrder.deliveryAddress || null,
      });
      setDirty(false);
      setError(null);
    } else {
      resetDraftToBase();
    }
    return true;
  }, [confirmDiscard, dirty, draft.guid, draftMode, readOnly, resetDraftToBase, saveAndResubmitQueuedDraft, saveDraft, selectedOrder, selectedOrderQueued, selectedOrderSynced, validation.blockingMessage]);

  const selectOrder = React.useCallback(async (guid: string) => {
    if (guid === selectedGuid && selectedOrder?.guid === guid) return true;
    const canContinue = await confirmDiscardIfNeeded();
    if (!canContinue) return false;
    selectedGuidRef.current = guid;
    const order = await loadDetail(guid);
    if (!order) {
      selectedGuidRef.current = selectedGuid;
      return false;
    }
    return true;
  }, [confirmDiscardIfNeeded, loadDetail, selectedGuid, selectedOrder?.guid]);

  const createNewOrder = React.useCallback(async () => {
    const canContinue = await confirmDiscardIfNeeded();
    if (!canContinue) return false;
    resetDraftToBase();
    setDocumentStarted(true);
    return true;
  }, [confirmDiscardIfNeeded, resetDraftToBase]);

  const resetPairDependentDraft = React.useCallback((patch: Partial<DraftOrder>) => {
    enumOptionsRequestIdRef.current += 1;
    patchDraft((prev) => ({
      ...prev,
      ...patch,
      agreementGuid: '',
      contractGuid: '',
      warehouseGuid: '',
      deliveryAddressGuid: '',
      priceTypeGuid: null,
      priceTypeName: null,
      paymentForm: null,
      deliveryMethod: null,
      invoiceRequested: false,
      items: prev.items.map((item) => (
        hasManualPrice(item)
          ? item
          : { ...item, priceTypeGuid: null, priceTypeName: null, basePrice: null }
      )),
    }));
    setSelections((prev) => ({
      ...prev,
      agreement: null,
      contract: null,
      warehouse: null,
      deliveryAddress: null,
    }));
    setPaymentFormOptions([]);
    setDeliveryMethodOptions([]);
  }, [patchDraft]);

  const resolveEntityOrganization = React.useCallback((
    entity?: { organizationGuid?: string | null; organization?: ClientOrderOrganization | null } | null
  ): ClientOrderOrganization | null => {
    const guid = entity?.organization?.guid || entity?.organizationGuid || '';
    if (!guid) return null;
    return (
      settingsRef.current?.organizations?.find((item) => item.guid === guid) ||
      (entity?.organization?.name
        ? {
            guid,
            name: entity.organization.name,
            code: entity.organization.code ?? null,
            isActive: entity.organization.isActive ?? true,
          }
        : { guid, name: guid, code: null, isActive: true })
    );
  }, []);

  const setOrganization = React.useCallback(async (organization: ClientOrderOrganization | null) => {
    const counterpartyGuid = draft.counterpartyGuid;
    resetPairDependentDraft({ organizationGuid: organization?.guid || '' });
    setSelections((prev) => ({ ...prev, organization }));
    void saveUserSettings({ preferredOrganizationGuid: organization?.guid || null });
    if (organization?.guid && counterpartyGuid) {
      await applyResolvedDefaults(organization.guid, counterpartyGuid);
    }
  }, [applyResolvedDefaults, draft.counterpartyGuid, resetPairDependentDraft, saveUserSettings]);

  const setCounterparty = React.useCallback(async (counterparty: ClientOrderCounterpartyOption | null) => {
    resetPairDependentDraft({ counterpartyGuid: counterparty?.guid || '' });
    setSelections((prev) => ({
      ...prev,
      counterparty,
    }));
    if (counterparty?.guid && draft.organizationGuid) {
      await applyResolvedDefaults(draft.organizationGuid, counterparty.guid);
    }
  }, [applyResolvedDefaults, draft.organizationGuid, resetPairDependentDraft]);

  const searchCounterparties = React.useCallback((params?: Parameters<typeof searchClientOrderCounterparties>[0]) => (
    searchClientOrderCounterparties({
      ...(params || {}),
      organizationGuid: params?.organizationGuid || draft.organizationGuid || undefined,
    })
  ), [draft.organizationGuid]);

  const setAgreement = React.useCallback(async (agreement: ClientOrderAgreementOption | null) => {
    const organization = resolveEntityOrganization(agreement);
    const organizationGuid = organization?.guid || agreement?.organizationGuid || draft.organizationGuid;
    if (agreement && organizationGuid && draft.counterpartyGuid) {
      await applyResolvedDefaults(organizationGuid, draft.counterpartyGuid, { organization, agreement });
      return;
    }

    patchDraft((prev) => ({
      ...prev,
      agreementGuid: agreement?.guid || '',
      contractGuid: agreement?.contract?.guid || prev.contractGuid,
      warehouseGuid: agreement?.warehouse?.guid || prev.warehouseGuid,
      priceTypeGuid: agreement?.priceType?.guid || prev.priceTypeGuid || null,
      priceTypeName: agreement?.priceType?.name || prev.priceTypeName || null,
      items: prev.items.map((item) => ({
        ...item,
        priceTypeGuid: agreement?.priceType?.guid || item.priceTypeGuid || null,
        priceTypeName: agreement?.priceType?.name || item.priceTypeName || null,
      })),
    }));
    setSelections((prev) => ({
      ...prev,
      organization: organization ?? prev.organization,
      agreement,
      contract: agreement?.contract || prev.contract,
      warehouse: agreement?.warehouse || prev.warehouse,
    }));
  }, [applyResolvedDefaults, draft.counterpartyGuid, draft.organizationGuid, patchDraft, resolveEntityOrganization]);

  const setContract = React.useCallback(async (contract: ClientOrderContractOption | null) => {
    const organization = resolveEntityOrganization(contract);
    const organizationGuid = organization?.guid || contract?.organizationGuid || draft.organizationGuid;
    if (contract && organizationGuid && draft.counterpartyGuid) {
      await applyResolvedDefaults(organizationGuid, draft.counterpartyGuid, { organization, contract });
      return;
    }

    patchDraft({ contractGuid: contract?.guid || '' });
    setSelections((prev) => ({ ...prev, organization: organization ?? prev.organization, contract }));
  }, [applyResolvedDefaults, draft.counterpartyGuid, draft.organizationGuid, patchDraft, resolveEntityOrganization]);

  const setWarehouse = React.useCallback((warehouse: ClientOrderWarehouseOption | null) => {
    patchDraft({ warehouseGuid: warehouse?.guid || '' });
    setSelections((prev) => ({ ...prev, warehouse }));
  }, [patchDraft]);

  const setDeliveryAddress = React.useCallback((deliveryAddress: ClientOrderDeliveryAddressOption | null) => {
    deliveryAddressManualVersionRef.current += 1;
    patchDraft({ deliveryAddressGuid: deliveryAddress?.guid || '' });
    setSelections((prev) => ({ ...prev, deliveryAddress }));
  }, [patchDraft]);

  const refreshItemPricing = React.useCallback(async (item: DraftItem, priceType: ClientOrderPriceTypeOption | null) => {
    if (!draft.counterpartyGuid) return;
    try {
      const products = await getClientOrderProductsBatch({
        productGuids: [item.productGuid],
        organizationGuid: draft.organizationGuid || undefined,
        counterpartyGuid: draft.counterpartyGuid,
        agreementGuid: draft.agreementGuid || undefined,
        warehouseGuid: draft.warehouseGuid || undefined,
        priceTypeGuid: priceType?.guid || undefined,
      });
      const product = products.find((next) => next.guid === item.productGuid);
      if (!product) return;
      const isManualPrice = hasManualPrice(item);
      const packages = mergeDraftPackagesForProduct(product, item.packages, item.baseUnit);
      const hasProductPackages = Array.isArray(product.packages);
      setItemPatch(item.key, {
        packageGuid: normalizePackageGuid(item.packageGuid, packages),
        basePrice: isManualPrice ? item.basePrice ?? product.basePrice ?? null : product.basePrice ?? null,
        receiptPrice: product.receiptPrice ?? item.receiptPrice ?? null,
        currency: DEFAULT_ORDER_CURRENCY,
        priceTypeGuid: isManualPrice ? item.priceTypeGuid ?? null : priceType?.guid ?? product.priceType?.guid ?? null,
        priceTypeName: isManualPrice ? item.priceTypeName ?? null : priceType?.name ?? product.priceType?.name ?? null,
        baseUnit: product.baseUnit ?? item.baseUnit ?? null,
        productWeight: product.weight ?? item.productWeight ?? null,
        weightUnit: product.weightUnit ?? item.weightUnit ?? null,
        stock: product.stock ?? item.stock ?? null,
        packages: hasProductPackages ? packages : item.packages,
        packagesLoaded: hasProductPackages ? true : item.packagesLoaded,
        imageThumbUrl: product.imageThumbUrl ?? item.imageThumbUrl ?? null,
        imagePreviewUrl: product.imagePreviewUrl ?? item.imagePreviewUrl ?? null,
        imageHash: product.imageHash ?? item.imageHash ?? null,
        images: product.images ?? item.images ?? [],
      });
    } catch {
      const isManualPrice = hasManualPrice(item);
      setItemPatch(item.key, {
        priceTypeGuid: isManualPrice ? item.priceTypeGuid ?? null : priceType?.guid || null,
        priceTypeName: isManualPrice ? item.priceTypeName ?? null : priceType?.name || null,
        basePrice: isManualPrice ? item.basePrice : null,
      });
    }
  }, [draft.agreementGuid, draft.counterpartyGuid, draft.organizationGuid, draft.warehouseGuid, setItemPatch]);

  const refreshItemsPricing = React.useCallback(async (
    items: DraftItem[],
    options?: { priceType?: ClientOrderPriceTypeOption | null; forceAutomaticPrice?: boolean }
  ) => {
    if (!draft.counterpartyGuid || !items.length) return;
    const requestId = ++pricingRequestIdRef.current;
    const hasPriceTypeOverride = !!options && Object.prototype.hasOwnProperty.call(options, 'priceType');
    const targetPriceTypeGuid = hasPriceTypeOverride
      ? options?.priceType?.guid || undefined
      : draft.priceTypeGuid || undefined;
    const targetPriceTypeName = hasPriceTypeOverride
      ? options?.priceType?.name || null
      : draft.priceTypeName || null;
    try {
      const products = await getClientOrderProductsBatch({
        productGuids: items.map((item) => item.productGuid),
        organizationGuid: draft.organizationGuid || undefined,
        counterpartyGuid: draft.counterpartyGuid,
        agreementGuid: draft.agreementGuid || undefined,
        warehouseGuid: draft.warehouseGuid || undefined,
        priceTypeGuid: targetPriceTypeGuid,
      });
      if (pricingRequestIdRef.current !== requestId) return;
      const productByGuid = new Map(products.map((product) => [product.guid, product]));
      setDraft((prev) => normalizeDraftOrder({
        ...prev,
        items: prev.items.map((item) => {
          const product = productByGuid.get(item.productGuid);
          if (!product) return item;
          const isManualPrice = options?.forceAutomaticPrice ? false : hasManualPrice(item);
          const packages = mergeDraftPackagesForProduct(product, item.packages, item.baseUnit);
          const hasProductPackages = Array.isArray(product.packages);
          return {
            ...item,
            packageGuid: normalizePackageGuid(item.packageGuid, packages),
            basePrice: isManualPrice ? item.basePrice : product.basePrice ?? null,
            receiptPrice: product.receiptPrice ?? item.receiptPrice ?? null,
            currency: DEFAULT_ORDER_CURRENCY,
            priceTypeGuid: isManualPrice
              ? item.priceTypeGuid ?? null
              : targetPriceTypeGuid ?? product.priceType?.guid ?? null,
            priceTypeName: isManualPrice
              ? item.priceTypeName ?? null
              : targetPriceTypeName ?? product.priceType?.name ?? null,
            baseUnit: product.baseUnit ?? item.baseUnit ?? null,
            productWeight: product.weight ?? item.productWeight ?? null,
            weightUnit: product.weightUnit ?? item.weightUnit ?? null,
            stock: product.stock ?? null,
            packages: hasProductPackages ? packages : item.packages,
            packagesLoaded: hasProductPackages ? true : item.packagesLoaded,
            imageThumbUrl: product.imageThumbUrl ?? item.imageThumbUrl ?? null,
            imagePreviewUrl: product.imagePreviewUrl ?? item.imagePreviewUrl ?? null,
            imageHash: product.imageHash ?? item.imageHash ?? null,
            images: product.images ?? item.images ?? [],
          };
        }),
      }, prev));
    } catch {
      if (pricingRequestIdRef.current !== requestId) return;
      setDraft((prev) => normalizeDraftOrder({
        ...prev,
        items: prev.items.map((item) => hasManualPrice(item)
          ? item
          : { ...item, basePrice: null }),
      }, prev));
    }
  }, [
    draft.agreementGuid,
    draft.counterpartyGuid,
    draft.organizationGuid,
    draft.priceTypeGuid,
    draft.priceTypeName,
    draft.warehouseGuid,
  ]);

  React.useEffect(() => {
    if (!draft.organizationGuid || !draft.counterpartyGuid || !draft.items.length) {
      contextRefreshSignatureRef.current = '';
      return;
    }

    const refreshSignature = buildPricingContextSignature(draft);

    if (contextRefreshSignatureRef.current === refreshSignature) {
      return;
    }
    contextRefreshSignatureRef.current = refreshSignature;

    const timer = setTimeout(() => {
      void refreshItemsPricing(draft.items);
    }, 180);
    return () => clearTimeout(timer);
  }, [draft.agreementGuid, draft.counterpartyGuid, draft.organizationGuid, draft.priceTypeGuid, draft.warehouseGuid, refreshItemsPricing]);

  const documentHeaderDefaultsState = React.useMemo(() => ({
    organization: selections.organization ? 'из настроек пользователя' : 'не найдено значение по умолчанию',
    counterparty: selections.counterparty ? 'выбрано вручную' : 'выберите контрагента',
    agreement: selections.agreement ? 'по умолчанию' : 'не найдено значение по умолчанию',
    contract: selections.contract ? 'по умолчанию' : 'не найдено значение по умолчанию',
    warehouse: selections.warehouse ? 'из соглашения / по умолчанию' : 'не найдено значение по умолчанию',
    deliveryAddress: selections.deliveryAddress ? 'по умолчанию' : 'не найдено значение по умолчанию',
    deliveryDate: draft.deliveryDate ? 'из настроек пользователя' : 'не найдено значение по умолчанию',
  }), [draft.deliveryDate, selections]);

  const documentHeaderLoadingState = React.useMemo(() => ({
    organization: false,
    counterparty: false,
    agreement: loadingDefaults,
    contract: loadingDefaults,
    priceType: loadingDefaults,
    warehouse: loadingDefaults,
    deliveryAddress: loadingDefaults,
    deliveryDate: loadingDefaults,
  }), [loadingDefaults]);

  const addProduct = React.useCallback((product: ClientOrderProduct, options?: { quantity?: string | number }) => {
    const existing = draft.items.find((item) => item.productGuid === product.guid);
    if (existing) return existing.key;
    const nextItem = buildNewItem(product, options);
    patchDraft((prev) => {
      if (prev.items.some((item) => item.productGuid === product.guid)) return prev;
      return { ...prev, items: [...prev.items, nextItem] };
    });
    return nextItem.key;
  }, [draft.items, patchDraft]);

  const addDraftItem = React.useCallback((draftItem: DraftItem) => {
    const existing = draft.items.find((item) => item.productGuid === draftItem.productGuid);
    if (existing) return existing.key;
    patchDraft((prev) => {
      if (prev.items.some((item) => item.productGuid === draftItem.productGuid)) return prev;
      return { ...prev, items: [...prev.items, draftItem] };
    });
    return draftItem.key;
  }, [draft.items, patchDraft]);

  const setItemPriceType = React.useCallback((lineKey: string, priceType: ClientOrderPriceTypeOption | null) => {
    const target = draft.items.find((item) => item.key === lineKey);
    patchDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (
        item.key === lineKey
          ? {
              ...item,
              priceTypeGuid: priceType?.guid || null,
              priceTypeName: priceType?.name || null,
              manualPrice: '',
              basePrice: null,
            }
          : item
      )),
    }));
    if (target) {
      void refreshItemPricing({ ...target, manualPrice: '' }, priceType);
    }
  }, [draft.items, patchDraft, refreshItemPricing]);

  const defaultHeaderPriceType = React.useMemo(() => selections.agreement?.priceType ?? null, [selections.agreement?.priceType]);

  const defaultLinePriceType = React.useMemo(() => (
    draft.priceTypeGuid
      ? { guid: draft.priceTypeGuid, name: draft.priceTypeName || selections.agreement?.priceType?.name || 'Вид цены' }
      : defaultHeaderPriceType
  ), [defaultHeaderPriceType, draft.priceTypeGuid, draft.priceTypeName, selections.agreement?.priceType?.name]);

  const setItemPackage = React.useCallback((lineKey: string, packageGuid: string | null) => {
    const target = draft.items.find((item) => item.key === lineKey);
    if (!target) return;
    const nextPackageGuid = packageGuid || null;
    const priceType = target.priceTypeGuid && target.priceTypeName
      ? { guid: target.priceTypeGuid, name: target.priceTypeName }
      : defaultLinePriceType;
    patchDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (
        item.key === lineKey
          ? {
              ...item,
              packageGuid: nextPackageGuid,
              manualPrice: '',
              priceTypeGuid: priceType?.guid || null,
              priceTypeName: priceType?.name || null,
            }
          : item
      )),
    }));
    void refreshItemPricing(
      {
        ...target,
        packageGuid: nextPackageGuid,
        manualPrice: '',
        priceTypeGuid: priceType?.guid || null,
        priceTypeName: priceType?.name || null,
      },
      priceType
    );
  }, [defaultLinePriceType, draft.items, patchDraft, refreshItemPricing]);

  const isHeaderPriceTypeCustom = React.useMemo(() => {
    const defaultGuid = defaultHeaderPriceType?.guid || null;
    const currentGuid = draft.priceTypeGuid || null;
    return currentGuid !== defaultGuid;
  }, [defaultHeaderPriceType?.guid, draft.priceTypeGuid]);

  const isItemPriceTypeCustom = React.useCallback((lineKey: string) => {
    const item = draft.items.find((next) => next.key === lineKey);
    if (!item) return false;
    if (hasManualPrice(item)) return true;
    const defaultGuid = defaultLinePriceType?.guid || null;
    if (!item.priceTypeGuid) return false;
    return item.priceTypeGuid !== defaultGuid;
  }, [defaultLinePriceType?.guid, draft.items]);

  const resetItemPriceType = React.useCallback((lineKey: string) => {
    const target = draft.items.find((item) => item.key === lineKey);
    patchDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => (
        item.key === lineKey
          ? {
              ...item,
              manualPrice: '',
              priceTypeGuid: defaultLinePriceType?.guid || null,
              priceTypeName: defaultLinePriceType?.name || null,
              basePrice: null,
            }
          : item
      )),
    }));
    if (target) {
      void refreshItemPricing({ ...target, manualPrice: '' }, defaultLinePriceType);
    }
  }, [defaultLinePriceType, draft.items, patchDraft, refreshItemPricing]);

  const setHeaderPriceType = React.useCallback((priceType: ClientOrderPriceTypeOption | null) => {
    const refreshTargets = draft.items.filter((item) => !hasManualPrice(item));
    contextRefreshSignatureRef.current = draft.organizationGuid && draft.counterpartyGuid && draft.items.length
      ? [draft.organizationGuid, draft.counterpartyGuid, draft.agreementGuid || '', draft.warehouseGuid || '', priceType?.guid || ''].join('||')
      : '';
    patchDraft((prev) => ({
      ...prev,
      priceTypeGuid: priceType?.guid || null,
      priceTypeName: priceType?.name || null,
      items: prev.items.map((item) => hasManualPrice(item)
        ? { ...item, priceTypeGuid: null, priceTypeName: 'Произвольный' }
        : {
            ...item,
            priceTypeGuid: priceType?.guid || null,
            priceTypeName: priceType?.name || null,
            basePrice: null,
          }),
    }));
    void refreshItemsPricing(refreshTargets, { priceType });
  }, [draft.agreementGuid, draft.counterpartyGuid, draft.items, draft.organizationGuid, draft.warehouseGuid, patchDraft, refreshItemsPricing]);

  const resetHeaderPriceTypeToDefault = React.useCallback(() => {
    const priceType = defaultHeaderPriceType;
    const refreshTargets = draft.items;
    contextRefreshSignatureRef.current = draft.organizationGuid && draft.counterpartyGuid && draft.items.length
      ? [draft.organizationGuid, draft.counterpartyGuid, draft.agreementGuid || '', draft.warehouseGuid || '', priceType?.guid || ''].join('||')
      : '';
    patchDraft((prev) => ({
      ...prev,
      priceTypeGuid: priceType?.guid || null,
      priceTypeName: priceType?.name || null,
      items: prev.items.map((item) => ({
        ...item,
        manualPrice: '',
        priceTypeGuid: priceType?.guid || null,
        priceTypeName: priceType?.name || null,
        basePrice: null,
      })),
    }));
    void refreshItemsPricing(refreshTargets, { priceType, forceAutomaticPrice: true });
  }, [defaultHeaderPriceType, draft.agreementGuid, draft.counterpartyGuid, draft.items, draft.organizationGuid, draft.warehouseGuid, patchDraft, refreshItemsPricing]);

  const refreshAll = React.useCallback(async () => {
    setRefreshing(true);
    if (ordersPollingEnabled) void refreshTodaySummary();
    await Promise.all([
      loadSettings(),
      loadOrders('reset'),
      selectedGuid && !dirtyRef.current ? loadDetail(selectedGuid) : Promise.resolve(null),
    ]);
    setRefreshing(false);
  }, [loadDetail, loadOrders, loadSettings, ordersPollingEnabled, refreshTodaySummary, selectedGuid]);

  const submitOrder = React.useCallback(async () => {
    if (!canSubmitOrder) {
      const message = selectedOrderQueued && !dirty
        ? 'Нет изменений для повторной отправки.'
        : validation.blockingMessage || 'Исправьте ошибки в строках заказа.';
      setError(message);
      return;
    }
    if (draft.clientOrderId) {
      try {
        setSubmitting(true);
        const saved = await saveDraft({ silent: true, reason: 'manual', intent: 'SUBMIT' });
        if (saved && saved.origin !== 'device') {
          applySavedOrderToList(saved);
          applyOrderDetail(saved);
          void loadOrders('reset', { silent: true });
        }
        setError(null);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    let targetGuid = draft.guid || selectedGuid;
    let revision = draft.revision;
    const deviceEntry = findDeviceDraftEntry(targetGuid);
    if (!targetGuid || dirty || deviceEntry) {
      const saved = await saveDraft({ silent: true, reason: 'manual' });
      if (!saved) return;
      if (saved.origin === 'device' || findDeviceDraftEntry(saved.guid)) {
        setError(null);
        return;
      }
      targetGuid = saved.guid;
      revision = saved.revision;
    }
    try {
      setSubmitting(true);
      let order: ClientOrder;
      try {
        order = await submitClientOrder(targetGuid, revision);
      } catch (e) {
        if (!isRevisionConflictError(e)) {
          throw e;
        }
        const freshOrder = await getClientOrder(targetGuid);
        applySavedOrderToList(freshOrder);
        mergeServerRevisionIntoOpenDraft(freshOrder);
        if (freshOrder.readOnly || freshOrder.hasRealization || freshOrder.status === 'CANCELLED') {
          throw e;
        }
        order = await submitClientOrder(targetGuid, freshOrder.revision);
      }
      applySavedOrderToList(order);
      applyOrderDetail(order);
      void loadOrders('reset');
    } catch (e: any) {
      const message = isNetworkUnavailableError(e)
        ? 'Не удалось отправить заказ: нет связи или сервер не ответил. Документ сохранен, повторите отправку позже.'
        : userErrorMessage(e, 'Не удалось отправить заказ.');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [applyOrderDetail, applySavedOrderToList, canSubmitOrder, dirty, draft.clientOrderId, draft.guid, draft.revision, findDeviceDraftEntry, loadOrders, mergeServerRevisionIntoOpenDraft, saveDraft, selectedGuid, selectedOrderQueued, validation.blockingMessage]);

  const submitOrderFromList = React.useCallback(async (target: ClientOrder) => {
    if (!target?.guid || submitting) return null;
    let targetGuid = target.guid;
    let targetRevision = target.revision;

    try {
      setSubmitting(true);
      setOrdersError(null);

      const deviceEntry = findDeviceDraftEntry(target.guid);
      if (deviceEntry) {
        let saved: ClientOrder;
        if (deviceEntry.clientOrderId.startsWith('legacy-server:')) {
          const persisted = deviceEntry.serverGuid
            ? await updateClientOrder(deviceEntry.serverGuid, {
                ...deviceEntry.payload,
                revision: deviceEntry.serverRevision ?? deviceEntry.order.revision,
              })
            : await createClientOrder(deviceEntry.payload);
          saved = await submitClientOrder(persisted.guid, persisted.revision);
        } else {
          saved = await putClientOrderByClientId(
            deviceEntry.clientOrderId,
            deviceEntry.payload,
            { clientRevision: deviceEntry.clientRevision, intent: 'SUBMIT' }
          );
        }
        replaceDeviceDraftEntries(
          deviceDraftEntriesRef.current.filter((entry) => entry.id !== deviceEntry.id)
        );
        applySavedOrderToList(saved);
        void loadOrders('reset', { silent: true });
        return saved;
      }

      let submitted: ClientOrder;
      try {
        submitted = await submitClientOrder(targetGuid, targetRevision);
      } catch (error) {
        if (!isRevisionConflictError(error)) throw error;
        const freshOrder = await getClientOrder(targetGuid);
        applySavedOrderToList(freshOrder);
        if (freshOrder.readOnly || freshOrder.hasRealization || freshOrder.status === 'CANCELLED') {
          throw error;
        }
        submitted = await submitClientOrder(targetGuid, freshOrder.revision);
      }

      applySavedOrderToList(submitted);
      void loadOrders('reset', { silent: true });
      return submitted;
    } catch (error: any) {
      setOrdersError(userErrorMessage(error, 'Не удалось отправить заказ в 1С. Проверьте данные и повторите попытку.'));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [applySavedOrderToList, findDeviceDraftEntry, loadOrders, replaceDeviceDraftEntries, submitting]);

  const unqueueOrder = React.useCallback(async (target?: { guid: string; revision: number }) => {
    let targetGuid = target?.guid || draft.guid || selectedGuid;
    let revision = target?.revision ?? draft.revision;
    if (!targetGuid) return null;
    if (!target && dirty) {
      const saved = await saveDraft({ silent: true, reason: 'manual' });
      if (!saved || isDeviceDraftGuid(saved.guid)) return null;
      targetGuid = saved.guid;
      revision = saved.revision;
    }
    try {
      setCancelling(true);
      const order = await unqueueClientOrder(targetGuid, revision);
      applySavedOrderToList(order);
      if (!target || target.guid === selectedGuid) {
        applyOrderDetail(order);
        setDirty(false);
      }
      setError(null);
      return order;
    } catch (e: any) {
      setError(userErrorMessage(e, 'Не удалось снять заказ с очереди.'));
      return null;
    } finally {
      setCancelling(false);
    }
  }, [applyOrderDetail, applySavedOrderToList, dirty, draft.guid, draft.revision, saveDraft, selectedGuid]);

  const restoreOrder = React.useCallback(async (target?: { guid: string; revision: number }) => {
    const targetGuid = target?.guid || draft.guid || selectedGuid;
    const revision = target?.revision ?? draft.revision;
    if (!targetGuid) return null;
    try {
      setCancelling(true);
      const order = await restoreClientOrder(targetGuid, revision);
      applySavedOrderToList(order);
      if (!target || target.guid === selectedGuid) {
        applyOrderDetail(order);
        setDirty(false);
      }
      setError(null);
      return order;
    } catch (e: any) {
      setError(userErrorMessage(e, 'Не удалось восстановить заказ клиента.'));
      return null;
    } finally {
      setCancelling(false);
    }
  }, [applyOrderDetail, applySavedOrderToList, draft.guid, draft.revision, selectedGuid]);

  const copyOrder = React.useCallback(async (_options?: { saveFirst?: boolean }) => {
    const targetGuid = draft.guid || selectedGuid;
    if (!targetGuid || dirty || isDeviceDraftGuid(targetGuid) || !!findDeviceDraftEntry(targetGuid)) {
      return createDeviceCopyFromCurrentDraft();
    }
    try {
      setCopying(true);
      const order = await copyClientOrder(targetGuid, draft.revision);
      applySavedOrderToList(order);
      applyOrderDetail(order, { refreshCommercialData: true });
      setError(null);
      return order;
    } catch {
      // Copying must remain available offline and when the source contains data
      // that the API/1C can no longer validate. Keep it as an editable device draft.
      return createDeviceCopyFromCurrentDraft();
    } finally {
      setCopying(false);
    }
  }, [applyOrderDetail, applySavedOrderToList, createDeviceCopyFromCurrentDraft, dirty, draft.guid, draft.revision, findDeviceDraftEntry, selectedGuid]);

  const copyOrderFromList = React.useCallback(async (target: ClientOrder) => {
    if (!target?.guid || copying) return null;
    try {
      setCopying(true);
      setOrdersError(null);

      const deviceEntry = findDeviceDraftEntry(target.guid);
      if (deviceEntry) {
        const nowIso = new Date().toISOString();
        const localGuid = makeDeviceDraftGuid();
        const sourceDraft = normalizeDraftOrder(orderToDraft(deviceEntry.order));
        const copiedDraft = normalizeDraftOrder({
          ...sourceDraft,
          guid: localGuid,
          clientOrderId: makeClientOrderId(),
          clientRevision: 1,
          revision: 1,
          items: sourceDraft.items.map((item) => {
            const keepsManualPrice = hasManualPrice(item);
            return {
              ...item,
              key: makeKey(),
              lineGuid: makeLineGuid(),
              basePrice: keepsManualPrice ? item.basePrice : null,
              priceSource: keepsManualPrice ? item.priceSource : null,
              isCancelled: false,
              cancelReasonGuid: null,
              cancelReasonName: null,
              cancelReason: null,
              cancelledAmount: null,
            };
          }),
        });
        const sourceSelections: DraftSelections = {
          organization: deviceEntry.order.organization || null,
          counterparty: deviceEntry.order.counterparty || null,
          agreement: deviceEntry.order.agreement || null,
          contract: deviceEntry.order.contract || null,
          warehouse: deviceEntry.order.warehouse || null,
          deliveryAddress: deviceEntry.order.deliveryAddress || null,
        };
        const copiedOrder = buildDeviceOrderFromDraft({
          draft: copiedDraft,
          selections: sourceSelections,
          guid: localGuid,
          revision: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
          lastSyncError: null,
        });
        const copiedEntry: DeviceDraftEntry = {
          id: makeDeviceDraftGuid(),
          clientOrderId: copiedDraft.clientOrderId!,
          clientRevision: copiedDraft.clientRevision,
          intent: 'SAVE',
          serverGuid: null,
          serverRevision: null,
          order: copiedOrder,
          payload: buildCopyPayload(copiedDraft),
          createdAt: nowIso,
          updatedAt: nowIso,
          lastSyncError: null,
          syncAttempts: 0,
          nextSyncAt: null,
        };
        replaceDeviceDraftEntries([copiedEntry, ...deviceDraftEntriesRef.current]);
        applySavedOrderToList(copiedOrder);
        return copiedOrder;
      }

      let copied: ClientOrder;
      try {
        copied = await copyClientOrder(target.guid, target.revision);
      } catch (error) {
        if (!isRevisionConflictError(error)) throw error;
        const freshOrder = await getClientOrder(target.guid);
        copied = await copyClientOrder(freshOrder.guid, freshOrder.revision);
      }
      applySavedOrderToList(copied);
      return copied;
    } catch (error: any) {
      setOrdersError(userErrorMessage(error, 'Не удалось скопировать заказ.'));
      return null;
    } finally {
      setCopying(false);
    }
  }, [applySavedOrderToList, copying, findDeviceDraftEntry, replaceDeviceDraftEntries]);

  const runCancel = React.useCallback(async (target?: { guid: string; revision: number }) => {
    const targetGuid = target?.guid || draft.guid;
    const targetRevision = target?.revision ?? draft.revision;
    if (!targetGuid) {
      resetDraftToBase();
      return;
    }
    try {
      setCancelling(true);
      const order = await cancelClientOrder(targetGuid, targetRevision, 'Отменено менеджером из приложения');
      applySavedOrderToList(order);
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      setDraft(normalizeDraftOrder(orderToDraft(order)));
      setDirty(false);
    } catch (e: any) {
      setError(userErrorMessage(e, 'Не удалось отменить заказ.'));
    } finally {
      setCancelling(false);
    }
  }, [applySavedOrderToList, draft.guid, draft.revision, resetDraftToBase]);

  const deleteDraft = React.useCallback(async (guid?: string) => {
    const targetGuid = guid || draft.guid || selectedGuid;
    if (!targetGuid) {
      resetDraftToBase();
      return;
    }

    const deviceEntry = findDeviceDraftEntry(targetGuid);
    if (deviceEntry) {
      removeDeviceDraftEntry(targetGuid);
      const deletingCurrent = targetGuid === draft.guid || targetGuid === selectedGuid;
      if (deletingCurrent) {
        resetDraftToBase();
      }
      return;
    }

    try {
      setDeletingDraft(true);
      await deleteClientOrder(targetGuid);
      const deletingCurrent = targetGuid === draft.guid || targetGuid === selectedGuid;
      setOrders((prev) => prev.filter((item) => item.guid !== targetGuid));
      setOrdersMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      if (deletingCurrent) {
        resetDraftToBase();
      }
    } catch (e: any) {
      const message = userErrorMessage(e, 'Не удалось удалить черновик заказа.');
      setError(message);
      await loadOrders('reset');
    } finally {
      setDeletingDraft(false);
    }
  }, [draft.guid, findDeviceDraftEntry, loadOrders, removeDeviceDraftEntry, resetDraftToBase, selectedGuid]);

  const cancelOrder = React.useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Отменить этот заказ?')) void runCancel();
      return;
    }
    Alert.alert('Отменить заказ', 'Заказ будет переведен в статус "Отменен". Продолжить?', [
      { text: 'Нет', style: 'cancel' },
      { text: 'Да', style: 'destructive', onPress: () => void runCancel() },
    ]);
  }, [runCancel]);

  const autosaveLabel = React.useMemo(() => {
    switch (autosaveState) {
      case 'saved':
        return lastSavedAt
          ? `Сохранено ${new Date(lastSavedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
          : 'Сохранено';
      case 'error':
        return 'Не удалось сохранить';
      default:
        return dirty ? 'Не сохранено' : 'Без изменений';
    }
  }, [autosaveState, dirty, lastSavedAt]);

  const clearFilters = React.useCallback(() => {
    setFilters(emptyFilters());
    void removeStoredFilters(filtersStorageKey);
  }, [filtersStorageKey]);

  return {
    orders: sortedOrders,
    ordersMeta,
    todaySummary,
    loadingTodaySummary,
    calculatingTodayProfit,
    todaySummaryError,
    refreshTodaySummary,
    latestDraftOrder,
    hasEditableDocument,
    documentHeaderDefaultsState,
    documentHeaderLoadingState,
    deviceDraftsCount: deviceDraftEntries.length,
    syncDeviceDrafts,
    openLatestDraftIfAny: () => latestDraftOrder ? selectOrder(latestDraftOrder.guid) : Promise.resolve(),
    createDocument: createNewOrder,
    hasMoreOrders,
    ordersAppendError,
    ordersError,
    setOrdersError,
    loadMoreOrders,
    refreshOrders,
    applyInvoiceRequestResult,
    filters,
    setFilters,
    clearFilters,
    selectedGuid,
    selectedOrder,
    selectedOrderQueued,
    selectedOrderSynced,
    selectedOrderHas1cError,
    mutationLocked,
    unqueueOrder,
    restoreOrder,
    copyOrder,
    copyOrderFromList,
    selectOrder,
    createNewOrder,
    draft,
    selections,
    paymentFormOptions,
    deliveryMethodOptions,
    settings,
    saveUserSettings,
    patchDraft,
    setOrganization,
    setCounterparty,
    setAgreement,
    setContract,
    setWarehouse,
    setDeliveryAddress,
    setItemPatch,
    setItemMetadataPatches,
    enrichItemMetadata,
    setItemPackage,
    setItemPriceType,
    setHeaderPriceType,
    defaultHeaderPriceType,
    defaultLinePriceType,
    isHeaderPriceTypeCustom,
    isItemPriceTypeCustom,
    resetItemPriceType,
    resetHeaderPriceTypeToDefault,
    removeItem,
    clearItems,
    addProduct,
    addDraftItem,
    searchCounterparties,
    searchAgreements: searchClientOrderAgreements,
    searchContracts: searchClientOrderContracts,
    searchWarehouses: searchClientOrderWarehouses,
    searchDeliveryAddresses: searchClientOrderDeliveryAddresses,
    searchProducts: searchClientOrderProducts,
    searchPriceTypes: searchClientOrderPriceTypes,
    loadingOrders,
    ordersInitialLoadDone,
    loadingMoreOrders,
    loadingDetail,
    loadingReceiptPrices,
    refreshDocumentProfit,
    cancelDetailLoading,
    loadingDefaults,
    loadingSettings,
    savingSettings,
    saving,
    submitting,
    copying,
    cancelling,
    deletingDraft,
    refreshing,
    refreshAll,
    saveDraft,
    confirmDiscardIfNeeded,
    submitOrder,
    submitOrderFromList,
    cancelOrder,
    cancelOrderConfirmed: runCancel,
    deleteDraft,
    error,
    setError,
    draftMode,
    readOnly,
    dirty,
    validation,
    hasDebt: !!(
      selections.counterparty?.hasDebt
      || selectedOrder?.counterparty?.hasDebt
      || selectedOrder?.hasDebt
    ),
    shipmentProhibited: !!(
      selections.counterparty?.shipmentProhibited
      || selectedOrder?.counterparty?.shipmentProhibited
      || selectedOrder?.shipmentProhibited
    ),
    debtReason: selections.counterparty?.debtReason
      || selectedOrder?.counterparty?.debtReason
      || selectedOrder?.debtReason
      || null,
    canSubmitOrder,
    localTotal,
    localProfit,
    localProfitBasisAmount,
    localProfitabilityPercent,
    localWeight,
    localProfitAvailable,
    statusCounts,
    autosaveState,
    autosaveLabel,
    autosaveError,
    statusLabels: STATUS_LABELS,
    syncLabels: SYNC_LABELS,
  };
}
