import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { SQLiteTestDatabase } from './helpers/sqliteTestDatabase';
import type { OfflineDatasetMeta } from '../src/features/clientOrders/offline/offlineOrdersDatabase';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

let directory: string;
let db: SQLiteTestDatabase;
let catalog: typeof import('../src/features/productCatalog/data/catalogDatabase');
let offline: typeof import('../src/features/clientOrders/offline/offlineOrdersDatabase');
const meta = (entity: OfflineDatasetMeta['entity']): OfflineDatasetMeta => ({
  entity, epoch: 'test', revision: '1', schemaVersion: 1, itemCount: 0,
  lastSourceUpdateAt: '2026-10-08T00:00:00Z', lastSyncedAt: '2026-10-08T00:00:00Z',
});
const product = (guid: string, name = guid) => ({ guid, name, isActive: true, revision: '1', packages: [] });
const price = (guid: string, value = 100, type = 'client-price') => ({
  syncKey: `${guid}:${type}`, productGuid: guid, priceTypeGuid: type, price: value, priority: 10,
});
const stock = (guid: string, freeAvailable = 1, warehouseGuid = 'warehouse', organizationGuid: string | null = null) => ({
  productGuid: guid, warehouseGuid, organizationGuid, freeAvailable, quantity: freeAvailable,
});
const reserve = (guid: string, reserved = 1, warehouseGuid = 'warehouse', organizationGuid: string | null = null) => ({
  syncKey: `${guid}:${warehouseGuid}:${organizationGuid}`, productGuid: guid, warehouseGuid, organizationGuid, reserved,
});
const context = { priceTypeGuid: 'client-price', warehouseGuid: 'warehouse', inStockOnly: true };
const ids = (result: Awaited<ReturnType<typeof catalog.searchCatalogProducts>>) => result?.items.map(item => item.guid);
async function products(rows: ReturnType<typeof product>[]) {
  await catalog.replaceCatalog({ epoch: 'catalog', revision: '1', schemaVersion: 1, products: rows });
}
async function dataset(entity: OfflineDatasetMeta['entity'], rows: any[], user = 'u1') {
  await offline.replaceOfflineEntity(user, meta(entity), rows);
}

beforeEach(async () => {
  jest.resetModules();
  directory = mkdtempSync(join(tmpdir(), 'leader-picker-ordering-'));
  db = new SQLiteTestDatabase(join(directory, 'catalog.db'));
  require('expo-sqlite').openDatabaseAsync.mockResolvedValue(db);
  catalog = require('../src/features/productCatalog/data/catalogDatabase');
  offline = require('../src/features/clientOrders/offline/offlineOrdersDatabase');
  expect(await catalog.getCatalogDatabase()).toBe(db);
});
afterEach(async () => {
  await db.closeAsync();
  if (dirname(directory) !== tmpdir() || !basename(directory).startsWith('leader-picker-ordering-')) {
    throw new Error('Unsafe SQLite fixture cleanup path');
  }
  rmSync(directory, { recursive: true, force: true });
});

it('ranks client-priced products across the entire catalog before pagination, without duplicates', async () => {
  await products([product('a'), product('b'), product('z1'), product('z2'), product('z3')]);
  await dataset('selling-prices', [price('z1'), price('z2'), price('z3'), { ...price('z1'), syncKey: 'second-price', priority: 1 }]);
  const c = { priceTypeGuid: 'client-price' };
  const first = await catalog.searchCatalogProducts('', 2, 0, c);
  const second = await catalog.searchCatalogProducts('', 2, 2, c);
  const third = await catalog.searchCatalogProducts('', 2, 4, c);
  expect(ids(first)).toEqual(['z1', 'z2']);
  expect(ids(second)).toEqual(['z3', 'a']);
  expect(ids(third)).toEqual(['b']);
  expect(first).toMatchObject({ hasMore: true, total: 3 });
  expect(second).toMatchObject({ hasMore: true, total: 5 });
  expect(third).toMatchObject({ hasMore: false, total: 5 });
  expect(await catalog.searchCatalogProducts('', 2, 5, c)).toMatchObject({ items: [], hasMore: false });
});

it('uses the effective price: register priority, recency and stable tie-breaker, not any positive price', async () => {
  await products([product('a-zero'), product('b-negative'), product('z-priced'), product('z-zero')]);
  await dataset('selling-prices', [price('a-zero', 0), price('b-negative', -10), price('z-priced'),
    price('z-zero', 0), { ...price('z-zero'), syncKey: 'lower-priority', priority: 1 },
    { ...price('z-priced', 0), syncKey: 'old', sourceUpdatedAt: '2026-09-01' },
    { ...price('z-priced', 200), syncKey: 'new-a', sourceUpdatedAt: '2026-10-01' },
    { ...price('z-priced', 300), syncKey: 'new-b', sourceUpdatedAt: '2026-10-01' },
  ]);
  const result = await catalog.searchCatalogProducts('', 10, 0, { priceTypeGuid: 'client-price' });
  expect(ids(result)).toEqual(['z-priced', 'a-zero', 'b-negative', 'z-zero']);
  expect(result?.items[0].basePrice).toBe(200);
  expect(result?.items.find(item => item.guid === 'z-zero')?.basePrice).toBe(0);
  expect((await catalog.getCatalogProductsByGuids(['z-priced'], { priceTypeGuid: 'client-price' }))[0].basePrice).toBe(200);
});

it('changes ranking immediately with the selected price type or active user', async () => {
  await products([product('a'), product('z-client'), product('z-other')]);
  await dataset('selling-prices', [price('z-client'), price('z-other', 100, 'other-price')]);
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, { priceTypeGuid: 'client-price' }))).toEqual(['z-client', 'a', 'z-other']);
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, { priceTypeGuid: 'other-price' }))).toEqual(['z-other', 'a', 'z-client']);
  await dataset('selling-prices', [price('a')], 'u2');
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, { priceTypeGuid: 'client-price' }))).toEqual(['a', 'z-client', 'z-other']);
  await db.runAsync("UPDATE catalog_meta SET value = ? WHERE key = 'offlineActiveUserId'", 'u1');
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, { priceTypeGuid: 'client-price' }))).toEqual(['z-client', 'a', 'z-other']);
});

it('filters warehouse balances and own reserves BEFORE paging, including sparse catalogs', async () => {
  await products([...Array.from({ length: 60 }, (_, i) => product(`a${i}`)), product('z1'), product('z2'), product('z3')]);
  await dataset('selling-prices', [price('z2')]);
  await dataset('stock', [stock('z1', 3), stock('z2', 0), stock('z3', 2), stock('a1', 100, 'other')]);
  await dataset('manager-stock', [reserve('z1', 6), reserve('z2', 4), reserve('a2', 100, 'other')]);
  const first = await catalog.searchCatalogProducts('', 2, 0, context);
  const second = await catalog.searchCatalogProducts('', 2, 2, context);
  expect(ids(first)).toEqual(['z2', 'z1']);
  expect(first).toMatchObject({ hasMore: true, total: 3 });
  expect(first?.items[1].stock).toMatchObject({ freeAvailable: 3, myReserved: 6, available: 9 });
  expect(ids(second)).toEqual(['z3']);
  expect(second).toMatchObject({ hasMore: false, total: 3 });
});

it('uses exact organization stock before fallback and sums series, matching displayed stock', async () => {
  await products(['a-exact-zero', 'b-fallback', 'c-series', 'd-reserve', 'e-foreign', 'f-negative'].map(g => product(g)));
  await dataset('selling-prices', []);
  await dataset('stock', [stock('a-exact-zero', 20), stock('a-exact-zero', 0, 'warehouse', 'org'),
    stock('b-fallback', 7), stock('c-series', 2, 'warehouse', 'org'),
    { ...stock('c-series', 3, 'warehouse', 'org'), seriesGuid: 'second' },
    stock('e-foreign', 100, 'warehouse', 'other'), stock('f-negative', -5)]);
  await dataset('manager-stock', [reserve('d-reserve', 3), reserve('f-negative', 2)]);
  const result = await catalog.searchCatalogProducts('', 10, 0, { ...context, organizationGuid: 'org' });
  expect(ids(result)).toEqual(['b-fallback', 'c-series', 'd-reserve', 'f-negative']);
  expect(result?.items.map(item => item.stock?.available)).toEqual([7, 5, 3, 2]);
  // Without organization, preserve the existing aggregate warehouse semantics.
  const allOrganizations = await catalog.searchCatalogProducts('', 10, 0, context);
  expect(ids(allOrganizations)).toContain('a-exact-zero');
});

it('never borrows balances or prices from another user or a staging snapshot', async () => {
  await products([product('a'), product('b'), product('c')]);
  await dataset('selling-prices', [price('b')], 'u2');
  await dataset('stock', [stock('b', 100)], 'u2');
  await dataset('manager-stock', [reserve('c', 100)], 'u2');
  await dataset('selling-prices', [price('a')]);
  await dataset('stock', [stock('a')]);
  await dataset('manager-stock', []);
  const staging = await offline.beginOfflineEntitySnapshot('u1', 'stock');
  await offline.appendOfflineEntitySnapshot(staging!, 'stock', [stock('b', 100)]);
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, context))).toEqual(['a']);
});

it('honors FTS relevance, code and barcode search with warehouse filtering and stable pages', async () => {
  await products([product('a', 'Молоко сухое'), product('b', 'Молоко'),
    { ...product('c', 'Сыр'), code: 'ТЕСТ-0042', packages: [{ guid: 'pack', name: 'шт', multiplier: 1, barcode: '4601234567890' }] } as any,
    { ...product('d', 'Молоко'), isActive: false }]);
  await dataset('selling-prices', [price('a'), price('d')]);
  await dataset('stock', ['a', 'b', 'c', 'd'].map(g => stock(g)));
  await dataset('manager-stock', []);
  // Stronger text relevance beats a priced but less relevant hit.
  expect(ids(await catalog.searchCatalogProducts('молоко', 1, 0, context))).toEqual(['b']);
  expect(ids(await catalog.searchCatalogProducts('молоко', 1, 1, context))).toEqual(['a']);
  expect(ids(await catalog.searchCatalogProducts('ТЕСТ-0042', 10, 0, context))).toEqual(['c']);
  expect(ids(await catalog.searchCatalogProducts('4601234567890', 10, 0, context))).toEqual(['c']);
  expect(ids(await catalog.searchCatalogProducts('"; DROP TABLE catalog_products; --', 10, 0, context))).toEqual([]);
});

it('uses price priority for equally relevant text matches and stable GUID ties', async () => {
  await products([product('a', 'Сыр'), product('b', 'Сыр'), product('c', 'Сыр')]);
  await dataset('selling-prices', [price('c')]);
  expect(ids(await catalog.searchCatalogProducts('сыр', 10, 0, { priceTypeGuid: 'client-price' }))).toEqual(['c', 'a', 'b']);
});

it('falls back to online selection until required snapshots are complete; an empty completed snapshot is valid', async () => {
  await products([product('a')]);
  expect(await catalog.searchCatalogProducts('', 10, 0, context)).toBeNull();
  expect(ids(await catalog.searchCatalogProducts('', 10, 0))).toEqual(['a']);
  await dataset('selling-prices', []);
  await dataset('stock', [stock('a')]);
  expect(await catalog.searchCatalogProducts('', 10, 0, context)).toBeNull();
  await dataset('manager-stock', []);
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, context))).toEqual(['a']);
  await dataset('stock', []);
  expect(await catalog.searchCatalogProducts('', 10, 0, context)).toMatchObject({ items: [], hasMore: false, total: 0 });
});

it('matches online semantics without a warehouse: no accidental all-warehouse stock filter', async () => {
  await products([product('a'), product('b')]);
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, { inStockOnly: true }))).toEqual(['a', 'b']);
});

it('reflects incremental price/stock/catalog changes without rebuilding the catalog', async () => {
  await products([product('a'), product('z')]);
  await dataset('selling-prices', [price('z')]);
  await dataset('stock', [stock('a'), stock('z')]);
  await dataset('manager-stock', []);
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, context))).toEqual(['z', 'a']);
  await offline.applyOfflineChanges('u1', { ...meta('selling-prices'), revision: '2' }, [
    { itemKey: price('z').syncKey, operation: 'DELETE', item: null },
  ]);
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, context))).toEqual(['a', 'z']);
  await offline.applyOfflineChanges('u1', { ...meta('stock'), revision: '2' }, [
    { itemKey: offline.offlineItemKey('stock', stock('a')), operation: 'DELETE', item: null },
  ]);
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, context))).toEqual(['z']);
  await catalog.applyCatalogChanges({ epoch: 'catalog', revision: '2', schemaVersion: 1, changes: [
    { productGuid: 'z', revision: '2', operation: 'DELETE', item: null },
  ] });
  expect(ids(await catalog.searchCatalogProducts('', 10, 0, context))).toEqual([]);
});

it('uses existing lookup indexes with a large catalog and hydrates only one page', async () => {
  const rows = Array.from({ length: 5000 }, (_, i) => product(`p${String(i).padStart(5, '0')}`));
  await products(rows);
  await dataset('selling-prices', rows.filter((_, i) => i % 3 === 0).map(p => price(p.guid)));
  await dataset('stock', rows.map((p, i) => stock(p.guid, i % 2)));
  await dataset('manager-stock', rows.filter((_, i) => i % 7 === 0).map(p => reserve(p.guid)));
  const reads = jest.spyOn(db, 'getAllAsync');
  const started = performance.now();
  const result = await catalog.searchCatalogProducts('', 50, 0, context);
  const elapsedMs = performance.now() - started;
  expect(result?.items).toHaveLength(50);
  expect(result?.items.every(item => Number(item.basePrice) > 0 && Number(item.stock?.available) > 0)).toBe(true);
  const calls = [...reads.mock.calls];
  const pageQuery = calls.find(([sql]) => sql.includes('AS price_priority'))!;
  const plan = await db.getAllAsync<{ detail: string }>('EXPLAIN QUERY PLAN ' + pageQuery[0], ...pageQuery.slice(1));
  const details = plan.map(p => p.detail).join('\n');
  expect(details).toContain('offline_selling_prices_lookup_idx');
  expect(details).toContain('offline_stock_lookup_idx');
  expect(details).toContain('offline_manager_stock_lookup_idx');
  expect(calls.length).toBeLessThanOrEqual(6);
  expect(calls.filter(([sql]) => sql.includes('product_guid IN'))).toHaveLength(3);
  console.info(`[picker-sqlite] 5000 products, first 50 rows: ${elapsedMs.toFixed(1)} ms (desktop SQLite, not Android)`);
});
