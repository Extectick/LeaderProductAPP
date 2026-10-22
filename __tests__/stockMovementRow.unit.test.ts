import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StockMovementRow, movementDate } from '../src/features/stockBalances/StockMovementRow';
import type { StockMovement } from '../src/features/stockBalances/products';
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', StyleSheet: { create: (s: any) => s, hairlineWidth: 1 } }));
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
  expect(render(item)).not.toContain('02.09.26'); expect(render(item)).not.toContain('07:18:39');
});
it('shows compact receipt and supplier icon without captions or repeated dates', () => {
  const text = render(item);
  for (const value of ['office-building-outline', 'Поставщик', '₽/кг']) expect(text).toContain(value);
  expect(text).not.toContain('help-circle-outline');
  expect(text).not.toContain('Предварительная стоимость');
});
it('does not display an invented zero price for unavailable costs', () => {
  const text = render({ ...item, price: null, amount: null, costStatus: 'UNAVAILABLE', costReason: 'Нет распределения стоимости' });
  expect(text).not.toContain('0 ₽'); expect(text).toContain('Пояснение стоимости');
});
it('normalizes the 1C numeric ruble code in both unit price and amount', () => {
  const text = render({...item,currency:'643'}).replace(/\u00a0/g,' ');
  expect(text).toContain('100 ₽/кг');
  expect(text).toContain('6 000 ₽');
  expect(text).not.toContain('643');
});
it('labels document sales prices as sales, not incoming cost', () => {
  const text = render({ ...item, direction: 'expense', costStatus: 'DOCUMENT' });
  expect(text).toContain('Цена продажи, с НДС');
  expect(text).not.toContain('Входящая, с НДС');
});
it('preserves a known zero price and does not invent the missing amount', () => {
  const text = render({ ...item, price: 0, amount: null });
  expect(text).toContain('0 ₽/кг');
  expect(text).toContain('—');
});
it('keeps dates out of collapsed sales rows and reveals physical date in details', () => {
  const value: StockMovement = { ...item, direction: 'expense', movementAt: '2026-09-08T14:00:00' };
  expect(render(value)).not.toContain('Движение по складу');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(React.createElement(StockMovementRow, { item: value, unit: 'кг' })); });
  act(() => renderer.root.findAllByType('Pressable' as any).find(button => button.props.accessibilityLabel.startsWith('Документ:'))!.props.onPress());
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('Движение по складу'); expect(text).toContain('2026-09-08'); expect(text).not.toContain('14:00:00');
  act(() => renderer.unmount());
});
it('opens the cost explanation and full document details on demand', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(React.createElement(StockMovementRow, { item: {...item, costStatus: 'UNAVAILABLE', costReason: 'Нет распределения стоимости'}, unit: 'кг' })); });
  const buttons = renderer.root.findAllByType('Pressable' as any);
  act(() => buttons.find(button => button.props.accessibilityLabel === 'Пояснение стоимости')!.props.onPress());
  expect(JSON.stringify(renderer.toJSON())).toContain('Нет распределения стоимости');
  act(() => buttons.find(button => button.props.accessibilityLabel.startsWith('Документ:'))!.props.onPress());
  expect(JSON.stringify(renderer.toJSON())).toContain('НОУТ-012723');
  expect(JSON.stringify(renderer.toJSON())).toContain('Порча');
  act(() => renderer.unmount());
});
it('does not show customer-order references in receipt details', () => {
  let renderer!:TestRenderer.ReactTestRenderer;
  const order={...item.document,type:'ЗаказКлиента',typeName:'Заказ клиента',guid:'order',number:'ORDER-HIDDEN'};
  act(()=>{renderer=TestRenderer.create(React.createElement(StockMovementRow,{item:{...item,baseDocuments:[...item.baseDocuments,order]},unit:'кг'}));});
  act(()=>renderer.root.findAllByType('Pressable' as any).find(b=>b.props.accessibilityLabel.startsWith('Документ:'))!.props.onPress());
  expect(JSON.stringify(renderer.toJSON())).not.toContain('ORDER-HIDDEN');
  expect(JSON.stringify(renderer.toJSON())).toContain('НОУТ-012723');
  act(()=>renderer.unmount());
});
