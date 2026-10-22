import { isVisibleStockReceipt, movementDay, movementDayLabel, receiptPresentation } from '../src/features/stockBalances/receiptPresentation';
import type { StockMovement } from '../src/features/stockBalances/products';
const receipt = { movementAt: '2026-10-22T00:01:00', document: { type: 'ПриходныйОрдерНаТовары', typeName: 'Приходный ордер на товары', number: 'УТ-1' },
  baseDocuments: [], operationKind: 'Приобретение товаров и услуг', counterparty: 'Из: Поставщик' } as unknown as StockMovement;
it('groups by physical movement day without UTC conversion', () => expect(movementDay(receipt)).toBe('2026-10-22'));
it('formats today, yesterday, old years and month boundaries', () => {
  const now = new Date(2026, 0, 1, 12);
  expect(movementDayLabel('2026-01-01', now)).toBe('Сегодня, 1 января');
  expect(movementDayLabel('2025-12-31', now)).toBe('Вчера, 31 декабря 2025');
  expect(movementDayLabel('2025-12-30', now)).toBe('30 декабря 2025');
});
it('does not treat supplier prefix as a transfer', () => {
  expect(receiptPresentation(receipt)).toMatchObject({ transfer: false, source: undefined, operation: 'Поступление' });
});
it('uses explicit transfer source and linked transfer number', () => {
  const base = { ...receipt.document, type: 'ПеремещениеТоваров', number: 'НОУТ-24' };
  expect(receiptPresentation({ ...receipt, baseDocuments: [base], counterparty: 'Из: Переработка Омск' })).toMatchObject({ transfer: true, source: 'Переработка Омск', document: base });
});
it('never guesses a missing transfer source or ambiguous document', () => {
  const base = { ...receipt.document, type: 'ПеремещениеТоваров' };
  expect(receiptPresentation({ ...receipt, baseDocuments: [base, base], counterparty: 'Неизвестно' })).toMatchObject({ transfer: true, source: undefined, document: receipt.document });
});
it('excludes customer-order movements without dropping actual receipts, transfers or returns', () => {
  const order={...receipt.document,type:'ЗаказКлиента',typeName:'Заказ клиента'};
  expect(isVisibleStockReceipt({...receipt,document:order})).toBe(false);
  expect(isVisibleStockReceipt({...receipt,baseDocuments:[order],operationKind:'Заказ клиента'})).toBe(false);
  expect(isVisibleStockReceipt({...receipt,baseDocuments:[order]})).toBe(true);
  expect(isVisibleStockReceipt({...receipt,operationKind:'Возврат товаров от клиента'})).toBe(true);
  expect(isVisibleStockReceipt({...receipt,operationKind:'Перемещение товаров'})).toBe(true);
});
