export type PublicOrderDelivery = { deliveryMethod?: string | null; deliveryAddress?: string | null };

export function getOrderDeliveryLabel(order: PublicOrderDelivery | null) {
  if (order?.deliveryMethod?.trim().toLocaleLowerCase('ru-RU') === 'самовывоз') return 'Самовывоз';
  return order?.deliveryAddress?.trim() || '';
}
