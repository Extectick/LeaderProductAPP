import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StockMovementRow, movementDate } from '../src/features/stockBalances/StockMovementRow';
import type { StockMovement } from '../src/features/stockBalances/products';
jest.mock('react-native', () => ({ View: 'View', StyleSheet: { create: (s: any) => s, hairlineWidth: 1 } }));
jest.mock('react-native-paper', () => ({ Text: 'Text', Tooltip: 'Tooltip' }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
const item: StockMovement = { id: 'm', direction: 'receipt', operationKind: 'Приобретение товаров и услуг',
  document: { type: 'ПриходныйОрдерНаТовары', typeName: 'Приходный ордер на товары', guid: 'd', number: 'УТ-253', date: '2026-09-02' },
  movementAt: '2026-09-02T07:18:39', warehouse: { guid: 'w', name: 'Омск' }, characteristic: '', quantity: 60,
  baseDocuments: [{ type: 'ПриобретениеТоваровУслуг', typeName: 'Приобретение', guid: 'p', number: 'НОУТ-012723', date: '2026-09-02' }],
  counterparty: 'Поставщик', writeOffArticles: ['Порча'], price: 100, amount: 6000, currency: 'руб.', costBasis: 'VAT_INCLUDED',
  costStatus: 'PRELIMINARY', costReason: 'Пока не закрыт месяц' };
function render(value: StockMovement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(React.createElement(StockMovementRow, { item: value, unit: 'кг' })); });
  const text = JSON.stringify(renderer.toJSON());
  act(() => renderer.unmount());
  return text;
}
it('formats a 1C document date without timezone conversion or time', () => {
  expect(movementDate('2026-09-02')).toBe('02.09.26');
  expect(render(item)).toContain('02.09.26'); expect(render(item)).not.toContain('07:18:39');
});
it('shows VAT-included price, preliminary status, linked document and article', () => {
  const text = render(item);
  for (const value of ['Цена с НДС', 'Предварительная стоимость', 'НОУТ-012723', 'Порча', 'Поставщик']) expect(text).toContain(value);
});
it('does not display an invented zero price for unavailable costs', () => {
  const text = render({ ...item, price: null, amount: null, costStatus: 'UNAVAILABLE', costReason: 'Нет распределения стоимости' });
  expect(text).not.toContain('Цена с НДС'); expect(text).toContain('Нет распределения стоимости');
});
it('distinguishes a later physical movement date from the document date, still without time', () => {
  const text = render({ ...item, movementAt: '2026-09-08T14:00:00' });
  expect(text).toContain('Движение по складу'); expect(text).toContain('08.09.26'); expect(text).not.toContain('14:00:00');
});
