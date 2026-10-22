import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StockMovementRow } from '../src/features/stockBalances/StockMovementRow';
import { movementPresentation } from '../src/features/stockBalances/receiptPresentation';
import type { StockMovement } from '../src/features/stockBalances/products';
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', StyleSheet: { create: (s: any) => s, hairlineWidth: 1 } }));
jest.mock('react-native-paper', () => ({ Text: 'Text' }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }));
const sale: StockMovement = { id: 'sale', direction: 'expense', operationKind: 'Реализация товаров и услуг',
  document: { type: 'РасходныйОрдерНаТовары', typeName: 'Расходный ордер', guid: 'd', number: 'УТ-20', date: '2026-10-22' },
  movementAt: '2026-10-22T10:00:00', warehouse: { guid: 'w', name: 'Омск' }, characteristic: '', quantity: 5,
  baseDocuments: [], counterparty: 'Клиент', writeOffArticles: [], price: 100, amount: 500, currency: '643',
  costBasis: 'VAT_INCLUDED', costStatus: 'DOCUMENT', costReason: '' };
it('labels sales, but does not relabel writeoffs as sales', () => {
  expect(movementPresentation(sale).operation).toBe('Продажа');
  expect(movementPresentation({ ...sale, operationKind: 'Списание недостач товаров' }).operation).toBe('Списание недостач товаров');
});
it('uses receiving warehouse explicitly provided by an outgoing transfer', () => {
  const transfer = { ...sale.document, type: 'ПеремещениеТоваров', number: 'НОУТ-5' };
  expect(movementPresentation({ ...sale, baseDocuments: [transfer], counterparty: 'В: Новосибирск' }))
    .toMatchObject({ transfer: true, source: 'Омск', destination: 'Новосибирск', document: transfer, operation: 'Перемещение' });
  expect(movementPresentation({ ...sale, baseDocuments: [transfer], counterparty: 'Из: Новосибирск' }).destination).toBeUndefined();
});
it('does not interpret a customer name as a destination warehouse', () => {
  expect(movementPresentation({ ...sale, counterparty: 'В: Клиент' })).toMatchObject({ transfer: false, source: 'Омск', destination: undefined });
});
it('renders compact sales with client icon, negative quantity, and no visible price captions', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(React.createElement(StockMovementRow, { item: sale, unit: 'кг' })); });
  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('account-outline'); expect(text).toContain('−'); expect(text).toContain('Цена продажи, с НДС');
  const labels = renderer.root.findAllByType('Text' as any).map(node => node.children.join(''));
  expect(labels).toContain('Продажа УТ-20'); expect(labels).toContain('Клиент');
  expect(labels).not.toContain('Сумма'); expect(labels).not.toContain('Цена продажи, с НДС');
  expect(text).not.toContain('2026-10-22');
  act(() => renderer.unmount());
});
