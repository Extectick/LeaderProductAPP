import type { IncomingCost } from './products';
import { stockMoney } from './stockMoney';

export function incomingCostText(cost: IncomingCost | null | undefined, unit: string) {
  if (!cost || !Number.isFinite(cost.price) || cost.price <= 0 || cost.source !== 'RECEIPT_PRICE') return '—';
  return `${stockMoney(cost.price, cost.currency)}${unit ? `/${unit}` : ''}`;
}
export function incomingCostHint(cost: IncomingCost | null | undefined) {
  return cost ? 'Текущая общая входящая цена за единицу хранения, как в подборе товаров.' : 'Текущая входящая цена недоступна. Потяните список вниз для обновления.';
}
export function availableQuantity(item: { available: number | null; availableForManager?: number | null; myReserved?: number }) {
  if (item.availableForManager !== undefined) return item.availableForManager;
  return typeof item.available !== 'number' || !Number.isFinite(item.available) ? null : item.available + (item.myReserved ?? 0);
}
