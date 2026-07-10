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
  weight?: number | null;
  weightUnit?: DraftUnit | null;
  isDefault?: boolean;
  unit?: DraftUnit | null;
};

export type DraftItem = {
  key: string;
  lineGuid: string;
  productGuid: string;
  productName: string;
  productCode?: string | null;
  productArticle?: string | null;
  productSku?: string | null;
  productIsWeight?: boolean | null;
  productWeight?: number | null;
  weightUnit?: DraftUnit | null;
  imageThumbUrl?: string | null;
  imagePreviewUrl?: string | null;
  imageHash?: string | null;
  images?: ClientOrderProduct['images'];
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
  isCancelled?: boolean;
  cancelReasonGuid?: string | null;
  cancelReasonName?: string | null;
  cancelReason?: string | null;
  cancelledAmount?: number | null;
  baseUnit?: DraftUnit | null;
  stock?: ClientOrderProduct['stock'] | null;
  packagesLoaded?: boolean;
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
  paymentForm?: string | null;
  deliveryMethod?: string | null;
  comment: string;
  currency: string;
  priceTypeGuid?: string | null;
  priceTypeName?: string | null;
  generalDiscountPercent: string;
  items: DraftItem[];
};

export type ClientOrdersFilters = {
  search: string;
  statuses: string[];
  counterpartyGuid: string;
  amountMin: string;
  amountMax: string;
  deliveryDateFrom: string;
  deliveryDateTo: string;
  updatedFrom: string;
  updatedTo: string;
  itemsMin: string;
  itemsMax: string;
  syncState: string;
  organizationGuid: string;
  warehouseGuid: string;
  priceTypeGuid: string;
  hasNumber1c: string;
  onlyProblems: boolean;
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
  canSubmit: boolean;
  blockingMessage: string | null;
  itemMessages: Record<string, string[]>;
  itemWarnings: Record<string, string[]>;
  warningMessage: string | null;
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  QUEUED: 'В очереди',
  SENT_TO_1C: 'Создан в 1С',
  AWAITING_APPROVAL: 'Ожидается согласование',
  AWAITING_ADVANCE_BEFORE_SUPPLY: 'Ожидается аванс до обеспечения',
  READY_FOR_SUPPLY: 'Готов к обеспечению',
  AWAITING_PREPAYMENT_BEFORE_SHIPMENT: 'Ожидается предоплата до отгрузки',
  AWAITING_SUPPLY: 'Ожидается обеспечение',
  READY_FOR_SHIPMENT: 'Готов к отгрузке',
  SHIPPING_IN_PROGRESS: 'В процессе отгрузки',
  AWAITING_PAYMENT_AFTER_SHIPMENT: 'Ожидается оплата после отгрузки',
  READY_TO_CLOSE: 'Готов к закрытию',
  NOT_CONFIRMED: 'Не согласован',
  TO_SUPPLY: 'К обеспечению',
  TO_SHIP: 'К отгрузке',
  IN_RESERVE: 'В резерве',
  TO_FULFILLMENT: 'К выполнению',
  CONFIRMED: 'Подтвержден',
  PARTIAL: 'Частично выполнен',
  COMPLETED: 'Выполнен',
  CLOSED: 'Закрыт',
  REJECTED: 'Отклонен',
  CANCELLED: 'Отменен',
};

export function mapOnecOrderStatus(value?: string | null) {
  const normalized = (value || '').trim().toLocaleLowerCase('ru').replace(/\s+/g, '');
  if (!normalized) return null;
  if (normalized.includes('ожидаетсясоглас')) return 'AWAITING_APPROVAL';
  if (normalized.includes('ожидаетсяавансдообеспеч')) return 'AWAITING_ADVANCE_BEFORE_SUPPLY';
  if (normalized.includes('готовкобеспеч')) return 'READY_FOR_SUPPLY';
  if (normalized.includes('ожидаетсяпредоплатадоотгруз')) return 'AWAITING_PREPAYMENT_BEFORE_SHIPMENT';
  if (normalized.includes('ожидаетсяобеспеч')) return 'AWAITING_SUPPLY';
  if (normalized.includes('готовкотгруз')) return 'READY_FOR_SHIPMENT';
  if (normalized.includes('впроцессеотгруз')) return 'SHIPPING_IN_PROGRESS';
  if (normalized.includes('ожидаетсяоплатапослеотгруз')) return 'AWAITING_PAYMENT_AFTER_SHIPMENT';
  if (normalized.includes('готовкзакры')) return 'READY_TO_CLOSE';
  if (normalized.includes('котгруз')) return 'TO_SHIP';
  if (normalized.includes('кобеспеч')) return 'TO_SUPPLY';
  if (normalized.includes('резерв')) return 'IN_RESERVE';
  if (normalized.includes('квыполн')) return 'TO_FULFILLMENT';
  if (normalized.includes('отмен')) return 'CANCELLED';
  if (normalized.includes('отклон')) return 'REJECTED';
  if (normalized.includes('несоглас') || normalized.includes('неподтверж')) return 'NOT_CONFIRMED';
  if (normalized.includes('частич')) return 'PARTIAL';
  if (normalized.includes('выполн')) return 'COMPLETED';
  if (normalized.includes('закры')) return 'CLOSED';
  if (normalized.includes('подтверж')) return 'CONFIRMED';
  return null;
}

export function getOrderDisplayStatus(order?: Pick<ClientOrder, 'status' | 'number1c' | 'origin' | 'status1c' | 'currentState1c' | 'documentStatus1c'> | null) {
  if (!order) return 'DRAFT';
  const onecText = order.currentState1c || order.status1c;
  const isOnecBacked = Boolean(order.number1c || order.origin === 'onec' || order.origin === 'merged');
  if (isOnecBacked && onecText) {
    return mapOnecOrderStatus(onecText) || order.status || onecText;
  }
  return order.status || mapOnecOrderStatus(onecText) || 'DRAFT';
}

export function getOrderDisplayStatusLabel(order?: Pick<ClientOrder, 'status' | 'number1c' | 'origin' | 'status1c' | 'currentState1c' | 'documentStatus1c'> | null) {
  if (!order) return STATUS_LABELS.DRAFT;
  const displayStatus = getOrderDisplayStatus(order);
  const onecText = order.currentState1c || order.status1c;
  return STATUS_LABELS[displayStatus] || onecText || displayStatus || STATUS_LABELS.DRAFT;
}

export function getOrderDisplayStatusLabelWithQueue(
  order?: Pick<ClientOrder, 'status' | 'syncState' | 'number1c' | 'origin' | 'status1c' | 'currentState1c' | 'documentStatus1c' | 'queuePosition'> | null
) {
  if (!order) return STATUS_LABELS.DRAFT;
  if (order.syncState === 'ERROR') return SYNC_LABELS.ERROR;
  if (order.syncState === 'CONFLICT') return SYNC_LABELS.CONFLICT;
  if (order.syncState === 'CANCEL_REQUESTED') return SYNC_LABELS.CANCEL_REQUESTED;
  const position = Number(order.queuePosition || 0);
  const displayStatus = getOrderDisplayStatus(order);
  if (position > 0 && order.syncState === 'QUEUED') {
    return `В очереди: ${position}`;
  }
  return getOrderDisplayStatusLabel(order);
}

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

export function makeLineGuid() {
  return makeKey();
}

function formatLocalDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeClientOrderDateOnly(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : formatLocalDateOnly(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : formatLocalDateOnly(parsed);
}

export function getDefaultClientOrderDeliveryDate(now = new Date()) {
  return formatLocalDateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
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
    paymentForm: null,
    deliveryMethod: null,
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

export function asInputString(value: unknown) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

export function manualPriceInput(item?: Pick<DraftItem, 'manualPrice'> | null) {
  return asInputString(item?.manualPrice);
}

export function hasManualPrice(item?: Pick<DraftItem, 'manualPrice'> | null) {
  return manualPriceInput(item).trim().length > 0;
}

export function isCancelledDraftItem(item?: Pick<DraftItem, 'isCancelled'> | null) {
  return !!item?.isCancelled;
}

export function getDraftItemCancelReason(item?: Pick<DraftItem, 'cancelReason' | 'cancelReasonName'> | null) {
  return asInputString(item?.cancelReason || item?.cancelReasonName).trim();
}

export function normalizeDraftItem(item: DraftItem): DraftItem {
  return {
    ...item,
    key: asInputString(item.key) || makeKey(),
    lineGuid: asInputString(item.lineGuid) || makeLineGuid(),
    productGuid: asInputString(item.productGuid),
    productName: asInputString(item.productName),
    quantity: asInputString(item.quantity).replace(/\./g, ','),
    manualPrice: asInputString(item.manualPrice),
    discountPercent: asInputString(item.discountPercent),
    comment: asInputString(item.comment),
    isCancelled: !!item.isCancelled,
    packagesLoaded: !!item.packagesLoaded,
    packages: Array.isArray(item.packages) ? item.packages : [],
  };
}

export function normalizeDraftOrder(draft: DraftOrder): DraftOrder {
  const items = Array.isArray(draft.items)
    ? draft.items
        .filter((item): item is DraftItem => !!item && typeof item === 'object')
        .map(normalizeDraftItem)
    : [];

  return {
    ...draft,
    organizationGuid: asInputString(draft.organizationGuid),
    counterpartyGuid: asInputString(draft.counterpartyGuid),
    agreementGuid: asInputString(draft.agreementGuid),
    contractGuid: asInputString(draft.contractGuid),
    warehouseGuid: asInputString(draft.warehouseGuid),
    deliveryAddressGuid: asInputString(draft.deliveryAddressGuid),
    deliveryDate: normalizeClientOrderDateOnly(draft.deliveryDate),
    paymentForm: asInputString(draft.paymentForm) || null,
    deliveryMethod: asInputString(draft.deliveryMethod) || null,
    comment: asInputString(draft.comment),
    currency: asInputString(draft.currency) || DEFAULT_ORDER_CURRENCY,
    generalDiscountPercent: asInputString(draft.generalDiscountPercent),
    items,
  };
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
  const next = value.replace(/\s/g, '').replace(/\./g, ',');
  const previous = item.quantity.replace(/\./g, ',');
  if (next === '') return '';
  if (isWeightDraftItem(item)) {
    return decimalInputRegex(3).test(next) ? next : previous;
  }
  return /^\d*$/.test(next) ? next : previous;
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

function roundMoneyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function priceInputString(value: number) {
  return String(roundMoneyValue(value));
}

function normalizeUnitToken(value?: string | null) {
  const token = asInputString(value)
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/[().]/g, '')
    .replace(/\s+/g, '');
  if (!token) return '';
  if (['pce', 'pc', 'pcs', 'piece', 'pieces', 'шт', 'штука', 'штуки', 'штук'].includes(token)) return 'piece';
  if (['kg', 'kgs', 'кг', 'килограмм', 'килограмма', 'килограммы'].includes(token)) return 'kg';
  return token;
}

function unitLabelIdentities(unit?: DraftUnit | null) {
  const labels = [
    normalizeUnitToken(unit?.symbol),
    normalizeUnitToken(unit?.name),
    normalizeUnitToken(`${unit?.symbol ?? ''}${unit?.name ?? ''}`),
  ].filter(Boolean);
  return new Set(labels);
}

function sameUnitIdentity(left?: DraftUnit | null, right?: DraftUnit | null) {
  const leftGuid = asInputString(left?.guid).trim().toLowerCase();
  const rightGuid = asInputString(right?.guid).trim().toLowerCase();
  if (leftGuid && rightGuid && leftGuid === rightGuid) return true;
  const leftLabels = unitLabelIdentities(left);
  const rightLabels = unitLabelIdentities(right);
  for (const label of leftLabels) {
    if (rightLabels.has(label)) return true;
  }
  return false;
}

export function isBaseUnitPackage(pack?: DraftPackage | null, baseUnit?: DraftUnit | null) {
  if (!pack) return false;
  const multiplier = Number(pack.multiplier ?? 1);
  const sameMultiplier = !Number.isFinite(multiplier) || multiplier <= 0 || Math.abs(multiplier - 1) < 0.000001;
  const sameUnit = sameUnitIdentity(pack.unit, baseUnit);
  return sameMultiplier && (!pack.unit || sameUnit);
}

export function getDraftPackagesForProduct(product: { packages?: DraftPackage[] | null; baseUnit?: DraftUnit | null }) {
  const packages = Array.isArray(product.packages) ? product.packages : [];
  return product.baseUnit
    ? packages.filter((pack) => !isBaseUnitPackage(pack, product.baseUnit))
    : packages;
}

export function mergeDraftPackagesForProduct(
  product: { packages?: DraftPackage[] | null; baseUnit?: DraftUnit | null },
  currentPackages: DraftPackage[] = [],
  fallbackBaseUnit?: DraftUnit | null
) {
  const baseUnit = product.baseUnit ?? fallbackBaseUnit ?? null;
  const result = new Map<string, DraftPackage>();
  const pushPackage = (pack?: DraftPackage | null) => {
    if (!pack?.guid || result.has(pack.guid)) return;
    if (isBaseUnitPackage(pack, baseUnit)) return;
    result.set(pack.guid, pack);
  };

  getDraftPackagesForProduct({ packages: product.packages, baseUnit }).forEach(pushPackage);
  currentPackages.forEach(pushPackage);
  return Array.from(result.values());
}

export function normalizePackageGuid(packageGuid: string | null | undefined, packages: DraftPackage[]) {
  if (!packageGuid) return null;
  return packages.some((pack) => pack.guid === packageGuid) ? packageGuid : null;
}

export function getSelectedPackage(item?: DraftItem | null) {
  if (!item) return null;
  return item.packageGuid ? item.packages.find((next) => next.guid === item.packageGuid) ?? null : null;
}

export function getPackageMultiplier(item?: DraftItem | null) {
  const multiplier = Number(getSelectedPackage(item)?.multiplier ?? 1);
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

export function getDisplayedUnitPriceValue(item?: DraftItem | null) {
  if (!item) return '';
  const manualPrice = manualPriceInput(item);
  const sourcePrice = manualPrice.trim()
    ? normalizePriceForPayload(manualPrice)
    : item.basePrice ?? null;
  if (sourcePrice === null || sourcePrice === undefined || Number.isNaN(sourcePrice) || sourcePrice <= 0) {
    return '0';
  }
  return priceInputString(sourcePrice * getPackageMultiplier(item));
}

export function getEffectiveBasePrice(item?: DraftItem | null) {
  if (!item) return null;
  const manualPrice = manualPriceInput(item);
  const sourcePrice = manualPrice.trim()
    ? normalizePriceForPayload(manualPrice)
    : item.basePrice ?? null;
  if (sourcePrice === null || sourcePrice === undefined || Number.isNaN(sourcePrice)) return null;
  return sourcePrice;
}

export function getDisplayedReceiptPriceValue(item?: DraftItem | null) {
  if (!item) return '';
  const receiptPrice = item.receiptPrice;
  if (receiptPrice === null || receiptPrice === undefined || Number.isNaN(receiptPrice) || receiptPrice <= 0) return '';
  return priceInputString(receiptPrice * getPackageMultiplier(item));
}

export function getBelowCostWarning(item: DraftItem) {
  const price = getEffectiveBasePrice(item);
  const receiptPrice = item.receiptPrice ?? null;
  if (price === null || price <= 0 || receiptPrice === null || receiptPrice === undefined || receiptPrice <= 0) return null;
  if (price >= receiptPrice) return null;
  const multiplier = getPackageMultiplier(item);
  const priceLabel = formatMoney(price * multiplier, item.currency);
  const costLabel = formatMoney(receiptPrice * multiplier, item.currency);
  return `Цена ниже себестоимости: ${priceLabel} < ${costLabel}.`;
}

function formatQuantityLabel(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

export function getStockShortageMessage(item: DraftItem) {
  const available = item.stock?.available ?? item.stock?.quantity;
  if (available === null || available === undefined || !Number.isFinite(available)) return null;
  if (!isValidQuantityValue(item)) return null;

  const requiredBase = normalizeQuantityForPayload(item) * getPackageMultiplier(item);
  if (!Number.isFinite(requiredBase) || requiredBase <= 0) return null;
  if (available + 0.000001 >= requiredBase) return null;

  return `Недостаточно остатка: требуется ${formatQuantityLabel(requiredBase)}, доступно ${formatQuantityLabel(available)}.`;
}

export function displayedUnitPriceToBasePriceInput(value: string, item: DraftItem) {
  if (!value.trim()) return '';
  const displayedPrice = normalizePriceForPayload(value);
  if (!Number.isFinite(displayedPrice)) return value;
  return priceInputString(displayedPrice / getPackageMultiplier(item));
}

export function getDraftItemUnit(item: DraftItem) {
  const pack = getSelectedPackage(item);
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

export function isValidManualPriceValue(value: unknown) {
  const trimmed = asInputString(value).trim();
  if (!trimmed) return true;
  return decimalRegex(2).test(trimmed) && normalizePriceForPayload(trimmed) > 0;
}

export function formatMoney(value?: number | null, currency?: string | null) {
  if (value === null || value === undefined) return '—';
  const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  const label = (currency || DEFAULT_ORDER_CURRENCY).toUpperCase() === 'RUB' ? '₽' : (currency || DEFAULT_ORDER_CURRENCY);
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

export function getClientOrderItems(order?: Pick<ClientOrder, 'items'> | null) {
  if (!Array.isArray((order as any)?.items)) return [];
  return (order as ClientOrder).items.filter((item): item is ClientOrderItem => {
    if (!item || typeof item !== 'object') return false;
    const product = (item as ClientOrderItem).product;
    return !!product && typeof product === 'object' && !!product.guid;
  });
}

export function getClientOrderItemsCount(order?: Pick<ClientOrder, 'items' | 'itemsCount'> | null) {
  const explicit = Number((order as any)?.itemsCount);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return getClientOrderItems(order as any).filter((item) => !item.isCancelled).length;
}

export function orderToDraft(order: ClientOrder): DraftOrder {
  const orderItems = getClientOrderItems(order);
  const headerPriceType = order.priceType ?? orderItems.find((item) => item.priceType?.guid)?.priceType ?? order.agreement?.priceType ?? null;
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
    paymentForm: order.paymentForm ?? null,
    deliveryMethod: order.deliveryMethod ?? null,
    comment: order.comment ?? '',
    currency: DEFAULT_ORDER_CURRENCY,
    priceTypeGuid: headerPriceType?.guid ?? null,
    priceTypeName: headerPriceType?.name ?? null,
    generalDiscountPercent: asString(order.generalDiscountPercent),
    items: orderItems.map((item: ClientOrderItem) => {
      const productPackages = Array.isArray((item.product as any)?.packages)
        ? (item.product as any).packages
        : [];
      const hasProductPackages = productPackages.length > 0;
      const productBaseUnit = (item.product as any)?.baseUnit ?? (!item.package?.guid ? item.unit : null);
      const draftPackage = item.package?.guid
        ? {
            guid: item.package.guid,
            name: item.package.name ?? 'Упаковка',
            multiplier: item.package.multiplier ?? null,
            weight: (item.package as any)?.weight ?? null,
            weightUnit: (item.package as any)?.weightUnit ?? null,
            isDefault: true,
            unit: item.unit ?? null,
          }
        : null;
      const packageComparisonBaseUnit = productBaseUnit ?? item.unit ?? null;
      const selectedPackage = draftPackage && !isBaseUnitPackage(draftPackage, packageComparisonBaseUnit)
        ? draftPackage
        : null;
      const packages = mergeDraftPackagesForProduct(
        { packages: productPackages, baseUnit: productBaseUnit },
        selectedPackage ? [selectedPackage] : [],
        productBaseUnit
      );

      return {
        key: makeKey(),
        lineGuid: item.lineGuid || makeLineGuid(),
        productGuid: item.product.guid,
        productName: item.product.name,
        productCode: item.product.code ?? null,
        productArticle: item.product.article ?? null,
        productSku: item.product.sku ?? null,
        productIsWeight: item.product.isWeight ?? null,
        productWeight: (item.product as any)?.weight ?? null,
        weightUnit: (item.product as any)?.weightUnit ?? null,
        imageThumbUrl: item.product.imageThumbUrl ?? null,
        imagePreviewUrl: item.product.imagePreviewUrl ?? null,
        imageHash: item.product.imageHash ?? null,
        images: item.product.images ?? [],
        quantity: asString(item.quantity),
        packageGuid: selectedPackage?.guid ?? null,
        manualPrice: asString(item.manualPrice),
        discountPercent: asString(item.discountPercent),
        comment: item.comment ?? '',
        basePrice: item.basePrice ?? null,
        receiptPrice: item.basePrice ?? null,
        currency: DEFAULT_ORDER_CURRENCY,
        priceSource: item.priceSource ?? null,
        priceTypeGuid: item.priceType?.guid ?? headerPriceType?.guid ?? null,
        priceTypeName: item.priceType?.name ?? headerPriceType?.name ?? null,
        isCancelled: item.isCancelled ?? false,
        cancelReasonGuid: item.cancelReasonGuid ?? null,
        cancelReasonName: item.cancelReasonName ?? null,
        cancelReason: item.cancelReason ?? null,
        cancelledAmount: item.cancelledAmount ?? null,
        baseUnit: productBaseUnit,
        stock: item.stock ?? null,
        packagesLoaded: hasProductPackages,
        packages,
      };
    }),
  };
}

export function computeLineTotal(item: DraftItem, generalDiscountPercent?: string) {
  if (isCancelledDraftItem(item)) return 0;
  const quantity = normalizeQuantityForPayload(item);
  const manualPrice = manualPriceInput(item);
  const manual = manualPrice.trim() ? normalizePriceForPayload(manualPrice) : undefined;
  const discount = item.discountPercent.trim()
    ? asNumber(item.discountPercent)
    : generalDiscountPercent?.trim()
      ? asNumber(generalDiscountPercent)
      : 0;
  const price = manual ?? item.basePrice ?? 0;
  if (Number.isNaN(quantity)) return 0;
  return quantity * getPackageMultiplier(item) * price * (1 - (Number.isNaN(discount) ? 0 : discount) / 100);
}

export function computeLineProfit(item: DraftItem, generalDiscountPercent?: string) {
  if (isCancelledDraftItem(item)) return 0;
  const quantity = normalizeQuantityForPayload(item);
  if (Number.isNaN(quantity)) return 0;

  const receiptPrice = item.receiptPrice ?? 0;
  const cost = receiptPrice > 0 ? quantity * getPackageMultiplier(item) * receiptPrice : 0;
  return computeLineTotal(item, generalDiscountPercent) - cost;
}

export function computeLineWeight(item: DraftItem) {
  if (isCancelledDraftItem(item)) return 0;
  const quantity = normalizeQuantityForPayload(item);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  const selectedPackage = getSelectedPackage(item);
  const packageWeight = Number(selectedPackage?.weight ?? 0);
  if (Number.isFinite(packageWeight) && packageWeight > 0) {
    return quantity * packageWeight;
  }

  const productWeight = Number(item.productWeight ?? 0);
  if (!Number.isFinite(productWeight) || productWeight <= 0) return 0;
  return quantity * getPackageMultiplier(item) * productWeight;
}

export function computeDraftTotal(draft: DraftOrder) {
  return draft.items.reduce((sum, item) => sum + computeLineTotal(item, draft.generalDiscountPercent), 0);
}

export function computeDraftProfit(draft: DraftOrder) {
  return draft.items.reduce((sum, item) => sum + computeLineProfit(item, draft.generalDiscountPercent), 0);
}

export function computeDraftWeight(draft: DraftOrder) {
  return draft.items.reduce((sum, item) => sum + computeLineWeight(item), 0);
}

export function validateDraft(draft: DraftOrder): DraftValidation {
  const itemMessages: Record<string, string[]> = {};
  const itemWarnings: Record<string, string[]> = {};
  let hasSaveBlockingItemErrors = false;

  if (!draft.organizationGuid) {
    return {
      canSave: false,
      canAutosave: false,
      canSubmit: false,
      blockingMessage: 'Выберите организацию.',
      itemMessages,
      itemWarnings,
      warningMessage: null,
    };
  }

  if (!draft.counterpartyGuid) {
    return {
      canSave: false,
      canAutosave: false,
      canSubmit: false,
      blockingMessage: 'Выберите контрагента.',
      itemMessages,
      itemWarnings,
      warningMessage: null,
    };
  }

  const activeItems = draft.items.filter((item) => !isCancelledDraftItem(item));

  if (!activeItems.length) {
    return {
      canSave: false,
      canAutosave: false,
      canSubmit: false,
      blockingMessage: 'Добавьте хотя бы одну строку заказа.',
      itemMessages,
      itemWarnings,
      warningMessage: null,
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
      canSubmit: false,
      blockingMessage: 'Общая скидка должна быть в диапазоне 0-100.',
      itemMessages,
      itemWarnings,
      warningMessage: null,
    };
  }

  for (const item of activeItems) {
    const messages: string[] = [];
    const warnings: string[] = [];
    const quantity = isValidQuantityValue(item) ? normalizeQuantityForPayload(item) : Number.NaN;
    const manualPriceInputValue = manualPriceInput(item);
    const manualPrice = manualPriceInputValue.trim() ? normalizePriceForPayload(manualPriceInputValue) : undefined;
    const manualPriceShapeValid = isValidManualPriceValue(manualPriceInputValue);
    const discountPercent = item.discountPercent.trim() ? asNumber(item.discountPercent) : undefined;
    const selectedPackageMissing = !!item.packageGuid && !getSelectedPackage(item);
    const effectivePrice = getEffectiveBasePrice(item);

    if (Number.isNaN(quantity) || quantity <= 0) {
      messages.push('Количество должно быть больше 0.');
    }
    if (selectedPackageMissing) {
      messages.push('Выбранная упаковка недоступна для товара.');
      hasSaveBlockingItemErrors = true;
    }
    if (manualPrice === undefined && (effectivePrice === null || effectivePrice <= 0)) {
      messages.push('Цена должна быть больше 0.');
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
    const stockShortageMessage = getStockShortageMessage(item);
    if (stockShortageMessage) {
      messages.push(stockShortageMessage);
    }
    if (messages.length) {
      itemMessages[item.key] = messages;
    }
    const belowCostWarning = getBelowCostWarning(item);
    if (belowCostWarning) warnings.push(belowCostWarning);
    if (warnings.length) {
      itemWarnings[item.key] = warnings;
    }
  }

  const hasItemErrors = Object.keys(itemMessages).length > 0;
  const hasWarnings = Object.keys(itemWarnings).length > 0;
  const missingSubmitFields: string[] = [];
  if (!draft.agreementGuid) missingSubmitFields.push('соглашение');
  if (!draft.contractGuid) missingSubmitFields.push('договор');
  if (!draft.warehouseGuid) missingSubmitFields.push('склад');
  if (!draft.deliveryAddressGuid) missingSubmitFields.push('адрес доставки');
  if (!draft.deliveryDate) missingSubmitFields.push('дату отгрузки');
  const submitHeaderBlockingMessage = missingSubmitFields.length
    ? `Заполните ${missingSubmitFields.join(', ')}.`
    : null;
  const blockingMessage = hasSaveBlockingItemErrors
    ? 'Исправьте строки с недоступной упаковкой.'
    : submitHeaderBlockingMessage
      ? submitHeaderBlockingMessage
      : hasItemErrors
        ? 'Исправьте ошибки в строках заказа.'
        : null;
  return {
    canSave: !hasSaveBlockingItemErrors,
    canAutosave: !hasSaveBlockingItemErrors,
    canSubmit: !hasItemErrors && !submitHeaderBlockingMessage,
    blockingMessage,
    itemMessages,
    itemWarnings,
    warningMessage: hasWarnings ? 'Есть товары с ценой ниже себестоимости.' : null,
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
    priceTypeGuid: draft.priceTypeGuid || null,
    deliveryDate: draft.deliveryDate || undefined,
    paymentForm: draft.paymentForm || null,
    deliveryMethod: draft.deliveryMethod || null,
    comment: draft.comment.trim() || undefined,
    currency: DEFAULT_ORDER_CURRENCY,
    saveReason,
    generalDiscountPercent,
    items: draft.items.map((item) => ({
      lineGuid: item.lineGuid || item.key,
      productGuid: item.productGuid,
      packageGuid: item.packageGuid || undefined,
      priceTypeGuid: hasManualPrice(item) ? undefined : item.priceTypeGuid || undefined,
      quantity: normalizeQuantityForPayload(item),
      basePrice: hasManualPrice(item) ? undefined : item.basePrice ?? undefined,
      manualPrice: hasManualPrice(item) ? normalizePriceForPayload(manualPriceInput(item)) : undefined,
      discountPercent: item.discountPercent.trim() ? asNumber(item.discountPercent) : undefined,
      comment: item.comment.trim() || undefined,
      isCancelled: item.isCancelled ?? false,
      cancelReasonGuid: item.cancelReasonGuid || undefined,
      cancelReasonName: item.cancelReasonName || undefined,
      cancelReason: item.cancelReason || undefined,
      cancelledAmount: item.cancelledAmount ?? undefined,
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

export function buildNewItem(product: ClientOrderProduct, options?: { quantity?: string | number }): DraftItem {
  const packages = getDraftPackagesForProduct(product);
  const pack = product.baseUnit ? null : packages.find((item) => item.isDefault) ?? packages[0] ?? null;
  const quantity = options?.quantity === undefined ? '1' : String(options.quantity);
  return {
    key: makeKey(),
    lineGuid: makeLineGuid(),
    productGuid: product.guid,
    productName: product.name,
    productCode: product.code ?? null,
    productArticle: product.article ?? null,
    productSku: product.sku ?? null,
    productIsWeight: product.isWeight ?? null,
    productWeight: product.weight ?? null,
    weightUnit: product.weightUnit ?? null,
    imageThumbUrl: product.imageThumbUrl ?? null,
    imagePreviewUrl: product.imagePreviewUrl ?? null,
    imageHash: product.imageHash ?? null,
    images: product.images ?? [],
    quantity,
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
    packagesLoaded: true,
    packages,
  };
}
