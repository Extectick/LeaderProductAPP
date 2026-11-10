import { getOrderDeliveryLabel, getOrderDeliveryTitle, isOrderPickup } from '../public-order/delivery';

test.each(['Самовывоз', ' Самовывоз ', 'САМОВЫВОЗ', 'самовывоз'])('pickup %s is clearly named in the footer', deliveryMethod => {
  const order = { deliveryMethod, deliveryAddress: 'Старый адрес доставки' };
  expect(isOrderPickup(order)).toBe(true);
  expect(getOrderDeliveryTitle(order)).toBe('Самовывоз');
  expect(getOrderDeliveryLabel(order)).toBe('Самовывоз');
});

test.each([null, {}, { deliveryMethod: null }, { deliveryMethod: '' }, { deliveryMethod: 'ДоКлиента' }, { deliveryMethod: 'До клиента' }])(
  'delivery/legacy data %s is not mislabeled as pickup', order => {
    expect(isOrderPickup(order)).toBe(false);
    expect(getOrderDeliveryTitle(order)).toBe('Доставка');
  },
);

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
