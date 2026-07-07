import type {
  ClientOrderCounterpartyOption,
  ClientOrderDeliveryAddressOption,
  ClientOrderProduct,
} from '@/utils/clientOrdersService';

export type ClientOrdersPickerKind =
  | 'filterCounterparty'
  | 'organization'
  | 'counterparty'
  | 'agreement'
  | 'contract'
  | 'warehouse'
  | 'deliveryAddress'
  | 'priceType'
  | 'product';

export function getPickerItemTitle(item: any) {
  return item?.name || item?.fullAddress || item?.number || item?.code || 'Без названия';
}

function looksLikeGuid(value?: string | null) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function getManagerLabel(item: any) {
  return item?.manager?.name || item?.managerName || item?.manager?.guid || item?.managerGuid || '';
}

export function getPickerItemMeta(kind: ClientOrdersPickerKind | null, item: any) {
  if (kind === 'counterparty' || kind === 'filterCounterparty') {
    return getCounterpartyTaxMeta(item) || item?.fullName || '';
  }
  if (kind === 'agreement' || kind === 'contract') {
    const parts: string[] = [];
    const organizationName = item?.organization?.name || item?.organizationName;
    const managerName = getManagerLabel(item);
    if (organizationName && !looksLikeGuid(organizationName)) parts.push(`Организация: ${organizationName}`);
    if (managerName) parts.push(`Менеджер: ${managerName}`);
    if (parts.length) return parts.join(' • ');
  }
  if (kind === 'product') {
    return [item?.code, item?.article, item?.sku].filter(Boolean).join(' • ');
  }
  if (kind === 'deliveryAddress') {
    return [item?.deliveryComment || item?.comment, item?.kindName || item?.contactInfoKind || (item?.deliveryNumber ? `Адрес доставки ${item.deliveryNumber}` : '')]
      .filter(Boolean)
      .join(' • ');
  }
  return '';
}

function deliveryAddressSortNumber(item?: ClientOrderDeliveryAddressOption | null) {
  const sources = [
    item?.deliveryNumber,
    item?.number,
    item?.kindName,
    item?.contactInfoKind,
    item?.name,
    item?.fullAddress,
  ];

  for (const value of sources) {
    const match = String(value ?? '').match(/\d+/);
    if (!match) continue;
    const parsed = Number(match[0]);
    if (Number.isFinite(parsed)) return parsed;
  }

  return Number.MAX_SAFE_INTEGER;
}

function deliveryAddressSortText(item?: ClientOrderDeliveryAddressOption | null) {
  return String(
    item?.kindName
      || item?.contactInfoKind
      || item?.deliveryNumber
      || item?.number
      || item?.fullAddress
      || item?.name
      || ''
  );
}

export function sortDeliveryAddressOptions<T extends ClientOrderDeliveryAddressOption>(items: readonly T[]) {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const byNumber = deliveryAddressSortNumber(left.item) - deliveryAddressSortNumber(right.item);
      if (byNumber !== 0) return byNumber;
      const byText = deliveryAddressSortText(left.item).localeCompare(deliveryAddressSortText(right.item), 'ru', {
        numeric: true,
        sensitivity: 'base',
      });
      return byText || left.index - right.index;
    })
    .map(({ item }) => item);
}

export function getCounterpartyTaxMeta(item: any) {
  return [
    item?.inn ? `ИНН ${item.inn}` : '',
    item?.kpp ? `КПП ${item.kpp}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
}

export function formatDateOnly(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function pickerNeedsOrderContext(kind: ClientOrdersPickerKind | null) {
  return kind === 'agreement' || kind === 'contract' || kind === 'warehouse' || kind === 'deliveryAddress' || kind === 'priceType' || kind === 'product';
}

export function unitLabel(unit: any) {
  return unit?.symbol || unit?.name || 'шт';
}

function formatPackageMultiplier(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric === 1) return '';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(numeric);
}

function normalizeUnitText(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '');
}

function cleanPackageName(name: string, fallbackUnit: string) {
  const parts = name
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 2 && normalizeUnitText(parts[0]) === normalizeUnitText(parts[1])) {
    return parts[0];
  }
  if (parts.length === 2 && fallbackUnit && normalizeUnitText(parts[0]) === normalizeUnitText(fallbackUnit)) {
    return parts[0];
  }
  return name;
}

export function packageLabel(pack: any, item?: any) {
  const rawName = String(pack?.name ?? '').trim();
  const packageUnit = unitLabel(pack?.unit);
  const baseUnit = unitLabel(item?.baseUnit);
  const multiplier = formatPackageMultiplier(pack?.multiplier);
  const name = rawName ? cleanPackageName(rawName, packageUnit || baseUnit) : '';

  if (name) {
    return name;
  }

  if (multiplier && baseUnit) return `${packageUnit} (${multiplier} ${baseUnit})`;
  return packageUnit || baseUnit || 'Упаковка';
}

export function hasSinglePackage(item: any) {
  return !item?.packages?.length;
}

export function getPackageDisplayText(item: any) {
  if (!item?.packages?.length) return unitLabel(item?.baseUnit);
  const selectedPack = item.packageGuid ? item.packages.find((pack: any) => pack.guid === item.packageGuid) : null;
  return selectedPack ? packageLabel(selectedPack, item) : unitLabel(item.baseUnit);
}

function formatStockNumber(value: unknown) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

export function stockAvailableValue(stock: any) {
  const available = stock?.available ?? stock?.quantity;
  return available === null || available === undefined ? null : Number(available) || 0;
}

export function stockMyReservedValue(stock: any) {
  const reserved = stock?.myReserved;
  const numeric = reserved === null || reserved === undefined ? 0 : Number(reserved) || 0;
  return numeric > 0 ? numeric : 0;
}

export function formatStockQuantity(value: unknown, baseUnit?: any) {
  if (value === null || value === undefined) return '';
  const unit = baseUnit?.symbol || baseUnit?.name || 'шт';
  return `${formatStockNumber(value)} ${unit}`;
}

export function formatStockLabel(stock: any, baseUnit?: any) {
  const available = stockAvailableValue(stock);
  if (available === null || available === undefined) return '';
  const reserve = stockMyReservedValue(stock);
  const label = formatStockQuantity(available, baseUnit);
  return reserve > 0 ? `${label} (резерв ${formatStockQuantity(reserve, baseUnit)})` : label;
}

export function formatStockReserveLabel(stock: any, baseUnit?: any) {
  const reserved = stockMyReservedValue(stock);
  return reserved > 0 ? `резерв ${formatStockQuantity(reserved, baseUnit)}` : '';
}

export function formatStockInlineLabel(stock: any, baseUnit?: any) {
  const available = stockAvailableValue(stock);
  if (available === null || available === undefined) return '';
  return formatStockLabel(stock, baseUnit);
}

export type ProductSelectionMap = Map<string, ClientOrderProduct>;

export function getProductGuid(product?: Partial<ClientOrderProduct> | null) {
  return product?.guid || null;
}

export function isProductAlreadyInOrder(product: Partial<ClientOrderProduct> | string | null | undefined, items: Array<{ productGuid?: string | null }>) {
  const guid = typeof product === 'string' ? product : getProductGuid(product);
  if (!guid) return false;
  return items.some((item) => item.productGuid === guid);
}

export function toggleProductSelection(
  current: ProductSelectionMap,
  product: ClientOrderProduct,
  orderItems: Array<{ productGuid?: string | null }>
): ProductSelectionMap {
  const guid = getProductGuid(product);
  const next = new Map(current);
  if (!guid || isProductAlreadyInOrder(guid, orderItems)) return next;
  if (next.has(guid)) {
    next.delete(guid);
  } else {
    next.set(guid, product);
  }
  return next;
}

export function removeOrderItemsFromProductSelection(
  current: ProductSelectionMap,
  orderItems: Array<{ productGuid?: string | null }>
): ProductSelectionMap {
  if (!current.size) return current;
  const existing = new Set(orderItems.map((item) => item.productGuid).filter(Boolean) as string[]);
  if (!existing.size) return current;
  let changed = false;
  const next = new Map(current);
  existing.forEach((guid) => {
    if (next.delete(guid)) changed = true;
  });
  return changed ? next : current;
}

export function getSelectedProducts(selection: ReadonlyMap<string, ClientOrderProduct>) {
  return Array.from(selection.values());
}

export function formatProductTransferLabel(count: number) {
  return `Перенести · ${Math.max(0, count)} поз.`;
}

export function transferSelectedProductsToOrder(
  selection: ReadonlyMap<string, ClientOrderProduct>,
  orderItems: Array<{ productGuid?: string | null }>,
  addProduct: (product: ClientOrderProduct, options?: { quantity?: string | number }) => string | undefined,
  options: { quantity?: string | number } = {}
) {
  const existing = new Set(orderItems.map((item) => item.productGuid).filter(Boolean) as string[]);
  const addedKeys: string[] = [];
  selection.forEach((product, guid) => {
    if (!guid || existing.has(guid)) return;
    const key = addProduct(product, options);
    if (key) addedKeys.push(key);
    existing.add(guid);
  });
  return addedKeys;
}

export function getQuantityInputWidthPx(value: unknown, minWidth: number, maxWidth: number) {
  const length = String(value ?? '').trim().length;
  const estimated = 18 + Math.max(3, length + 1) * 8;
  return Math.min(maxWidth, Math.max(minWidth, estimated));
}

export function getSelectedPickerGuid(args: {
  pickerKind: ClientOrdersPickerKind | null;
  workspace: any;
  filterCounterparty: ClientOrderCounterpartyOption | null;
  linePriceTarget: string | null;
}) {
  const { pickerKind, workspace, filterCounterparty, linePriceTarget } = args;
  if (!pickerKind) return null;
  switch (pickerKind) {
    case 'filterCounterparty':
      return filterCounterparty?.guid || null;
    case 'organization':
      return workspace.draft.organizationGuid || null;
    case 'counterparty':
      return workspace.draft.counterpartyGuid || null;
    case 'agreement':
      return workspace.draft.agreementGuid || null;
    case 'contract':
      return workspace.draft.contractGuid || null;
    case 'warehouse':
      return workspace.draft.warehouseGuid || null;
    case 'deliveryAddress':
      return workspace.draft.deliveryAddressGuid || null;
    case 'priceType':
      if (linePriceTarget) {
        const line = workspace.draft.items.find((item: any) => item.key === linePriceTarget);
        return line?.priceTypeGuid || workspace.defaultLinePriceType?.guid || null;
      }
      return workspace.draft.priceTypeGuid || workspace.selections.agreement?.priceType?.guid || null;
    default:
      return null;
  }
}

export function stockMetaText(item: ClientOrderProduct | any) {
  return formatStockInlineLabel(item?.stock, item?.baseUnit) || '—';
}
