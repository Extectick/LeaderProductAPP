import { applyProductPickerQuantity, parsePickerQuantity, productPickerQuantity } from '../src/features/clientOrders/lib/productPickerQuantity';
import { buildNewItem } from '../src/features/clientOrders/lib/clientOrdersShared';
import type { ClientOrderProduct } from '../utils/clientOrdersService';

const product: ClientOrderProduct = { guid: 'eel', name: 'Угорь', code: 'УТ-1', packages: [], isWeight: true,
  baseUnit: { guid: 'kg', name: 'Килограмм', symbol: 'кг' }, basePrice: 1650, receiptPrice: 1290 };
const line = (quantity: number, extra = {}) => ({ ...buildNewItem(product), quantity: String(quantity), ...extra });

describe('product picker quantities', () => {
  it('adds one unit immediately and does not duplicate the line on rapid increments', () => {
    let items = [] as ReturnType<typeof line>[];
    for (let index = 0; index < 30; index++) items = applyProductPickerQuantity(items, product, { delta: 1 });
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe('30');
    expect(items[0].receiptPrice).toBe(1290);
  });
  it('subtracts and removes at zero without affecting other products or cancelled lines', () => {
    const other = line(3, { productGuid: 'other' });
    const cancelled = line(7, { isCancelled: true });
    const next = applyProductPickerQuantity([line(0.5), other, cancelled], product, { delta: -1 });
    expect(next).toEqual([other, cancelled]);
    expect(applyProductPickerQuantity(next, product, { delta: -1 })).toEqual(next);
  });
  it('edits exact decimal quantities without floating point drift', () => {
    let items = [line(0.1)];
    for (let index = 0; index < 10; index++) items = applyProductPickerQuantity(items, product, { delta: 1 });
    expect(items[0].quantity).toBe('10.1');
    expect(applyProductPickerQuantity(items, product, { quantity: 2.375 })[0].quantity).toBe('2.375');
  });
  it('counts all active lines, preserves prices and comments, and reduces from the last line', () => {
    const first = line(2, { manualPrice: '1550', comment: 'special' });
    const second = line(3, { manualPrice: '1600' });
    expect(productPickerQuantity([first, second, line(10, { isCancelled: true })], product).quantity).toBe(5);
    const next = applyProductPickerQuantity([first, second], product, { quantity: 3 });
    expect(next[0]).toBe(first);
    expect(next[1]).toEqual({ ...second, quantity: '1' });
  });
  it('preserves fractional-weight packages when the base quantity can be represented exactly', () => {
    const pack = { guid: 'box', name: 'Коробка', multiplier: 5, unit: { symbol: 'кор' } };
    const packed = line(2, { packageGuid: 'box', packages: [pack] });
    expect(productPickerQuantity([packed], product).quantity).toBe(10);
    expect(applyProductPickerQuantity([packed], product, { delta: 1 })[0]).toMatchObject({ packageGuid: 'box', quantity: '2.2' });
  });
  it('adds one piece beside a piece-box, not one box or an invalid fraction of a box', () => {
    const pieces = { ...product, isWeight: false, baseUnit: { guid: 'pc', name: 'Штука', symbol: 'шт' } };
    const packed = { ...buildNewItem(pieces), packageGuid: 'box', packages: [{ guid: 'box', name: 'Коробка', multiplier: 6 }], quantity: '2', manualPrice: '1500', discountPercent: '5' };
    const next = applyProductPickerQuantity([packed], pieces, { delta: 1 });
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(packed);
    expect(next[1]).toMatchObject({ quantity: '1', packageGuid: null, manualPrice: '1500', discountPercent: '5' });
    expect(productPickerQuantity(next, pieces)).toMatchObject({ quantity: 13, unit: 'шт' });
    const reduced = applyProductPickerQuantity([packed], pieces, { delta: -1 });
    expect(reduced[0]).toMatchObject({ quantity: '11', packageGuid: null });
  });
  it('uses the default package unit if the base unit is unknown', () => {
    const packaged = { ...product, baseUnit: null, isWeight: false, packages: [{ guid: 'box', name: 'Коробка', multiplier: 6, isDefault: true, unit: { guid: 'boxUnit', name: 'Коробка', symbol: 'кор' } }] };
    const next = applyProductPickerQuantity([], packaged, { delta: 1 });
    expect(next[0]).toMatchObject({ quantity: '1', packageGuid: 'box' });
    expect(productPickerQuantity(next, packaged)).toMatchObject({ quantity: 1, unit: 'кор' });
  });
  it.each(['', '-1', 'abc', '1e4', 'Infinity', '1,2345', '1,2,3', '1000000000'])('rejects invalid manual input %s', input => {
    expect(parsePickerQuantity(input, true)).toBeNull();
  });
  it('accepts a comma for weight, but only integers for pieces', () => {
    expect(parsePickerQuantity('3,5', true)).toBe(3.5);
    expect(parsePickerQuantity('3,5', false)).toBeNull();
    expect(parsePickerQuantity('0', false)).toBe(0);
  });
  it('does not mutate original items and ignores non-finite quantities', () => {
    const original = Object.freeze(line(2));
    const items = [original];
    expect(applyProductPickerQuantity(items, product, { quantity: NaN })).toBe(items);
    applyProductPickerQuantity(items, product, { delta: 1 });
    expect(original.quantity).toBe('2');
  });
});
