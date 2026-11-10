import { formatOrderWeight, publicOrderWeight } from '../public-order/weight';
test('formats row/total kg without losing gram precision', () => {
  expect(formatOrderWeight('2.445')).toBe('2,445 кг');
  expect(formatOrderWeight('2')).toBe('2 кг');
  expect(formatOrderWeight('0.0001')).toBe('<0,001 кг');
  expect(formatOrderWeight('1234.567')).toMatch(/1.234,567 кг/);
});
test.each([null, undefined, '', 'bad', Infinity, -1, true])('missing/invalid %s is not presented as zero', value => {
  expect(formatOrderWeight(value)).toBe('—');
});
test('complete weight matches the selected design', () => {
  expect(publicOrderWeight({ totalWeightKg: '4.445', weightComplete: true,
    items: [{ weightKg: '2.445' }, { weightKg: '2' }] })).toMatchObject({ label: 'Вес заказа', value: '4,445 кг', complete: true, missing: 0 });
});
test('partial known weight is explicitly not a full order total', () => {
  const summary = publicOrderWeight({ totalWeightKg: '2.445', weightComplete: false,
    items: [{ weightKg: '2.445' }, { weightKg: null }] });
  expect(summary).toMatchObject({ label: 'Известный вес', value: '2,445 кг', complete: false, missing: 1 });
  expect(summary.description).toContain('Итог неполный');
  expect(summary.description).toContain('для 1 позиции');
});

test('does not claim missing rows when an unconfirmed total has all item weights', () => {
  expect(publicOrderWeight({ totalWeightKg: '2', weightComplete: false, items: [{ weightKg: '2' }] }).description)
    .toBe('Общий вес пока не подтверждён. Уточните у менеджера.');
});
test('old API replies and all-unknown rows show a dash, not a fabricated zero', () => {
  expect(publicOrderWeight({ items: [{}, {}] })).toMatchObject({ value: '—', complete: false, missing: 2 });
  expect(publicOrderWeight({ items: [] })).toMatchObject({ value: '—' });
});
