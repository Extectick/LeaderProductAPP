import type {ClientOrderProduct} from '@/utils/clientOrdersService';
import {buildNewItem, isCancelledDraftItem, isValidQuantityValue, isWeightDraftItem, type DraftItem} from '../../lib/clientOrdersShared';

export function priceGridQuantity(product: ClientOrderProduct | undefined, line: DraftItem | undefined, input: string) {
  const quantity = input.trim().replace('.', ',');
  if (!line && !product) return {kind: 'error' as const, message: 'Товар недоступен'};
  const template = line || buildNewItem(product!);
  if (isCancelledDraftItem(template)) return {kind: 'error' as const, message: 'Строка отменена'};
  if (/^0+(?:,0+)?$/.test(quantity)) return {kind: 'remove' as const, key: line?.key};
  const value = Number(quantity.replace(',', '.'));
  if (!isValidQuantityValue({...template, quantity}) || !Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) {
    return {kind: 'error' as const, message: isWeightDraftItem(template) ? 'Количество: до 3 знаков после запятой' : 'Введите целое количество'};
  }
  return line ? {kind: 'set' as const, key: line.key, quantity} : {kind: 'add' as const, quantity};
}
