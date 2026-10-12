import type { ClientOrderProduct } from '@/utils/clientOrdersService';
import { buildNewItem, getPackageMultiplier, isCancelledDraftItem, isValidQuantityValue, isWeightDraftItem, type DraftItem } from './clientOrdersShared';

export type ProductQuantityChange = { delta: 1 | -1 } | { quantity: number };
const round = (value: number) => Math.round(value * 1000) / 1000;
const numberOf = (value: string) => Number(value.replace(',', '.')) || 0;
const matches = (item: DraftItem, guid: string) => item.productGuid === guid && !isCancelledDraftItem(item);

/** The picker always counts base units, never a mixture of kg and boxes. */
export function productPickerQuantity(items: readonly DraftItem[], product: ClientOrderProduct) {
  const packages = product.packages || [];
  const pack = product.baseUnit ? null : packages.find(item => item.isDefault) ?? packages[0];
  const sample = { productIsWeight: product.isWeight, baseUnit: product.baseUnit, packages, packageGuid: pack?.guid, quantity: '0' } as DraftItem;
  const scale = product.baseUnit ? 1 : getPackageMultiplier(sample);
  const unit = product.baseUnit ?? sample.packages.find(pack => pack.guid === sample.packageGuid)?.unit;
  return {
    quantity: round(items.reduce((sum, item) => matches(item, product.guid)
      ? sum + Math.max(0, numberOf(item.quantity)) * getPackageMultiplier(item) / scale : sum, 0)),
    unit: unit?.symbol || unit?.name || 'шт',
    fractional: isWeightDraftItem(sample),
    scale,
  };
}

export function parsePickerQuantity(value: string, fractional: boolean): number | null {
  const input = value.trim();
  if (!(fractional ? /^\d+(?:[,.]\d{1,3})?$/ : /^\d+$/).test(input)) return null;
  const quantity = Number(input.replace(',', '.'));
  return Number.isFinite(quantity) && quantity >= 0 && quantity <= 999999999 ? quantity : null;
}

/** Called inside the draft's functional updater, so rapid taps cannot lose increments. */
export function applyProductPickerQuantity(
  items: DraftItem[], product: ClientOrderProduct, change: ProductQuantityChange, newItem = buildNewItem(product),
): DraftItem[] {
  if (!product.guid) return items;
  const info = productPickerQuantity(items, product);
  const target = round('delta' in change ? Math.max(0, info.quantity + change.delta) : change.quantity);
  if (parsePickerQuantity(String(target), info.fractional) === null) return items;
  if (target === 0) return items.filter(item => !matches(item, product.guid));
  if (target === info.quantity) return items;
  let difference = round((target - info.quantity) * info.scale);
  const next = [...items];
  if (difference > 0) {
    // Preserve an existing line's package and commercial terms when representable.
    const index = next.findIndex(item => matches(item, product.guid)
      && isValidQuantityValue({ ...item, quantity: String(round(numberOf(item.quantity) + difference / getPackageMultiplier(item))) })
      && Math.abs(round(difference / getPackageMultiplier(item)) * getPackageMultiplier(item) - difference) < 0.000001);
    if (index >= 0) {
      const item = next[index];
      next[index] = { ...item, quantity: String(round(numberOf(item.quantity) + difference / getPackageMultiplier(item))) };
    } else {
      // For example, +1 piece next to a sealed box of 6: do not silently add a box.
      const source = next.find(item => matches(item, product.guid));
      const extra = source ? { ...source, key: newItem.key, lineGuid: newItem.lineGuid, packageGuid: newItem.packageGuid } : newItem;
      next.push({ ...extra, quantity: String(round(difference / getPackageMultiplier(extra))) });
    }
    return next;
  }
  let remaining = -difference;
  for (let index = next.length - 1; index >= 0 && remaining > 0; index--) {
    const item = next[index];
    if (!matches(item, product.guid)) continue;
    const base = round(numberOf(item.quantity) * getPackageMultiplier(item));
    const take = Math.min(base, remaining);
    const rest = round(base - take);
    remaining = round(remaining - take);
    if (rest === 0) next.splice(index, 1);
    else {
      const quantity = String(round(rest / getPackageMultiplier(item)));
      const exact = Math.abs(Number(quantity) * getPackageMultiplier(item) - rest) < 0.000001;
      // A partial piece-box is expressed in base units. Prices are already per base unit.
      const updated = exact && isValidQuantityValue({ ...item, quantity }) ? { ...item, quantity }
        : { ...item, packageGuid: null, quantity: String(rest) };
      if (!isValidQuantityValue(updated)) return items;
      next[index] = updated;
    }
  }
  return next;
}
