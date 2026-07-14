import { AuthContext } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelClientOrder,
  copyClientOrder,
  createClientOrder,
  deleteClientOrder,
  getClientOrderDefaults,
  getClientOrder,
  getClientOrderProductsBatch,
  getClientOrderSettings,
  getClientOrders,
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
  type ClientOrderAgreementOption,
  type ClientOrderContractOption,
  type ClientOrderCounterpartyOption,
  type ClientOrderDeliveryAddressOption,
  type ClientOrderEnumOption,
  type ClientOrderOrganization,
  type ClientOrderProduct,
  type ClientOrderPriceTypeOption,
  type ClientOrderSettings,
  type ClientOrderWarehouseOption,
} from '@/utils/clientOrdersService';
import React from 'react';
import { Alert, Platform } from 'react-native';
import {
  buildNewItem,
  buildPayload,
  computeDraftProfit,
  computeDraftWeight,
  computeLineTotal,
  computeDraftTotal,
  DEFAULT_ORDER_CURRENCY,
  emptyDraft,
  getClientOrderItems,
  getClientOrderItemsCount,
  getOrderDisplayStatusLabel,
  getOrderDisplayStatus,
  mergeDraftPackagesForProduct,
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

type AutosaveState = 'idle' | 'saved' | 'error';
type SaveOptions = { silent?: boolean; reason?: 'manual' | 'autosave' };
type DiscardDecision = 'save' | 'discard' | 'cancel';
type DiscardConfirmContext = {
  draftMode: boolean;
  hasPersistedDraft: boolean;
  blockingMessage: string | null;
};
type UseClientOrdersWorkspaceOptions = {
  confirmDiscard?: (context: DiscardConfirmContext) => Promise<DiscardDecision | boolean>;
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
const DEVICE_DRAFT_GUID_PREFIX = 'device-order-';
const DEVICE_DRAFT_SYNC_BACKOFF_MS = [0, 15_000, 60_000, 180_000, 300_000, 600_000];
const QUEUED_ORDERS_REFRESH_INTERVAL_MS = 15_000;
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
  return !!(order.lastExportError || order.last1cError || order.cancelRequestedAt || ['ERROR', 'FAILED', 'CONFLICT', 'CANCEL_REQUESTED'].includes(order.syncState));
}

function orderIsPinnedLocal(order: ClientOrder) {
  if (orderHasProblem(order)) return true;
  if (order.origin && order.origin !== 'onec') return true;
  if (!order.number1c) return true;
  return ['DRAFT', 'QUEUED', 'ERROR', 'CONFLICT', 'CANCEL_REQUESTED'].includes(order.syncState)
    || ['DRAFT', 'QUEUED', 'REJECTED', 'CANCELLED'].includes(order.status);
}

function orderWorkspaceRank(order: ClientOrder) {
  if (orderHasProblem(order)) return 0;
  if (orderIsPinnedLocal(order)) return 1;
  return 2;
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
    const activityDiff = (parseOrderDate(getOrderActivityAt(b)) ?? 0) - (parseOrderDate(getOrderActivityAt(a)) ?? 0);
    if (activityDiff !== 0) return activityDiff;
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

function mergeOrderListMetadata(current: ClientOrder, summary: ClientOrder): ClientOrder {
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
    isPostedIn1c: summary.isPostedIn1c ?? current.isPostedIn1c,
    hasRealization: summary.hasRealization ?? current.hasRealization,
    realizationDetectedAt: summary.realizationDetectedAt ?? current.realizationDetectedAt,
    readOnly: summary.readOnly ?? current.readOnly,
    readOnlyReason: summary.readOnlyReason ?? current.readOnlyReason,
  };
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
    counterparty: selections.counterparty
      ? { guid: selections.counterparty.guid, name: selections.counterparty.name }
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
  const auth = React.useContext(AuthContext);
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
  const [loadingDefaults, setLoadingDefaults] = React.useState(false);
  const [loadingSettings, setLoadingSettings] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [deletingDraft, setDeletingDraft] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshingQueueState, setRefreshingQueueState] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
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
  const queueStateRequestIdRef = React.useRef(0);
  const detailRequestIdRef = React.useRef(0);
  const defaultsRequestIdRef = React.useRef(0);
  const enumOptionsRequestIdRef = React.useRef(0);
  const deliveryAddressManualVersionRef = React.useRef(0);
  const pricingRequestIdRef = React.useRef(0);
  const ordersAppendLoadingRef = React.useRef(false);
  const ordersNextOffsetRef = React.useRef(0);
  const ordersInitialLoadDoneRef = React.useRef(false);
  const deviceDraftSyncingRef = React.useRef(false);

  const markOrdersInitialLoadDone = React.useCallback(() => {
    if (ordersInitialLoadDoneRef.current) return;
    ordersInitialLoadDoneRef.current = true;
    setOrdersInitialLoadDone(true);
  }, []);

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
  const localTotal = React.useMemo(() => computeDraftTotal(draft), [draft]);
  const localProfit = React.useMemo(() => computeDraftProfit(draft), [draft]);
  const localWeight = React.useMemo(() => computeDraftWeight(draft), [draft]);
  const visibleDeviceOrders = React.useMemo(
    () => deviceDraftEntries.map((entry) => entry.order).filter((order) => orderMatchesFilters(order, filters)),
    [deviceDraftEntries, filters]
  );
  const visibleApiOrders = React.useMemo(
    () => orders.filter((order) => orderMatchesFilters(order, filters)),
    [orders, filters]
  );
  const mergedOrders = React.useMemo(() => {
    const deviceGuids = new Set(visibleDeviceOrders.map((order) => order.guid));
    return [...visibleDeviceOrders, ...visibleApiOrders.filter((order) => !deviceGuids.has(order.guid))];
  }, [visibleApiOrders, visibleDeviceOrders]);
  const sortedOrders = React.useMemo(() => sortClientOrdersForWorkspace(mergedOrders), [mergedOrders]);
  const latestDraftOrder = React.useMemo(() => sortedOrders.find((item) => item.status === 'DRAFT') || null, [sortedOrders]);
  const hasQueuedOrders = React.useMemo(
    () => sortedOrders.some(isQueuedClientOrder) || isQueuedClientOrder(selectedOrder),
    [selectedOrder?.status, selectedOrder?.syncState, sortedOrders]
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
    setDraft((prev) => normalizeDraftOrder(typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }));
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
      items: prev.items.map((item) => (item.key === lineKey ? { ...item, ...patch } : item)),
    }));
  }, [patchDraft]);

  const enrichItemsMetadata = React.useCallback(async (sourceDraft: DraftOrder) => {
    if (!sourceDraft.counterpartyGuid || !sourceDraft.items.length) return;
    const productGuids = Array.from(new Set(sourceDraft.items.map((item) => item.productGuid).filter(Boolean)));
    if (!productGuids.length) return;

    const requestId = ++pricingRequestIdRef.current;
    const targetGuid = sourceDraft.guid || null;
    try {
      const products = await getClientOrderProductsBatch({
        productGuids,
        organizationGuid: sourceDraft.organizationGuid || undefined,
        counterpartyGuid: sourceDraft.counterpartyGuid,
        agreementGuid: sourceDraft.agreementGuid || undefined,
        warehouseGuid: sourceDraft.warehouseGuid || undefined,
        priceTypeGuid: sourceDraft.priceTypeGuid || undefined,
      });
      if (pricingRequestIdRef.current !== requestId) return;

      const productByGuid = new Map(products.map((product) => [product.guid, product]));
      setDraft((prev) => {
        if (targetGuid && prev.guid !== targetGuid) return prev;
        if (!targetGuid && prev.guid) return prev;

        return normalizeDraftOrder({
          ...prev,
          items: prev.items.map((item) => {
            const product = productByGuid.get(item.productGuid);
            if (!product) return item;
            const packages = mergeDraftPackagesForProduct(product, item.packages, item.baseUnit);
            const hasProductPackages = Array.isArray(product.packages);
            return {
              ...item,
              packageGuid: normalizePackageGuid(item.packageGuid, packages),
              receiptPrice: item.receiptPrice ?? product.receiptPrice ?? product.basePrice ?? null,
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
        });
      });
    } catch {
      // Metadata is optional on open: keep saved document values intact.
    }
  }, []);

  const enrichItemMetadata = React.useCallback((lineKey: string) => {
    const item = draft.items.find((next) => next.key === lineKey);
    if (!item) return Promise.resolve();
    return enrichItemsMetadata({ ...draft, items: [item] });
  }, [draft, enrichItemsMetadata]);

  const mergeSavedOrderIntoDraft = React.useCallback((
    order: ClientOrder,
    options?: { preservedDeliveryAddressGuid?: string | null }
  ) => {
    setDraft((prev) => normalizeDraftOrder({
      ...prev,
      guid: order.guid,
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
    }));
  }, []);

  const mergeServerRevisionIntoOpenDraft = React.useCallback((order: ClientOrder) => {
    setSelectedOrder((prev) => (
      prev?.guid === order.guid ? mergeOrderListMetadata(prev, order) : prev
    ));
    setDraft((prev) => {
      if (prev.guid !== order.guid) return prev;
      const serverRevision = Number(order.revision || 0);
      if (!Number.isFinite(serverRevision) || serverRevision <= (prev.revision || 0)) return prev;
      return normalizeDraftOrder({ ...prev, revision: serverRevision });
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
    } catch {
      if (enumOptionsRequestIdRef.current !== requestId) return;
    }
  }, []);

  const applyOrderDetail = React.useCallback((order: ClientOrder) => {
    const nextDraft = normalizeDraftOrder(orderToDraft(order));
    selectedGuidRef.current = order.guid;
    contextRefreshSignatureRef.current = buildPricingContextSignature(nextDraft);
    setSelectedGuid(order.guid);
    setSelectedOrder(order);
    setDraft(nextDraft);
    void enrichItemsMetadata(nextDraft);
    setDocumentStarted(true);
    setSelections({
      organization: order.organization || null,
      counterparty: order.counterparty || null,
      agreement: order.agreement || null,
      contract: order.contract || null,
      warehouse: order.warehouse || null,
      deliveryAddress: order.deliveryAddress || null,
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

  const saveDraftOnDevice = React.useCallback((payload: ClientOrderSavePayload, syncError?: string | null) => {
    const nowIso = new Date().toISOString();
    const existing = findDeviceDraftEntry(draft.guid);
    const serverGuid = existing?.serverGuid ?? (draft.guid && !isDeviceDraftGuid(draft.guid) ? draft.guid : null);
    const localGuid = existing?.order.guid ?? draft.guid ?? makeDeviceDraftGuid();
    const createdAt = existing?.createdAt ?? selectedOrder?.createdAt ?? nowIso;
    const revision = Math.max(1, existing?.order.revision ?? draft.revision ?? 0);
    const entry: DeviceDraftEntry = {
      id: existing?.id ?? makeDeviceDraftGuid(),
      serverGuid,
      serverRevision: existing?.serverRevision ?? (serverGuid ? draft.revision : null),
      order: buildDeviceOrderFromDraft({
        draft: { ...draft, guid: localGuid, revision },
        selections,
        guid: localGuid,
        revision,
        createdAt,
        updatedAt: nowIso,
        lastSyncError: syncError ?? null,
      }),
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

  const syncDeviceDrafts = React.useCallback(async () => {
    if (!deviceDraftsHydrated || deviceDraftSyncingRef.current) return;
    const entries = deviceDraftEntriesRef.current;
    if (!entries.length) return;
    const dueEntries = entries.filter((entry) => isDeviceDraftSyncDue(entry));
    if (!dueEntries.length) return;

    deviceDraftSyncingRef.current = true;
    let nextEntries = entries;

    try {
      for (const entry of dueEntries) {
        try {
          const order = entry.serverGuid
            ? await updateClientOrder(entry.serverGuid, {
                ...entry.payload,
                revision: entry.serverRevision ?? entry.order.revision,
              })
            : await createClientOrder(entry.payload);
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
        return normalizeDraftOrder({ ...prev, ...buildDraftBase(nextSettings) });
      });
      setSelections((prev) => ({
        ...prev,
        organization: prev.organization || nextSettings.preferredOrganization || null,
      }));
      return nextSettings;
    } catch (e: any) {
      setError(userErrorMessage(e, 'Не удалось загрузить настройки заказов клиентов.'));
      return null;
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const loadOrders = React.useCallback(async (mode: 'reset' | 'append' = 'reset', options?: { silent?: boolean }) => {
    if (mode === 'append' && ordersAppendLoadingRef.current) return;
    const silent = options?.silent === true;
    const offset = mode === 'append' ? ordersNextOffsetRef.current : 0;
    const requestId = silent ? ++silentOrdersRequestIdRef.current : ++ordersRequestIdRef.current;
    if (mode === 'append') {
      ordersAppendLoadingRef.current = true;
      setLoadingMoreOrders(true);
      setOrdersAppendError(null);
    } else if (!silent) {
      setLoadingOrders(true);
      setError(null);
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
      if (!silent && liveSource?.status && liveSource.status !== 'ok' && liveSource.message) {
        setError(liveSource.message);
      }
      const list = Array.isArray(result.items) ? result.items : [];
      const nextOffset = offset + list.length;
      const currentOrders = apiOrdersRef.current;
      const knownOrderGuids = new Set(currentOrders.map((known) => known.guid));
      const nextOrders = mode !== 'append'
        ? list
        : [
            ...currentOrders,
            ...list.filter((item) => !knownOrderGuids.has(item.guid)),
          ];
      ordersNextOffsetRef.current = nextOffset;
      apiOrdersRef.current = nextOrders;
      setOrders(nextOrders);
      const currentSelectedGuid = selectedGuidRef.current;
      const selectedSummary = currentSelectedGuid
        ? nextOrders.find((item) => item.guid === currentSelectedGuid)
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
      setOrdersMeta(nextMeta);
      const cachedOrders = nextOrders.slice(0, ORDERS_CACHE_LIMIT);
      void writeStoredOrdersCache(ordersCacheStorageKey, {
        signature: filtersSignature,
        orders: cachedOrders,
        meta: nextMeta,
        nextOffset: Math.min(nextOffset, cachedOrders.length),
        storedAt: new Date().toISOString(),
      });
      if (mode === 'reset') {
        markOrdersInitialLoadDone();
        const nextSorted = sortClientOrdersForWorkspace(list);
        const latestDraft = nextSorted.find((item) => item.status === 'DRAFT') || null;
        setSelectedGuid((prev) => {
          if (prev && list.some((item) => item.guid === prev)) return prev;
          if (documentStartedRef.current) return prev;
          return latestDraft?.guid ?? null;
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
      } else if (!silent) {
        setError(message);
        markOrdersInitialLoadDone();
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
  }, [filters, filtersSignature, markOrdersInitialLoadDone, mergeServerRevisionIntoOpenDraft, ordersCacheStorageKey]);

  const refreshQueueState = React.useCallback(async () => {
    const requestId = ++queueStateRequestIdRef.current;
    setRefreshingQueueState(true);
    try {
      await loadOrders('reset', { silent: true });
    } finally {
      if (queueStateRequestIdRef.current === requestId) {
        setRefreshingQueueState(false);
      }
    }
  }, [loadOrders]);

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
        currency: defaults.currency || DEFAULT_ORDER_CURRENCY,
        priceTypeGuid: priceType?.guid ?? null,
        priceTypeName: priceType?.name ?? null,
        items: prev.items.map((item) => ({
          ...item,
          priceTypeGuid: hasManualPrice(item) ? item.priceTypeGuid ?? null : priceType?.guid ?? null,
          priceTypeName: hasManualPrice(item) ? item.priceTypeName ?? null : priceType?.name ?? null,
          basePrice: hasManualPrice(item) ? item.basePrice : item.basePrice,
        })),
      }));
      setSelections((prev) => ({
        organization: overrides.organization ?? prev.organization,
        counterparty: prev.counterparty,
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
    if (!filtersHydrated || !hasQueuedOrders) return undefined;
    const timer = setInterval(() => {
      void refreshQueueState();
    }, QUEUED_ORDERS_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [filtersHydrated, hasQueuedOrders, refreshQueueState]);

  const refreshOrders = React.useCallback(() => loadOrders('reset'), [loadOrders]);
  const loadMoreOrders = React.useCallback(
    () => (hasMoreOrders && !ordersAppendLoadingRef.current ? loadOrders('append') : Promise.resolve()),
    [hasMoreOrders, loadOrders]
  );

  React.useEffect(() => {
    if (!filtersHydrated || !deviceDraftsHydrated) return;
    void syncDeviceDrafts();
  }, [deviceDraftsHydrated, filtersHydrated, syncDeviceDrafts]);

  React.useEffect(() => {
    if (!selectedGuid) return;
    if (selectedOrder?.guid === selectedGuid) return;
    void loadDetail(selectedGuid);
  }, [loadDetail, selectedGuid, selectedOrder?.guid]);

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
    const deviceEntry = findDeviceDraftEntry(draft.guid);
    try {
      setSaving(true);
      setAutosaveError(null);

      payload = buildPayload(draft, options?.reason || 'manual');
      const updateTargetGuid = deviceEntry?.serverGuid
        ?? (draft.guid && !isDeviceDraftGuid(draft.guid) && !deviceEntry ? draft.guid : null);
      const initialRevision = updateTargetGuid === deviceEntry?.serverGuid
        ? deviceEntry.serverRevision ?? draft.revision
        : draft.revision;
      const saveToApi = (revision: number) => (
        updateTargetGuid
          ? updateClientOrder(updateTargetGuid, { ...payload, revision })
          : createClientOrder(payload)
      );

      let order: ClientOrder;
      try {
        order = await saveToApi(initialRevision);
      } catch (e) {
        if (!updateTargetGuid || !isRevisionConflictError(e)) {
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

      removeDeviceDraftEntry(draft.guid || deviceEntry?.order.guid || deviceEntry?.serverGuid);
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
        const localOrder = saveDraftOnDevice(payload);
        applyOrderDetail(localOrder);
        setError(null);
        setDirty(false);
        setLastSavedAt(new Date().toISOString());
        setAutosaveState('saved');
        return localOrder;
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
    selections,
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
        receiptPrice: product.receiptPrice ?? product.basePrice ?? item.receiptPrice ?? item.basePrice ?? null,
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

  const refreshItemsPricing = React.useCallback(async (items: DraftItem[]) => {
    if (!draft.counterpartyGuid || !items.length) return;
    const requestId = ++pricingRequestIdRef.current;
    try {
      const products = await getClientOrderProductsBatch({
        productGuids: items.map((item) => item.productGuid),
        organizationGuid: draft.organizationGuid || undefined,
        counterpartyGuid: draft.counterpartyGuid,
        agreementGuid: draft.agreementGuid || undefined,
        warehouseGuid: draft.warehouseGuid || undefined,
        priceTypeGuid: draft.priceTypeGuid || undefined,
      });
      if (pricingRequestIdRef.current !== requestId) return;
      const productByGuid = new Map(products.map((product) => [product.guid, product]));
      setDraft((prev) => normalizeDraftOrder({
        ...prev,
        items: prev.items.map((item) => {
          const product = productByGuid.get(item.productGuid);
          if (!product) return item;
          const isManualPrice = hasManualPrice(item);
          const packages = mergeDraftPackagesForProduct(product, item.packages, item.baseUnit);
          const hasProductPackages = Array.isArray(product.packages);
          return {
            ...item,
            packageGuid: normalizePackageGuid(item.packageGuid, packages),
            basePrice: isManualPrice ? item.basePrice : product.basePrice ?? null,
            receiptPrice: product.receiptPrice ?? product.basePrice ?? null,
            currency: DEFAULT_ORDER_CURRENCY,
            priceTypeGuid: isManualPrice
              ? item.priceTypeGuid ?? null
              : draft.priceTypeGuid ?? product.priceType?.guid ?? null,
            priceTypeName: isManualPrice
              ? item.priceTypeName ?? null
              : draft.priceTypeName ?? product.priceType?.name ?? null,
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
      }));
    } catch {
      if (pricingRequestIdRef.current !== requestId) return;
      setDraft((prev) => normalizeDraftOrder({
        ...prev,
        items: prev.items.map((item) => hasManualPrice(item)
          ? item
          : { ...item, basePrice: null }),
      }));
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
    refreshTargets.forEach((item) => {
      void refreshItemPricing(item, priceType);
    });
  }, [draft.items, patchDraft, refreshItemPricing]);

  const resetHeaderPriceTypeToDefault = React.useCallback(() => {
    const priceType = defaultHeaderPriceType;
    const refreshTargets = draft.items;
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
    refreshTargets.forEach((item) => {
      void refreshItemPricing({ ...item, manualPrice: '' }, priceType);
    });
  }, [defaultHeaderPriceType, draft.items, patchDraft, refreshItemPricing]);

  const refreshAll = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadSettings(),
      loadOrders('reset'),
      selectedGuid && !dirtyRef.current ? loadDetail(selectedGuid) : Promise.resolve(null),
    ]);
    setRefreshing(false);
  }, [loadDetail, loadOrders, loadSettings, selectedGuid]);

  const submitOrder = React.useCallback(async () => {
    if (!canSubmitOrder) {
      const message = selectedOrderQueued && !dirty
        ? 'Нет изменений для повторной отправки.'
        : validation.blockingMessage || 'Исправьте ошибки в строках заказа.';
      setError(message);
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
  }, [applyOrderDetail, applySavedOrderToList, canSubmitOrder, dirty, draft.guid, draft.revision, findDeviceDraftEntry, loadOrders, mergeServerRevisionIntoOpenDraft, saveDraft, selectedGuid, selectedOrderQueued, validation.blockingMessage]);

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

  const copyOrder = React.useCallback(async (options?: { saveFirst?: boolean }) => {
    let targetGuid = draft.guid || selectedGuid;
    let revision = draft.revision;
    if (!targetGuid) return null;
    if (options?.saveFirst && dirty) {
      const saved = await saveDraft({ silent: true, reason: 'manual' });
      if (!saved || isDeviceDraftGuid(saved.guid)) return null;
      targetGuid = saved.guid;
      revision = saved.revision;
    }
    try {
      setCopying(true);
      const order = await copyClientOrder(targetGuid, revision);
      applySavedOrderToList(order);
      applyOrderDetail(order);
      return order;
    } catch (e: any) {
      setError(userErrorMessage(e, 'Не удалось скопировать заказ клиента.'));
      return null;
    } finally {
      setCopying(false);
    }
  }, [applyOrderDetail, applySavedOrderToList, dirty, draft.guid, draft.revision, saveDraft, selectedGuid]);

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
    loadMoreOrders,
    refreshOrders,
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
    searchCounterparties: searchClientOrderCounterparties,
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
    refreshingQueueState,
    refreshAll,
    saveDraft,
    confirmDiscardIfNeeded,
    submitOrder,
    cancelOrder,
    cancelOrderConfirmed: runCancel,
    deleteDraft,
    error,
    setError,
    draftMode,
    readOnly,
    dirty,
    validation,
    canSubmitOrder,
    localTotal,
    localProfit,
    localWeight,
    statusCounts,
    autosaveState,
    autosaveLabel,
    autosaveError,
    statusLabels: STATUS_LABELS,
    syncLabels: SYNC_LABELS,
  };
}
