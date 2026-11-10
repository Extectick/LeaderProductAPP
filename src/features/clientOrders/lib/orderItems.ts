import type { ClientOrder, ClientOrderItem } from '@/utils/clientOrdersService';

export function getClientOrderItems(order?: Pick<ClientOrder, 'items'> | null) {
  if (!Array.isArray(order?.items)) return [];
  return order.items.filter((item): item is ClientOrderItem => {
    if (!item || typeof item !== 'object') return false;
    const product = item.product;
    return !!product && typeof product === 'object' && !!product.guid;
  });
}

export function getClientOrderItemsCount(order?: Pick<ClientOrder, 'items' | 'itemsCount'> | null) {
  const explicit = Number(order?.itemsCount);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return getClientOrderItems(order).filter(item => !item.isCancelled).length;
}
