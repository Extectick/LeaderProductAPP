import { useNotify } from '@/components/NotificationHost';
import { AuthContext } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelClientOrder,
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
  updateClientOrder,
  updateClientOrderSettings,
  type ClientOrder,
  type ClientOrderAgreementOption,
  type ClientOrderContractOption,
  type ClientOrderCounterpartyOption,
  type ClientOrderDeliveryAddressOption,
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
  computeLineTotal,
  computeDraftTotal,
  DEFAULT_ORDER_CURRENCY,
  emptyDraft,
  getClientOrderItems,
  getClientOrderItemsCount,
  getDraftPackagesForProduct,
  getOrderActivityAt,
  hasManualPrice,
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
    statusCounts: Record<string, number>;
  };
  nextOffset: number;
  storedAt: string;
};

function emptyFilters(): ClientOrdersFilters {
  return {
    search: '',
    status: '',
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
  return {
    ...emptyFilters(),
    search: typeof raw.search === 'string' ? raw.search : '',
    status: typeof raw.status === 'string' ? raw.status : '',
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
    status: filters.status,
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
  const looksTechnical =
    !message ||
    message.startsWith('{') ||
    message.startsWith('[') ||
    message.startsWith('<!DOCTYPE') ||
    message.includes('"path"') ||
    message.includes('"code"') ||
    message.includes('ZodError') ||
    message.includes('expected number') ||
    message.includes('\n    at ');
  return looksTechnical ? fallback : message.slice(0, 240);
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
    deliveryDate: settings?.resolvedDeliveryDate || null,
    currency: DEFAULT_ORDER_CURRENCY,
    priceTypeGuid: null,
    priceTypeName: null,
  };
}

function includesSearchToken(value: string | null | undefined, search: string) {
  return (value || '').toLowerCase().includes(search);
}

function normalizeFilterSearch(search: string) {
  return search.trim().toLowerCase();
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
  if (filters.status && order.status !== filters.status) return false;
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

  const search = normalizeFilterSearch(filters.search);
  if (!search) return true;

  return [
    order.guid,
    order.number1c,
    order.comment,
    order.counterparty?.name,
  ].some((value) => includesSearchToken(value, search));
}

function sortClientOrdersForWorkspace(items: ClientOrder[]) {
  return [...items].sort((a, b) => {
    const rankDiff = orderWorkspaceRank(a) - orderWorkspaceRank(b);
    if (rankDiff !== 0) return rankDiff;
    return getOrderActivityAt(b).localeCompare(getOrderActivityAt(a));
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
      },
      package: pack
        ? {
            guid: pack.guid,
            name: pack.name,
            multiplier: pack.multiplier ?? null,
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
    itemsCount: items.length,
    items,
    events: [],
    createdAt,
    updatedAt,
    sourceUpdatedAt: updatedAt,
  };
}

export function useClientOrdersWorkspace(options: UseClientOrdersWorkspaceOptions = {}) {
  const confirmDiscard = options.confirmDiscard;
  const notify = useNotify();
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
    statusCounts: Record<string, number>;
  }>({ total: 0, limit: ORDERS_PAGE_SIZE, offset: 0, statusCounts: {} });
  const [filters, setFilters] = React.useState<ClientOrdersFilters>(emptyFilters());
  const [filtersHydrated, setFiltersHydrated] = React.useState(false);
  const [ordersCacheHydrated, setOrdersCacheHydrated] = React.useState(false);
  const [selectedGuid, setSelectedGuid] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<ClientOrder | null>(null);
  const [draft, setDraft] = React.useState<DraftOrder>(() => emptyDraft());
  const [selections, setSelections] = React.useState<DraftSelections>(emptySelections());
  const [settings, setSettings] = React.useState<ClientOrderSettings | null>(null);
  const [loadingOrders, setLoadingOrders] = React.useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [loadingDefaults, setLoadingDefaults] = React.useState(false);
  const [loadingSettings, setLoadingSettings] = React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [deletingDraft, setDeletingDraft] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
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
  const selectedGuidRef = React.useRef<string | null>(null);
  const contextRefreshSignatureRef = React.useRef('');
  const ordersRequestIdRef = React.useRef(0);
  const detailRequestIdRef = React.useRef(0);
  const defaultsRequestIdRef = React.useRef(0);
  const pricingRequestIdRef = React.useRef(0);
  const ordersAppendLoadingRef = React.useRef(false);
  const ordersNextOffsetRef = React.useRef(0);
  const deviceDraftSyncingRef = React.useRef(false);

  const draftMode = !draft.guid;
  const filtersSignature = React.useMemo(() => ordersFilterSignature(filters), [filters]);
  const readOnly = !!selectedOrder?.readOnly || !!selectedOrder?.isPostedIn1c || selectedOrder?.status === 'CANCELLED';
  const baseValidation = React.useMemo(() => validateDraft(draft), [draft]);
  const validation = React.useMemo(() => {
    if (draftMode && settings?.deliveryDateIssue) {
      return {
        ...baseValidation,
        canSave: false,
        canAutosave: false,
        canSubmit: false,
        blockingMessage: settings.deliveryDateIssueMessage || 'Проверьте настройки даты отгрузки.',
      };
    }
    return baseValidation;
  }, [baseValidation, draftMode, settings?.deliveryDateIssue, settings?.deliveryDateIssueMessage]);
  const localTotal = React.useMemo(() => computeDraftTotal(draft), [draft]);
  const visibleDeviceOrders = React.useMemo(
    () => deviceDraftEntries.map((entry) => entry.order).filter((order) => orderMatchesFilters(order, filters)),
    [deviceDraftEntries, filters]
  );
  const mergedOrders = React.useMemo(() => {
    const deviceGuids = new Set(visibleDeviceOrders.map((order) => order.guid));
    return [...visibleDeviceOrders, ...orders.filter((order) => !deviceGuids.has(order.guid))];
  }, [orders, visibleDeviceOrders]);
  const sortedOrders = React.useMemo(() => sortClientOrdersForWorkspace(mergedOrders), [mergedOrders]);
  const latestDraftOrder = React.useMemo(() => sortedOrders.find((item) => item.status === 'DRAFT') || null, [sortedOrders]);
  const hasQueuedOrders = React.useMemo(
    () => sortedOrders.some((order) => order.status === 'QUEUED' || order.syncState === 'QUEUED') ||
      selectedOrder?.status === 'QUEUED' ||
      selectedOrder?.syncState === 'QUEUED',
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

  const hasMoreOrders = ordersNextOffsetRef.current < (ordersMeta.total || 0);

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
    selectedGuidRef.current = selectedGuid;
  }, [selectedGuid]);

  React.useEffect(() => {
    let cancelled = false;
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
      } else {
        apiOrdersRef.current = [];
        setOrders([]);
        ordersNextOffsetRef.current = 0;
        setOrdersMeta({ total: 0, limit: ORDERS_PAGE_SIZE, offset: 0, statusCounts: {} });
        setLoadingOrders(true);
      }
      setOrdersCacheHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [filtersHydrated, filtersSignature, ordersCacheStorageKey]);

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
    setDraft(normalizeDraftOrder({ ...emptyDraft(), ...base }));
    setSelections({
      ...emptySelections(),
      organization: (nextSettings ?? settings)?.preferredOrganization || null,
    });
    setSelectedGuid(null);
    setSelectedOrder(null);
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

  const mergeSavedOrderIntoDraft = React.useCallback((order: ClientOrder) => {
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
      deliveryAddressGuid: order.deliveryAddress?.guid ?? prev.deliveryAddressGuid,
    }));
  }, []);

  const applyOrderDetail = React.useCallback((order: ClientOrder) => {
    selectedGuidRef.current = order.guid;
    setSelectedGuid(order.guid);
    setSelectedOrder(order);
    setDraft(normalizeDraftOrder(orderToDraft(order)));
    setDocumentStarted(true);
    setSelections({
      organization: order.organization || null,
      counterparty: order.counterparty || null,
      agreement: order.agreement || null,
      contract: order.contract || null,
      warehouse: order.warehouse || null,
      deliveryAddress: order.deliveryAddress || null,
    });
    setDirty(false);
    setAutosaveState('idle');
    setAutosaveError(null);
  }, []);

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

  const loadOrders = React.useCallback(async (mode: 'reset' | 'append' = 'reset') => {
    if (mode === 'append' && ordersAppendLoadingRef.current) return;
    const offset = mode === 'append' ? ordersNextOffsetRef.current : 0;
    const requestId = ++ordersRequestIdRef.current;
    if (mode === 'append') {
      ordersAppendLoadingRef.current = true;
      setLoadingMoreOrders(true);
      setOrdersAppendError(null);
    } else {
      setLoadingOrders(true);
      setError(null);
      setOrdersAppendError(null);
    }

    try {
      const result = await getClientOrders({
        limit: ORDERS_PAGE_SIZE,
        offset,
        search: filters.search || undefined,
        status: filters.status || undefined,
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
      if (ordersRequestIdRef.current !== requestId) return;
      const liveSource = result.meta.liveSource;
      if (liveSource?.status && liveSource.status !== 'ok' && liveSource.message) {
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
      const nextTotal = mode === 'append' && list.length === 0
        ? ordersNextOffsetRef.current
        : result.meta.total || 0;
      const nextMeta = {
        total: nextTotal,
        limit: result.meta.limit || ORDERS_PAGE_SIZE,
        offset: result.meta.offset || offset,
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
      if (ordersRequestIdRef.current !== requestId) return;
      const message = userErrorMessage(e, mode === 'append' ? 'Не удалось загрузить ещё документы.' : 'Не удалось загрузить список заказов.');
      if (mode === 'append') {
        setOrdersAppendError(message);
      } else {
        setError(message);
      }
    } finally {
      if (mode === 'append') ordersAppendLoadingRef.current = false;
      if (ordersRequestIdRef.current === requestId) {
        setLoadingOrders(false);
        setLoadingMoreOrders(false);
      }
    }
  }, [filters, filtersSignature, ordersCacheStorageKey]);

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
    setLoadingDefaults(true);
    try {
      const defaults = await getClientOrderDefaults({ organizationGuid, counterpartyGuid });
      if (defaultsRequestIdRef.current !== requestId) return;

      const agreement = overrides.agreement ?? defaults.agreement ?? null;
      const contract = overrides.contract ?? agreement?.contract ?? defaults.contract ?? null;
      const warehouse = defaults.warehouse ?? agreement?.warehouse ?? null;
      const deliveryAddress = defaults.deliveryAddress ?? null;
      const priceType = defaults.priceType ?? agreement?.priceType ?? null;

      setDraft((prev) => normalizeDraftOrder({
        ...prev,
        organizationGuid,
        agreementGuid: agreement?.guid || '',
        contractGuid: contract?.guid || '',
        warehouseGuid: warehouse?.guid || '',
        deliveryAddressGuid: deliveryAddress?.guid || '',
        deliveryDate: prev.deliveryDate ?? defaults.deliveryDate ?? settingsRef.current?.resolvedDeliveryDate ?? null,
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
        deliveryAddress,
      }));
    } catch (e: any) {
      if (defaultsRequestIdRef.current !== requestId) return;
      if (isNetworkUnavailableError(e)) return;
      notify({
        type: 'warning',
        title: 'Подсказки не загружены',
        message: userErrorMessage(e, 'Не удалось подставить значения по умолчанию.'),
      });
    } finally {
      if (defaultsRequestIdRef.current === requestId) setLoadingDefaults(false);
    }
  }, [notify]);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  React.useEffect(() => {
    if (!filtersHydrated || !ordersCacheHydrated) return;
    const timer = setTimeout(() => {
      void loadOrders('reset');
    }, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filters, filtersHydrated, loadOrders, ordersCacheHydrated]);

  React.useEffect(() => {
    if (!filtersHydrated || !hasQueuedOrders) return undefined;
    const shouldRefreshSelected =
      !!selectedGuid &&
      (selectedOrder?.status === 'QUEUED' || selectedOrder?.syncState === 'QUEUED');
    const timer = setInterval(() => {
      void loadOrders('reset');
      if (shouldRefreshSelected && selectedGuid) {
        void loadDetail(selectedGuid);
      }
    }, QUEUED_ORDERS_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [filtersHydrated, hasQueuedOrders, loadDetail, loadOrders, selectedGuid, selectedOrder?.status, selectedOrder?.syncState]);

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
      const order = deviceEntry?.serverGuid
        ? await updateClientOrder(deviceEntry.serverGuid, { ...payload, revision: deviceEntry.serverRevision ?? draft.revision })
        : draft.guid && !isDeviceDraftGuid(draft.guid) && !deviceEntry
          ? await updateClientOrder(draft.guid, { ...payload, revision: draft.revision })
        : await createClientOrder(payload);

      removeDeviceDraftEntry(draft.guid || deviceEntry?.order.guid || deviceEntry?.serverGuid);
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      mergeSavedOrderIntoDraft(order);
      setDocumentStarted(true);
      setSelections({
        organization: order.organization || selections.organization,
        counterparty: order.counterparty || selections.counterparty,
        agreement: order.agreement || selections.agreement,
        contract: order.contract || selections.contract,
        warehouse: order.warehouse || selections.warehouse,
        deliveryAddress: order.deliveryAddress || selections.deliveryAddress,
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
        notify({
          type: 'success',
          message: 'Документ сохранен на устройстве',
          icon: 'checkmark-circle',
          durationMs: 5000,
          dismissKeys: ['client-order-device-save'],
        });
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
    mergeSavedOrderIntoDraft,
    readOnly,
    removeDeviceDraftEntry,
    saveDraftOnDevice,
    selections,
  ]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const confirmDiscardIfNeeded = React.useCallback(async () => {
    if (!dirty) return true;
    let decision: DiscardDecision;
    if (confirmDiscard) {
      const result = await confirmDiscard({
        draftMode,
        hasPersistedDraft: !!draft.guid,
        blockingMessage: validation.blockingMessage,
      });
      decision = typeof result === 'boolean' ? (result ? 'discard' : 'cancel') : result;
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      decision = window.confirm('Сохранить изменения перед выходом?') ? 'save' : 'cancel';
    } else {
      decision = await new Promise<DiscardDecision>((resolve) => {
        Alert.alert('Несохраненные изменения', 'Сохранить изменения перед выходом?', [
          { text: 'Остаться', style: 'cancel', onPress: () => resolve('cancel') },
          { text: 'Не сохранять', style: 'destructive', onPress: () => resolve('discard') },
          { text: 'Сохранить', onPress: () => resolve('save') },
        ]);
      });
    }
    if (decision === 'cancel') return false;
    if (decision === 'save') return !!(await saveDraft({ reason: 'manual' }));
    if (selectedOrder) {
      setDraft(normalizeDraftOrder(orderToDraft(selectedOrder)));
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
  }, [confirmDiscard, dirty, draft.guid, draftMode, resetDraftToBase, saveDraft, selectedOrder, validation.blockingMessage]);

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
    patchDraft((prev) => ({
      ...prev,
      ...patch,
      agreementGuid: '',
      contractGuid: '',
      warehouseGuid: '',
      deliveryAddressGuid: '',
      priceTypeGuid: null,
      priceTypeName: null,
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
      const packages = getDraftPackagesForProduct(product);
      const hasProductPackages = Array.isArray(product.packages);
      setItemPatch(item.key, {
        packageGuid: normalizePackageGuid(item.packageGuid, packages),
        basePrice: isManualPrice ? item.basePrice ?? product.basePrice ?? null : product.basePrice ?? null,
        receiptPrice: product.receiptPrice ?? product.basePrice ?? item.receiptPrice ?? item.basePrice ?? null,
        currency: DEFAULT_ORDER_CURRENCY,
        priceTypeGuid: isManualPrice ? item.priceTypeGuid ?? null : product.priceType?.guid ?? priceType?.guid ?? null,
        priceTypeName: isManualPrice ? item.priceTypeName ?? null : product.priceType?.name ?? priceType?.name ?? null,
        baseUnit: product.baseUnit ?? item.baseUnit ?? null,
        stock: product.stock ?? item.stock ?? null,
        packages: hasProductPackages ? packages : item.packages,
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
          const packages = getDraftPackagesForProduct(product);
          const hasProductPackages = Array.isArray(product.packages);
          return {
            ...item,
            packageGuid: normalizePackageGuid(item.packageGuid, packages),
            basePrice: isManualPrice ? item.basePrice : product.basePrice ?? null,
            receiptPrice: product.receiptPrice ?? product.basePrice ?? null,
            currency: DEFAULT_ORDER_CURRENCY,
            priceTypeGuid: isManualPrice
              ? item.priceTypeGuid ?? null
              : product.priceType?.guid ?? draft.priceTypeGuid ?? null,
            priceTypeName: isManualPrice
              ? item.priceTypeName ?? null
              : product.priceType?.name ?? draft.priceTypeName ?? null,
            baseUnit: product.baseUnit ?? item.baseUnit ?? null,
            stock: product.stock ?? null,
            packages: hasProductPackages ? packages : item.packages,
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

    const refreshSignature = [
      draft.organizationGuid,
      draft.counterpartyGuid,
      draft.agreementGuid || '',
      draft.warehouseGuid || '',
      draft.priceTypeGuid || '',
    ].join('||');

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

  const addProduct = React.useCallback((product: ClientOrderProduct) => {
    const existing = draft.items.find((item) => item.productGuid === product.guid);
    if (existing) return existing.key;
    const nextItem = buildNewItem(product);
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
    await Promise.all([loadSettings(), loadOrders('reset'), selectedGuid ? loadDetail(selectedGuid) : Promise.resolve(null)]);
    setRefreshing(false);
  }, [loadDetail, loadOrders, loadSettings, selectedGuid]);

  const submitOrder = React.useCallback(async () => {
    if (!validation.canSubmit) {
      const message = validation.blockingMessage || 'Исправьте ошибки в строках заказа.';
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
      const order = await submitClientOrder(targetGuid, revision);
      applySavedOrderToList(order);
      void loadOrders('reset');
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      setDraft(normalizeDraftOrder(orderToDraft(order)));
      setDocumentStarted(true);
      setDirty(false);
    } catch (e: any) {
      const message = isNetworkUnavailableError(e)
        ? 'Не удалось отправить заказ: нет связи или сервер не ответил. Документ сохранен, повторите отправку позже.'
        : userErrorMessage(e, 'Не удалось отправить заказ.');
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [applySavedOrderToList, dirty, draft.guid, draft.revision, findDeviceDraftEntry, loadOrders, saveDraft, selectedGuid, validation.blockingMessage, validation.canSubmit]);

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
      notify({ type: 'warning', title: 'Заказ отменен', message: 'Статус заказа обновлен.' });
      await loadOrders('reset');
      setSelectedGuid(order.guid);
      setSelectedOrder(order);
      setDraft(normalizeDraftOrder(orderToDraft(order)));
      setDirty(false);
    } catch (e: any) {
      setError(userErrorMessage(e, 'Не удалось отменить заказ.'));
    } finally {
      setCancelling(false);
    }
  }, [draft.guid, draft.revision, loadOrders, notify, resetDraftToBase]);

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
      await loadOrders('reset');
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
    selectOrder,
    createNewOrder,
    draft,
    selections,
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
    loadingMoreOrders,
    loadingDetail,
    cancelDetailLoading,
    loadingDefaults,
    loadingSettings,
    savingSettings,
    saving,
    submitting,
    cancelling,
    deletingDraft,
    refreshing,
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
    localTotal,
    statusCounts,
    autosaveState,
    autosaveLabel,
    autosaveError,
    statusLabels: STATUS_LABELS,
    syncLabels: SYNC_LABELS,
  };
}
