import type { ClientOrderProduct } from '../utils/clientOrdersService';
import { mergeHydratedPickerProducts, pausePendingPickerProducts, mergeRefreshedProductPage, fillUnknownSelectedProduct, productFreshnessLabel, productMetricFreshness, productMetricPending } from '../src/features/clientOrders/lib/productFreshness';
import { buildNewItem, normalizeDraftOrder, validateDraft } from '../src/features/clientOrders/lib/clientOrdersShared';
import { applyProductPickerQuantity } from '../src/features/clientOrders/lib/productPickerQuantity';

const product: ClientOrderProduct = { guid: 'p', name: 'Товар', packages: [], basePrice: null, stock: null,
  freshness: { source: 'local-read-model', catalogCheckedAt: null, commercialCheckedAt: null,
    stale: true, commercialPending: true, priceStatus: 'unknown', stockStatus: 'unknown' } };

test('unknown values remain unknown in presentation and newly added drafts', () => {
  expect(productMetricFreshness(product, 'price', 'Цена', '0 ₽').value).toBe('—');
  expect(productMetricFreshness(product, 'stock', 'Остаток', '0 шт').value).toBe('—');
  expect(productFreshnessLabel(product)).toContain('требуют уточнения');
  expect(buildNewItem(product)).toMatchObject({basePrice: null, stock: null, receiptPrice: null});
  const line = buildNewItem(product);
  const validation = validateDraft(normalizeDraftOrder({organizationGuid: 'org', counterpartyGuid: 'client',
    agreementGuid: 'agreement', contractGuid: 'contract', warehouseGuid: 'warehouse',
    deliveryAddressGuid: 'address', deliveryDate: '2026-11-18T00:00:00Z', items: [line]}));
  expect(validation.canSave).toBe(true);
  expect(validation.canSubmit).toBe(false);
  expect(validation.itemMessages[line.key]).toContain('Цена не получена. Укажите цену в строке заказа.');
});

test('snapshot prices/stock carry a check time and never look like live confirmed values', () => {
  const snapshot: ClientOrderProduct = {...product, freshness: {...product.freshness!, stale: false,
    commercialPending: false, priceStatus: 'snapshot', stockStatus: 'snapshot', commercialCheckedAt: '2026-11-17T10:00:00Z'}};
  expect(productMetricFreshness(snapshot, 'price', 'Цена', '100 ₽').value).toBe('≈ 100 ₽');
  expect(productMetricFreshness(snapshot, 'stock', 'Остаток', '0 шт').value).toBe('≈ 0 шт');
  expect(productFreshnessLabel(snapshot)).toContain('Данные на');
  expect(productMetricFreshness({...product, freshness: undefined}, 'price', 'Цена', '100 ₽')).toEqual({title: 'Цена', value: '100 ₽'});
});

test('quantity changes from unknown search data preserve an existing draft commercial snapshot', () => {
  const line = {...buildNewItem({...product, basePrice: 100, stock: {available: 10}}), quantity: '2', manualPrice: '120'};
  const [next] = applyProductPickerQuantity([line], product, {delta: 1});
  expect(next).toMatchObject({quantity: '3', basePrice: 100, manualPrice: '120', stock: {available: 10}});
  expect(line.quantity).toBe('2');
});


test('a fresh selling price cannot relabel older stock or receipt cost timestamps', () => {
  const snapshot = {...product, freshness: {...product.freshness!, commercialCheckedAt: '2026-11-17T10:00:00Z',
    stockStatus: 'snapshot' as const, receiptPriceStatus: 'snapshot' as const,
    stockCheckedAt: '2026-11-15T10:00:00Z', receiptPriceCheckedAt: null}};
  expect(productMetricFreshness(snapshot, 'stock', 'Остаток', '10 шт').title).toContain('15.11.2026');
  expect(productMetricFreshness(snapshot, 'cost', 'Себестоимость', '100 ₽').title).not.toContain('17.11.2026');
});

test('refresh fills only unknown selected values and preserves known selection fields', () => {
  const selected = {...product, receiptPrice: 30, stock: {available: 5}, weight: 2};
  expect(fillUnknownSelectedProduct(selected, {...product, basePrice: 100, receiptPrice: 40, stock: null, weight: 3}))
    .toMatchObject({basePrice: 100, receiptPrice: 30, stock: {available: 5}, weight: 2});
  expect(fillUnknownSelectedProduct({...selected, basePrice: 90}, {...product, basePrice: 100}).basePrice).toBe(90);
  expect(fillUnknownSelectedProduct(selected, {...product, guid: 'other'})).toBe(selected);
});


test('page refresh removes server-suppressed cards while keeping other pages and appending new matches', () => {
  const current = ['a', 'b', 'c', 'd'].map(guid => ({guid}));
  expect(mergeRefreshedProductPage(current, new Set(['a', 'b']), [{guid: 'b'}, {guid: 'e'}]).map(item => item.guid))
    .toEqual(['b', 'c', 'd', 'e']);
  expect(mergeRefreshedProductPage(current, new Set(['a', 'b']), []).map(item => item.guid)).toEqual(['c', 'd']);
});


test('pending stock uses the same effective numeric value as its display, preserving known zero', () => {
  expect(productMetricPending({...product, stock: {available: null, quantity: null} as any}, 'stock')).toBe(true);
  expect(productMetricPending({...product, stock: {available: 0}}, 'stock')).toBe(false);
  expect(productMetricPending({...product, stock: {quantity: 0} as any}, 'stock')).toBe(false);
  expect(productMetricPending({...product, freshness: {...product.freshness!, commercialPending: false}}, 'stock')).toBe(false);
});


test('exhausted refresh stops skeletons but keeps unknown values and a recovery explanation', () => {
  const paused = {...product, freshness: {...product.freshness!, refreshPaused: true}};
  expect(productMetricPending(paused, 'price')).toBe(false);
  expect(productMetricFreshness(paused, 'price', 'Цена', '0 ₽')).toEqual({title:'Цена: обновление не завершено, повторите поиск', value:'—'});
  expect(productFreshnessLabel(paused)).toContain('Повторите');
  expect(paused.freshness.commercialPending).toBe(true);
});

test('loading another page in a 1,200-product picker updates only pending rows', () => {
  const settled = Array.from({length: 1200}, (_, i) => ({
    ...product, guid: String(i), freshness: {...product.freshness!, commercialPending: false},
  }));
  expect(pausePendingPickerProducts(settled)).toBe(settled);
  const mixed = settled.map((p, i) => i === 1100 ? {...p, freshness: {...p.freshness, receiptPricePending: true}} : p);
  const paused = pausePendingPickerProducts(mixed);
  expect(paused.filter((p, i) => p !== mixed[i])).toHaveLength(1);
  expect(paused[1100].freshness?.refreshPaused).toBe(true);
  expect(pausePendingPickerProducts(paused)).toBe(paused);
});

test('offline price hydration preserves identities outside its 24-product batch', () => {
  const rows = Array.from({length: 1200}, (_, i) => ({...product, guid: String(i)}));
  const fresh = rows.slice(-24).map(p => ({...p, basePrice: 45}));
  const changed = mergeHydratedPickerProducts(rows, fresh);
  expect(changed.filter((p, i) => p !== rows[i])).toHaveLength(24);
  expect(changed.slice(-24).every(p => p.basePrice === 45)).toBe(true);
  expect(mergeHydratedPickerProducts(rows, [{...product, guid: 'out-of-page'}])).toBe(rows);
  expect(mergeHydratedPickerProducts(rows, [])).toBe(rows);
});
