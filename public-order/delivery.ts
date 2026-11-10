export type PublicOrderDelivery = { deliveryMethod?: string | null; deliveryAddress?: string | null };

export function isOrderPickup(order: PublicOrderDelivery | null) {
  return order?.deliveryMethod?.trim().toLocaleLowerCase('ru-RU') === 'самовывоз';
}

export function getOrderDeliveryTitle(order: PublicOrderDelivery | null) {
  return isOrderPickup(order) ? 'Самовывоз' : 'Доставка';
}

export function getOrderDeliveryLabel(order: PublicOrderDelivery | null) {
  if (isOrderPickup(order)) return 'Самовывоз';
  return order?.deliveryAddress?.trim() || '';
}
