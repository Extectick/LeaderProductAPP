import { getOrderDeliveryLabel } from '../public-order/delivery';

test('shows the selected address without extra labels', () => {
  expect(getOrderDeliveryLabel({ deliveryMethod: 'До клиента', deliveryAddress: '  Омск, ул. Тестовая, 1  ' })).toBe('Омск, ул. Тестовая, 1');
});

test('pickup overrides an old address', () => {
  expect(getOrderDeliveryLabel({ deliveryMethod: ' Самовывоз ', deliveryAddress: 'Омск, ул. Тестовая, 1' })).toBe('Самовывоз');
});

test('missing legacy fields never imply pickup or display undefined', () => {
  for (const order of [null, {}, { deliveryMethod: null, deliveryAddress: null }, { deliveryMethod: 'До клиента', deliveryAddress: ' ' }]) {
    expect(getOrderDeliveryLabel(order)).toBe('');
  }
  expect(getOrderDeliveryLabel({ deliveryAddress: 'Омск' })).toBe('Омск');
});
