import { stockAvailableValue } from './clientOrdersUi';
import type { ClientOrderProduct } from '@/utils/clientOrdersService';

function checkedTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : null;
}

/** Search snapshots describe availability; they do not reserve stock or confirm a sale price. */
export function productFreshnessLabel(product: ClientOrderProduct) {
  const freshness = product.freshness;
  if (!freshness) return null;
  if (freshness.commercialPending || freshness.stale) return 'Цена и остаток требуют уточнения';
  const at = checkedTime(freshness.commercialCheckedAt);
  return at ? `Данные на ${at}` : 'Цена и остаток по последним данным';
}

export function productMetricFreshness(product: ClientOrderProduct, kind: 'price' | 'stock' | 'cost', title: string, value: string) {
  const freshness = product.freshness;
  if (!freshness) return { title, value };
  const status = kind === 'stock' ? freshness.stockStatus : kind === 'price' ? freshness.priceStatus : freshness.receiptPriceStatus;
  if (status === 'unknown' || value === '—') return { title: `${title}: данных нет, требуется уточнение`, value: '—' };
  const at = checkedTime(kind === 'price' ? freshness.commercialCheckedAt
    : kind === 'stock' ? freshness.stockCheckedAt : freshness.receiptPriceCheckedAt);
  return {
    title: `${title}: последние известные данные${at ? ` на ${at}` : ''}${freshness.stale || status === 'stale' ? ', требуется обновление' : ''}`,
    value: `≈ ${value}`,
  };
}

/** Selection membership and known commercial values survive a later search snapshot. */
export function fillUnknownSelectedProduct(selected: ClientOrderProduct, fresh: ClientOrderProduct): ClientOrderProduct {
  if (selected.guid !== fresh.guid) return selected;
  return { ...selected,
    basePrice: selected.basePrice ?? fresh.basePrice ?? null,
    priceType: selected.priceType ?? fresh.priceType,
    stock: selected.stock ?? fresh.stock ?? null,
    receiptPrice: selected.receiptPrice ?? fresh.receiptPrice ?? null,
    weight: selected.weight ?? fresh.weight ?? null,
    weightUnit: selected.weightUnit ?? fresh.weightUnit ?? null,
  };
}

/** Replace only the queried page. Missing IDs were suppressed by the server; do not retain them. */
export function mergeRefreshedProductPage<T extends {guid: string}>(current: T[], previousPage: Set<string>, fresh: T[]): T[] {
  const byGuid = new Map(fresh.map(item => [item.guid, item]));
  const merged = current.filter(item => !previousPage.has(item.guid) || byGuid.has(item.guid))
    .map(item => byGuid.get(item.guid) ?? item);
  const kept = new Set(merged.map(item => item.guid));
  return [...merged, ...fresh.filter(item => !kept.has(item.guid))];
}

export function productMetricPending(product: ClientOrderProduct, kind: 'price' | 'stock' | 'cost') {
  const pending = kind === 'cost' ? product.freshness?.receiptPricePending : product.freshness?.commercialPending;
  const value = kind === 'price' ? product.basePrice : kind === 'cost' ? product.receiptPrice : stockAvailableValue(product.stock);
  // Zero is a known value; a background refresh must never hide an existing snapshot.
  return pending === true && value == null;
}
