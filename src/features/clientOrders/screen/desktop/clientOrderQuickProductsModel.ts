import type {ClientOrderProduct} from '@/utils/clientOrdersService';
import {buildNewItem, isCancelledDraftItem, isValidQuantityValue, isWeightDraftItem, type DraftItem} from '../../lib/clientOrdersShared';

export function findQuickProductLine(product: ClientOrderProduct, items: DraftItem[]) {
  return items.find(item => item.productGuid.toLowerCase() === product.guid.toLowerCase());
}

export function quickProductTemplate(product: ClientOrderProduct, items: DraftItem[]) {
  return findQuickProductLine(product, items) || buildNewItem(product);
}

/** The quantity is in the displayed line unit: keep an existing package unchanged. */
export function quickProductAddition(product: ClientOrderProduct, items: DraftItem[], input: string):
  {kind: 'error'; message: string} | {kind: 'add'; quantity: string} | {kind: 'increment'; key: string; quantity: string} {
  const existing = findQuickProductLine(product, items);
  const line = existing || buildNewItem(product);
  if (isCancelledDraftItem(line)) return {kind: 'error', message: 'Эта строка отменена. Измените её в заказе.'};
  const quantity = input.trim().replace('.', ',');
  const value = Number(quantity.replace(',', '.'));
  if (!isValidQuantityValue({...line, quantity}) || !Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) {
    return {kind: 'error', message: isWeightDraftItem(line) ? 'Укажите количество больше 0, до трёх знаков после запятой.' : 'Укажите целое количество больше 0.'};
  }
  if (!existing) return {kind: 'add', quantity};
  if (!isValidQuantityValue(existing)) return {kind: 'error', message: 'Сначала исправьте количество этой строки в заказе.'};
  const total = Number(existing.quantity.replace(',', '.')) + value;
  if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) return {kind: 'error', message: 'Слишком большое количество.'};
  const next = isWeightDraftItem(line) ? total.toFixed(3).replace(/\.?0+$/, '').replace('.', ',') : String(total);
  return {kind: 'increment', key: existing.key, quantity: next};
}

/** Search results must never cross account, document or price/default context. */
export function quickProductScopeKey(workspace: any) {
  const d = workspace.draft;
  return JSON.stringify([workspace.offlineUserId, d.guid, d.clientOrderId, d.organizationGuid, d.counterpartyGuid,
    d.agreementGuid, d.warehouseGuid, d.priceTypeGuid, !!workspace.loadingDefaults, !!workspace.loadingDetail,
    !!workspace.readOnly, !!workspace.mutationLocked]);
}
