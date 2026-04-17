import {
  type ClientOrder,
  type ClientOrderItem,
  type ClientOrderProduct,
  type ClientOrdersReferenceData,
} from '@/utils/clientOrdersService';

export const DEFAULT_ORDER_CURRENCY = 'RUB';

type DraftUnit = { guid?: string | null; name?: string | null; symbol?: string | null };
type DraftPackage = {
  guid: string;
  name: string;
  multiplier?: number | null;
  isDefault?: boolean;
  unit?: DraftUnit | null;
};

export type DraftItem = {
  key: string;
  productGuid: string;
  productName: string;
  productCode?: string | null;
  productArticle?: string | null;
  productSku?: string | null;
  productIsWeight?: boolean | null;
  quantity: string;
  packageGuid?: string | null;
  manualPrice: string;
  discountPercent: string;
  comment: string;
  basePrice?: number | null;
  receiptPrice?: number | null;
  currency?: string | null;
  priceSource?: string | null;
  priceTypeGuid?: string | null;
  priceTypeName?: string | null;
  baseUnit?: DraftUnit | null;
  stock?: ClientOrderProduct['stock'] | null;
  packages: DraftPackage[];
};

export type DraftOrder = {
  guid?: string | null;
  revision: number;
  organizationGuid: string;
  counterpartyGuid: string;
  agreementGuid: string;
  contractGuid: string;
  warehouseGuid: string;
  deliveryAddressGuid: string;
  deliveryDate?: string | null;
  comment: string;
  currency: string;
  priceTypeGuid?: string | null;
  priceTypeName?: string | null;
  generalDiscountPercent: string;
  items: DraftItem[];
};

export type ClientOrdersFilters = {
  search: string;
  status: string;
  counterpartyGuid: string;
};

export type LayoutTier = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'wide';
export type EditorPaneTier = 'cards' | 'compact' | 'medium' | 'wide';

export type ClientOrdersResponsiveMetrics = {
  pageX: number;
  pageY: number;
  stackGap: number;
  panelPadding: number;
  panelRadius: number;
  listPaneWidth: number;
  titleSize: number;
  subtitleSize: number;
  sectionTitleSize: number;
  actionButtonSize: number;
  actionIconSize: number;
  actionGap: number;
  fieldHeight: number;
  fieldFontSize: number;
  fieldLabelSize: number;
  fieldGap: number;
  chipFontSize: number;
  cardPadding: number;
  cardGap: number;
  cardTitleSize: number;
  cardMetaSize: number;
  toolbarGap: number;
  toolbarSearchMaxWidth: number;
  tableCellX: number;
  tableCellY: number;
  itemTitleSize: number;
  itemMetaSize: number;
  itemMaxLines: number;
  narrowRowGap: number;
  narrowControlHeight: number;
  narrowQtyWidth: number;
  narrowPackageWidth: number;
  narrowPriceWidth: number;
  itemsBottomInset: number;
  compactStaticFieldHorizontalPadding: number;
  dialogRadius: number;
  dialogPadding: number;
  stickyOffset: number;
};

export function resolveClientOrdersLayoutTier(width: number): LayoutTier {
  if (width < 760) return 'phone';
  if (width < 1024) return 'tablet';
  if (width < 1280) return 'laptop';
  if (width < 1600) return 'desktop';
  return 'wide';
}

export function resolveClientOrdersEditorTier(width: number): EditorPaneTier {
  if (width < 900) return 'cards';
  if (width < 1180) return 'compact';
  if (width < 1440) return 'medium';
  return 'wide';
}

export function getClientOrdersResponsiveMetrics(
  layoutTier: LayoutTier,
  editorTier: EditorPaneTier,
): ClientOrdersResponsiveMetrics {
  const listPaneWidth =
    layoutTier === 'wide' ? 330
      : layoutTier === 'desktop' ? 300
        : layoutTier === 'laptop' ? 280
          : layoutTier === 'tablet' ? 320
            : 0;
  const fieldHeight =
    layoutTier === 'phone' ? 38
      : layoutTier === 'tablet' ? 40
        : layoutTier === 'laptop' ? 32
          : 31;
  const fieldFontSize =
    layoutTier === 'phone' ? 14
      : layoutTier === 'tablet' ? 13
        : layoutTier === 'laptop' ? 11.5
          : 11;
  const actionButtonSize =
    layoutTier === 'phone' ? 34
      : layoutTier === 'tablet' ? 36
        : layoutTier === 'laptop' ? 34
          : 33;
  const actionIconSize =
    layoutTier === 'phone' ? 18
      : layoutTier === 'tablet' ? 19
        : layoutTier === 'laptop' ? 18
          : 17;

  return {
    pageX: layoutTier === 'phone' ? 8 : layoutTier === 'tablet' ? 10 : 10,
    pageY: layoutTier === 'phone' ? 8 : 10,
    stackGap: layoutTier === 'phone' ? 10 : layoutTier === 'tablet' ? 10 : 9,
    panelPadding: layoutTier === 'phone' ? 12 : layoutTier === 'tablet' ? 12 : 11,
    panelRadius: layoutTier === 'phone' ? 16 : 18,
    listPaneWidth,
    titleSize: layoutTier === 'phone' ? 17 : layoutTier === 'tablet' ? 18 : layoutTier === 'laptop' ? 17 : 16,
    subtitleSize: layoutTier === 'phone' ? 11 : layoutTier === 'tablet' ? 12 : 11,
    sectionTitleSize: layoutTier === 'phone' ? 14 : layoutTier === 'tablet' ? 15 : 14,
    actionButtonSize,
    actionIconSize,
    actionGap: layoutTier === 'phone' ? 6 : layoutTier === 'tablet' ? 8 : 6,
    fieldHeight,
    fieldFontSize,
    fieldLabelSize: layoutTier === 'phone' ? 9 : 10,
    fieldGap: layoutTier === 'phone' ? 8 : layoutTier === 'tablet' ? 9 : 8,
    chipFontSize: layoutTier === 'phone' ? 10 : layoutTier === 'tablet' ? 11 : 10,
    cardPadding: layoutTier === 'phone' ? 10 : layoutTier === 'tablet' ? 12 : 10,
    cardGap: layoutTier === 'phone' ? 6 : 7,
    cardTitleSize: layoutTier === 'phone' ? 14 : layoutTier === 'tablet' ? 16 : 15,
    cardMetaSize: layoutTier === 'phone' ? 11 : 12,
    toolbarGap: layoutTier === 'phone' ? 8 : layoutTier === 'tablet' ? 10 : 8,
    toolbarSearchMaxWidth:
      editorTier === 'wide' ? 360
        : editorTier === 'medium' ? 320
          : editorTier === 'compact' ? 280
            : 9999,
    tableCellX:
      editorTier === 'wide' ? 0.35
        : editorTier === 'medium' ? 0.28
          : 0.2,
    tableCellY:
      editorTier === 'wide' ? 0.35
        : editorTier === 'medium' ? 0.3
          : 0.28,
    itemTitleSize:
      layoutTier === 'phone' ? 14
        : editorTier === 'compact' ? 12
          : 13,
    itemMetaSize: layoutTier === 'phone' ? 11 : layoutTier === 'tablet' ? 12 : 11,
    itemMaxLines:
      editorTier === 'cards' ? 3
        : editorTier === 'compact' ? 3
          : 2,
    narrowRowGap: layoutTier === 'phone' ? 4 : 7,
    narrowControlHeight: layoutTier === 'phone' ? 28 : 28,
    narrowQtyWidth: layoutTier === 'phone' ? 94 : 116,
    narrowPackageWidth: layoutTier === 'phone' ? 64 : 78,
    narrowPriceWidth: layoutTier === 'phone' ? 66 : 80,
    itemsBottomInset: layoutTier === 'phone' ? 96 : layoutTier === 'tablet' ? 72 : 24,
    compactStaticFieldHorizontalPadding: layoutTier === 'phone' ? 8 : 10,
    dialogRadius: layoutTier === 'phone' ? 18 : 22,
    dialogPadding: layoutTier === 'phone' ? 12 : layoutTier === 'tablet' ? 14 : 12,
    stickyOffset: layoutTier === 'phone' ? 6 : 8,
  };
}

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
    organizationGuid: '',
    counterpartyGuid: '',
    agreementGuid: '',
    contractGuid: '',
    warehouseGuid: '',
    deliveryAddressGuid: '',
    deliveryDate: null,
    comment: '',
    currency: DEFAULT_ORDER_CURRENCY,
    priceTypeGuid: null,
    priceTypeName: null,
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

function normalizeDecimalSeparator(value: string) {
  return value.trim().replace(',', '.');
}

function decimalRegex(maxDecimals: number) {
  return new RegExp(`^\\d+(?:[,.]\\d{1,${maxDecimals}})?$`);
}

function decimalInputRegex(maxDecimals: number) {
  return new RegExp(`^\\d*(?:[,.]\\d{0,${maxDecimals}})?$`);
}

export function normalizeQuantityInput(item: DraftItem, value: string) {
  const next = value.replace(/\s/g, '');
  if (next === '') return '';
  if (isWeightDraftItem(item)) {
    return decimalInputRegex(3).test(next) ? next : item.quantity;
  }
  return /^\d*$/.test(next) ? next : item.quantity;
}

export function normalizePriceInput(value: string, previous = '') {
  const next = value.replace(/\s/g, '');
  if (next === '') return '';
  return decimalInputRegex(2).test(next) ? next : previous;
}

export function normalizeQuantityForPayload(item: DraftItem) {
  return Number(normalizeDecimalSeparator(item.quantity));
}

export function normalizePriceForPayload(value: string) {
  return Number(normalizeDecimalSeparator(value));
}

export function getDraftItemUnit(item: DraftItem) {
  const pack = item.packageGuid ? item.packages.find((next) => next.guid === item.packageGuid) : null;
  return pack?.unit ?? item.baseUnit ?? null;
}

function isKgUnit(unit?: { name?: string | null; symbol?: string | null } | null) {
  const text = `${unit?.symbol ?? ''} ${unit?.name ?? ''}`.toLowerCase();
  return text.includes('кг') || text.includes('kg') || text.includes('килограмм');
}

export function isWeightDraftItem(item: DraftItem) {
  return !!item.productIsWeight || isKgUnit(getDraftItemUnit(item));
}

export function isValidQuantityValue(item: DraftItem) {
  const value = item.quantity.trim();
  if (!value) return false;
  const validShape = isWeightDraftItem(item) ? decimalRegex(3).test(value) : /^\d+$/.test(value);
  return validShape && normalizeQuantityForPayload(item) > 0;
}

export function isValidManualPriceValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return decimalRegex(2).test(trimmed) && normalizePriceForPayload(trimmed) > 0;
}

export function formatMoney(value?: number | null, currency?: string | null) {
  if (value === null || value === undefined) return '—';
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  const label = (currency || DEFAULT_ORDER_CURRENCY).toUpperCase() === 'RUB' ? 'руб' : (currency || DEFAULT_ORDER_CURRENCY);
  return `${formatted} ${label}`;
}

export function formatDateTime(value?: string | Date | null) {
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
    organizationGuid: order.organization?.guid ?? '',
    counterpartyGuid: order.counterparty?.guid ?? '',
    agreementGuid: order.agreement?.guid ?? '',
    contractGuid: order.contract?.guid ?? '',
    warehouseGuid: order.warehouse?.guid ?? '',
    deliveryAddressGuid: order.deliveryAddress?.guid ?? '',
    deliveryDate: order.deliveryDate ?? null,
    comment: order.comment ?? '',
    currency: DEFAULT_ORDER_CURRENCY,
    priceTypeGuid: order.agreement?.priceType?.guid ?? order.items.find((item) => item.priceType?.guid)?.priceType?.guid ?? null,
    priceTypeName: order.agreement?.priceType?.name ?? order.items.find((item) => item.priceType?.name)?.priceType?.name ?? null,
    generalDiscountPercent: asString(order.generalDiscountPercent),
    items: order.items.map((item: ClientOrderItem) => ({
      key: makeKey(),
      productGuid: item.product.guid,
      productName: item.product.name,
      productCode: item.product.code ?? null,
      productArticle: item.product.article ?? null,
      productSku: item.product.sku ?? null,
      productIsWeight: item.product.isWeight ?? null,
      quantity: asString(item.quantity),
      packageGuid: item.package?.guid ?? null,
      manualPrice: asString(item.manualPrice),
      discountPercent: asString(item.discountPercent),
      comment: item.comment ?? '',
      basePrice: item.basePrice ?? null,
      receiptPrice: item.basePrice ?? null,
      currency: DEFAULT_ORDER_CURRENCY,
      priceSource: item.priceSource ?? null,
      priceTypeGuid: item.priceType?.guid ?? order.agreement?.priceType?.guid ?? null,
      priceTypeName: item.priceType?.name ?? order.agreement?.priceType?.name ?? null,
      baseUnit: item.unit ?? null,
      stock: item.stock ?? null,
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
  const quantity = normalizeQuantityForPayload(item);
  const manual = item.manualPrice.trim() ? normalizePriceForPayload(item.manualPrice) : undefined;
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

  if (!draft.organizationGuid) {
    return {
      canSave: false,
      canAutosave: false,
      blockingMessage: 'Выберите организацию.',
      itemMessages,
    };
  }

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
    const quantity = isValidQuantityValue(item) ? normalizeQuantityForPayload(item) : Number.NaN;
    const manualPrice = item.manualPrice.trim() ? normalizePriceForPayload(item.manualPrice) : undefined;
    const manualPriceShapeValid = isValidManualPriceValue(item.manualPrice);
    const discountPercent = item.discountPercent.trim() ? asNumber(item.discountPercent) : undefined;

    if (Number.isNaN(quantity) || quantity <= 0) {
      messages.push('Количество должно быть больше 0.');
    }
    if (manualPrice !== undefined && (Number.isNaN(manualPrice) || manualPrice <= 0)) {
      messages.push('Ручная цена должна быть больше 0.');
    }
    if (!manualPriceShapeValid) {
      messages.push('Цена: число больше 0, до 2 знаков после запятой.');
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

export function buildPayload(draft: DraftOrder, saveReason: 'manual' | 'autosave' = 'manual') {
  const validation = validateDraft(draft);
  if (!validation.canSave) {
    throw new Error(validation.blockingMessage || 'Проверьте заполнение заказа.');
  }

  const generalDiscountPercent = draft.generalDiscountPercent.trim() ? asNumber(draft.generalDiscountPercent) : undefined;

  return {
    organizationGuid: draft.organizationGuid,
    counterpartyGuid: draft.counterpartyGuid,
    agreementGuid: draft.agreementGuid || null,
    contractGuid: draft.contractGuid || null,
    warehouseGuid: draft.warehouseGuid || null,
    deliveryAddressGuid: draft.deliveryAddressGuid || null,
    deliveryDate: draft.deliveryDate || undefined,
    comment: draft.comment.trim() || undefined,
    currency: DEFAULT_ORDER_CURRENCY,
    saveReason,
    generalDiscountPercent,
    items: draft.items.map((item) => ({
      productGuid: item.productGuid,
      packageGuid: item.packageGuid || undefined,
      priceTypeGuid: item.manualPrice.trim() ? undefined : item.priceTypeGuid || undefined,
      quantity: normalizeQuantityForPayload(item),
      manualPrice: item.manualPrice.trim() ? normalizePriceForPayload(item.manualPrice) : undefined,
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
    productArticle: product.article ?? null,
    productSku: product.sku ?? null,
    productIsWeight: product.isWeight ?? null,
    quantity: '1',
    packageGuid: pack?.guid ?? null,
    manualPrice: '',
    discountPercent: '',
    comment: '',
    basePrice: product.basePrice ?? null,
    receiptPrice: product.receiptPrice ?? product.basePrice ?? null,
    currency: DEFAULT_ORDER_CURRENCY,
    priceSource: product.priceMatch?.source ? `${product.priceMatch.source}:${product.priceMatch.level ?? ''}` : null,
    priceTypeGuid: product.priceType?.guid ?? null,
    priceTypeName: product.priceType?.name ?? null,
    baseUnit: product.baseUnit ?? null,
    stock: product.stock ?? null,
    packages,
  };
}
