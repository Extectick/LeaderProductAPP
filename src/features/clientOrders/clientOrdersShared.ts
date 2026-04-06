import {
  type ClientOrder,
  type ClientOrderItem,
  type ClientOrderProduct,
  type ClientOrdersReferenceData,
} from '@/utils/clientOrdersService';

export type DraftItem = {
  key: string;
  productGuid: string;
  productName: string;
  productCode?: string | null;
  quantity: string;
  packageGuid?: string | null;
  manualPrice: string;
  discountPercent: string;
  comment: string;
  basePrice?: number | null;
  currency?: string | null;
  priceSource?: string | null;
  packages: ClientOrderProduct['packages'];
};

export type DraftOrder = {
  guid?: string | null;
  revision: number;
  counterpartyGuid: string;
  agreementGuid: string;
  contractGuid: string;
  warehouseGuid: string;
  deliveryAddressGuid: string;
  deliveryDate?: string | null;
  comment: string;
  currency: string;
  generalDiscountPercent: string;
  items: DraftItem[];
};

export type ClientOrdersFilters = {
  search: string;
  status: string;
  counterpartyGuid: string;
};

export type DraftValidation = {
  canSave: boolean;
  canAutosave: boolean;
  blockingMessage: string | null;
  itemMessages: Record<string, string[]>;
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  QUEUED: 'В очереди',
  SENT_TO_1C: 'Создан в 1С',
  CONFIRMED: 'Подтвержден',
  PARTIAL: 'Частично выполнен',
  REJECTED: 'Отклонен',
  CANCELLED: 'Отменен',
};

export const SYNC_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  QUEUED: 'Ожидает 1С',
  SENT_TO_1C: 'Отправлен в 1С',
  SYNCED: 'Синхронизирован',
  CONFLICT: 'Конфликт',
  ERROR: 'Ошибка',
  CANCEL_REQUESTED: 'Ожидает отмены',
};

export function makeKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyDraft(): DraftOrder {
  return {
    revision: 0,
    counterpartyGuid: '',
    agreementGuid: '',
    contractGuid: '',
    warehouseGuid: '',
    deliveryAddressGuid: '',
    deliveryDate: null,
    comment: '',
    currency: '',
    generalDiscountPercent: '',
    items: [],
  };
}

export function createEmptyRefs(): ClientOrdersReferenceData {
  return {
    counterparties: [],
    agreements: [],
    contracts: [],
    deliveryAddresses: [],
    warehouses: [],
  };
}

export function asString(value?: number | null) {
  return value === null || value === undefined ? '' : String(value);
}

export function asNumber(value: string) {
  const parsed = Number(value.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function formatMoney(value?: number | null, currency?: string | null) {
  if (value === null || value === undefined) return '—';
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getOrderActivityAt(order: ClientOrder) {
  return order.updatedAt || order.queuedAt || order.sentTo1cAt || order.createdAt || '';
}

export function orderToDraft(order: ClientOrder): DraftOrder {
  return {
    guid: order.guid,
    revision: order.revision,
    counterpartyGuid: order.counterparty?.guid ?? '',
    agreementGuid: order.agreement?.guid ?? '',
    contractGuid: order.contract?.guid ?? '',
    warehouseGuid: order.warehouse?.guid ?? '',
    deliveryAddressGuid: order.deliveryAddress?.guid ?? '',
    deliveryDate: order.deliveryDate ?? null,
    comment: order.comment ?? '',
    currency: order.currency ?? '',
    generalDiscountPercent: asString(order.generalDiscountPercent),
    items: order.items.map((item: ClientOrderItem) => ({
      key: makeKey(),
      productGuid: item.product.guid,
      productName: item.product.name,
      productCode: item.product.code ?? null,
      quantity: asString(item.quantity),
      packageGuid: item.package?.guid ?? null,
      manualPrice: asString(item.manualPrice),
      discountPercent: asString(item.discountPercent),
      comment: item.comment ?? '',
      basePrice: item.basePrice ?? null,
      currency: order.currency ?? null,
      priceSource: item.priceSource ?? null,
      packages: item.package?.guid
        ? [
            {
              guid: item.package.guid,
              name: item.package.name ?? 'Упаковка',
              multiplier: item.package.multiplier ?? null,
              isDefault: true,
              unit: item.unit ?? null,
            },
          ]
        : [],
    })),
  };
}

export function computeLineTotal(item: DraftItem, generalDiscountPercent?: string) {
  const quantity = asNumber(item.quantity);
  const manual = item.manualPrice.trim() ? asNumber(item.manualPrice) : undefined;
  const discount = item.discountPercent.trim()
    ? asNumber(item.discountPercent)
    : generalDiscountPercent?.trim()
      ? asNumber(generalDiscountPercent)
      : 0;
  const price = manual ?? item.basePrice ?? 0;
  if (Number.isNaN(quantity)) return 0;
  return quantity * price * (1 - (Number.isNaN(discount) ? 0 : discount) / 100);
}

export function computeDraftTotal(draft: DraftOrder) {
  return draft.items.reduce((sum, item) => sum + computeLineTotal(item, draft.generalDiscountPercent), 0);
}

export function validateDraft(draft: DraftOrder): DraftValidation {
  const itemMessages: Record<string, string[]> = {};

  if (!draft.counterpartyGuid) {
    return {
      canSave: false,
      canAutosave: false,
      blockingMessage: 'Выберите контрагента.',
      itemMessages,
    };
  }

  if (!draft.items.length) {
    return {
      canSave: false,
      canAutosave: false,
      blockingMessage: 'Добавьте хотя бы одну строку заказа.',
      itemMessages,
    };
  }

  const generalDiscountPercent = draft.generalDiscountPercent.trim() ? asNumber(draft.generalDiscountPercent) : undefined;
  if (
    generalDiscountPercent !== undefined &&
    (Number.isNaN(generalDiscountPercent) || generalDiscountPercent < 0 || generalDiscountPercent > 100)
  ) {
    return {
      canSave: false,
      canAutosave: false,
      blockingMessage: 'Общая скидка должна быть в диапазоне 0-100.',
      itemMessages,
    };
  }

  for (const item of draft.items) {
    const messages: string[] = [];
    const quantity = asNumber(item.quantity);
    const manualPrice = item.manualPrice.trim() ? asNumber(item.manualPrice) : undefined;
    const discountPercent = item.discountPercent.trim() ? asNumber(item.discountPercent) : undefined;

    if (Number.isNaN(quantity) || quantity <= 0) {
      messages.push('Количество должно быть больше 0.');
    }
    if (manualPrice !== undefined && (Number.isNaN(manualPrice) || manualPrice <= 0)) {
      messages.push('Ручная цена должна быть больше 0.');
    }
    if (
      discountPercent !== undefined &&
      (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100)
    ) {
      messages.push('Скидка строки должна быть в диапазоне 0-100.');
    }
    if (messages.length) {
      itemMessages[item.key] = messages;
    }
  }

  const hasItemErrors = Object.keys(itemMessages).length > 0;
  return {
    canSave: !hasItemErrors,
    canAutosave: !hasItemErrors,
    blockingMessage: hasItemErrors ? 'Исправьте ошибки в строках заказа.' : null,
    itemMessages,
  };
}

export function buildPayload(draft: DraftOrder) {
  const validation = validateDraft(draft);
  if (!validation.canSave) {
    throw new Error(validation.blockingMessage || 'Проверьте заполнение заказа.');
  }

  const generalDiscountPercent = draft.generalDiscountPercent.trim() ? asNumber(draft.generalDiscountPercent) : undefined;

  return {
    counterpartyGuid: draft.counterpartyGuid,
    agreementGuid: draft.agreementGuid || null,
    contractGuid: draft.contractGuid || null,
    warehouseGuid: draft.warehouseGuid || null,
    deliveryAddressGuid: draft.deliveryAddressGuid || null,
    deliveryDate: draft.deliveryDate || undefined,
    comment: draft.comment.trim() || undefined,
    currency: draft.currency.trim() || undefined,
    generalDiscountPercent,
    items: draft.items.map((item) => ({
      productGuid: item.productGuid,
      packageGuid: item.packageGuid || undefined,
      quantity: asNumber(item.quantity),
      manualPrice: item.manualPrice.trim() ? asNumber(item.manualPrice) : undefined,
      discountPercent: item.discountPercent.trim() ? asNumber(item.discountPercent) : undefined,
      comment: item.comment.trim() || undefined,
    })),
  };
}

export function pickDefaultWarehouse(refs: ClientOrdersReferenceData) {
  const preferred = refs.warehouses.find((item) => item.isDefault) ?? null;
  if (preferred) return preferred.guid;
  return refs.warehouses.length === 1 ? refs.warehouses[0].guid : '';
}

export function applyReferenceDefaults(draft: DraftOrder, refs: ClientOrdersReferenceData): DraftOrder {
  const next: DraftOrder = { ...draft };
  const agreements = refs.agreements;
  const contracts = refs.contracts;
  const warehouses = refs.warehouses;
  const addresses = refs.deliveryAddresses.filter((item) => item.guid);

  if (next.agreementGuid && !agreements.some((item) => item.guid === next.agreementGuid)) {
    next.agreementGuid = '';
  }
  if (next.contractGuid && !contracts.some((item) => item.guid === next.contractGuid)) {
    next.contractGuid = '';
  }
  if (next.warehouseGuid && !warehouses.some((item) => item.guid === next.warehouseGuid)) {
    next.warehouseGuid = '';
  }
  if (next.deliveryAddressGuid && !addresses.some((item) => item.guid === next.deliveryAddressGuid)) {
    next.deliveryAddressGuid = '';
  }

  const agreement = agreements.find((item) => item.guid === next.agreementGuid);
  if (agreement?.contract?.guid && !next.contractGuid && contracts.some((item) => item.guid === agreement.contract?.guid)) {
    next.contractGuid = agreement.contract.guid;
  }
  if (agreement?.warehouse?.guid && !next.warehouseGuid && warehouses.some((item) => item.guid === agreement.warehouse?.guid)) {
    next.warehouseGuid = agreement.warehouse.guid;
  }
  if (agreement?.currency && !next.currency) {
    next.currency = agreement.currency;
  }
  if (!next.warehouseGuid) {
    const defaultWarehouseGuid = pickDefaultWarehouse(refs);
    if (defaultWarehouseGuid) next.warehouseGuid = defaultWarehouseGuid;
  }

  return next;
}

export function buildNewItem(product: ClientOrderProduct): DraftItem {
  const packages = Array.isArray(product.packages) ? product.packages : [];
  const pack = packages.find((item) => item.isDefault) ?? packages[0];
  return {
    key: makeKey(),
    productGuid: product.guid,
    productName: product.name,
    productCode: product.code ?? null,
    quantity: '1',
    packageGuid: pack?.guid ?? null,
    manualPrice: '',
    discountPercent: '',
    comment: '',
    basePrice: product.basePrice ?? null,
    currency: product.currency ?? null,
    priceSource: product.priceMatch?.source ? `${product.priceMatch.source}:${product.priceMatch.level ?? ''}` : null,
    packages,
  };
}
