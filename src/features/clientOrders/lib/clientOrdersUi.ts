import type {
  ClientOrderCounterpartyOption,
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

export function getPickerItemMeta(kind: ClientOrdersPickerKind | null, item: any) {
  if (kind === 'counterparty' || kind === 'filterCounterparty') {
    return item?.fullName || '';
  }
  if (kind === 'product') {
    return [item?.code, item?.article, item?.sku].filter(Boolean).join(' • ');
  }
  return item?.fullName || item?.fullAddress || item?.number || item?.code || item?.article || item?.inn || '';
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

export function pickerNeedsCounterparty(kind: ClientOrdersPickerKind | null) {
  return kind === 'agreement' || kind === 'contract' || kind === 'deliveryAddress' || kind === 'product';
}

export function unitLabel(unit: any) {
  return unit?.symbol || unit?.name || 'шт';
}

export function packageLabel(pack: any, item?: any) {
  const unit = pack?.unit?.symbol || pack?.unit?.name || item?.baseUnit?.symbol || item?.baseUnit?.name || '';
  return [pack?.name, unit].filter(Boolean).join(' / ') || unitLabel(item?.baseUnit) || 'Упаковка';
}

export function hasSinglePackage(item: any) {
  return !item?.packages?.length || item.packages.length === 1;
}

export function getPackageDisplayText(item: any) {
  if (!item?.packages?.length) return unitLabel(item?.baseUnit);
  if (item.packages.length === 1) return packageLabel(item.packages[0], item);
  const selectedPack = item.packageGuid ? item.packages.find((pack: any) => pack.guid === item.packageGuid) : null;
  return selectedPack ? packageLabel(selectedPack, item) : unitLabel(item.baseUnit);
}

export function formatStockLabel(stock: any, baseUnit?: any) {
  const available = stock?.available ?? stock?.quantity;
  if (available === null || available === undefined) return '';
  const unit = baseUnit?.symbol || baseUnit?.name || 'шт';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(available) || 0)} ${unit}`;
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
  return formatStockLabel(item?.stock, item?.baseUnit) || '—';
}
