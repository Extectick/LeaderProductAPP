import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { SQLiteTestDatabase } from './helpers/sqliteTestDatabase';
import type { OfflineDatasetMeta, StoredOfflineDraft } from '../src/features/clientOrders/offline/offlineOrdersDatabase';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

let directory: string;
let db: SQLiteTestDatabase;
let catalog: typeof import('../src/features/productCatalog/data/catalogDatabase');
let offline: typeof import('../src/features/clientOrders/offline/offlineOrdersDatabase');

const meta = (entity: OfflineDatasetMeta['entity'], revision = '1'): OfflineDatasetMeta => ({
  entity, epoch: 'test-epoch', revision, schemaVersion: 1, itemCount: 1,
  lastSourceUpdateAt: '2026-09-21T00:00:00Z', lastSyncedAt: '2026-09-21T00:00:00Z',
});
const draft: StoredOfflineDraft = {
  id: 'draft', clientOrderId: 'client-id', clientRevision: 1, status: 'ON_DEVICE', intent: 'SAVE',
  serverGuid: null, serverRevision: null, order: {}, payload: { items: [{ lineGuid: 'line', productGuid: 'p' }] },
  createdAt: '2026-09-21T00:00:00Z', updatedAt: '2026-09-21T00:00:00Z', lastSendError: null,
};
beforeEach(async () => {
  jest.resetModules();
  directory = mkdtempSync(join(tmpdir(), 'leader-offline-sqlite-'));
  db = new SQLiteTestDatabase(join(directory, 'catalog.db'));
  require('expo-sqlite').openDatabaseAsync.mockResolvedValue(db);
  catalog = require('../src/features/productCatalog/data/catalogDatabase');
  offline = require('../src/features/clientOrders/offline/offlineOrdersDatabase');
  expect(await catalog.getCatalogDatabase()).not.toBeNull();
});
afterEach(async () => {
  await db.closeAsync();
  // Remove only this test's generated database directory, never application data.
  if (dirname(directory) !== tmpdir() || !basename(directory).startsWith('leader-offline-sqlite-')) {
    throw new Error('Unsafe SQLite fixture cleanup path');
  }
  rmSync(directory, { recursive: true, force: true });
});

it('reproduces SQLite locking with unqueued Expo-style exclusive transactions', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const first = db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("INSERT INTO catalog_meta VALUES ('lock-test', '1')");
    started();
    await gate;
  });
  await ready;
  try {
    await expect(db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync("INSERT INTO catalog_meta VALUES ('second', '2')");
    })).rejects.toThrow('database is locked');
  } finally {
    release();
    await first;
  }
});

it('upserts by client identity, preserves independent drafts and guards late acknowledgements', async () => {
  const other = { ...draft, id: 'other', clientOrderId: 'other-client' };
  await offline.upsertOfflineDraft('u1', draft);
  await offline.upsertOfflineDraft('u1', other);
  await offline.upsertOfflineDraft('u2', draft);
  const updated = { ...draft, id: 'accidental-new-ui-id', clientRevision: 2,
    payload: { items: [{ lineGuid: 'latest-line', productGuid: 'p', quantity: 5 }] } };
  await offline.applyOfflineDraftChanges('u1', [updated]);
  const rows = await offline.readOfflineDrafts('u1');
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.clientOrderId === draft.clientOrderId)).toMatchObject({
    id: draft.id, clientRevision: 2, payload: updated.payload,
  });
  expect(await db.getAllAsync('SELECT draft_id, line_guid FROM offline_draft_lines WHERE user_id = ? AND draft_id = ?', 'u1', draft.id))
    .toEqual([{ draft_id: draft.id, line_guid: 'latest-line' }]);
  await expect(offline.upsertOfflineDraft('u1', draft)).rejects.toThrow('более новая версия');
  await offline.applyOfflineDraftChanges('u1', [], [draft]); // Late success for revision 1.
  expect(await offline.readOfflineDrafts('u1')).toHaveLength(2);
  await offline.applyOfflineDraftChanges('u1', [], [updated]);
  expect(await offline.readOfflineDrafts('u1')).toEqual([other]);
  expect(await offline.readOfflineDrafts('u2')).toEqual([draft]);
  expect(await db.getAllAsync('SELECT * FROM offline_draft_lines WHERE user_id = ? AND draft_id = ?', 'u1', draft.id)).toEqual([]);
});

it('rolls back a failed draft line write without losing the prior order or unrelated documents', async () => {
  await offline.upsertOfflineDraft('u1', draft);
  const other = { ...draft, id: 'other', clientOrderId: 'other-client' };
  await offline.upsertOfflineDraft('u1', other);
  await expect(offline.applyOfflineDraftChanges('u1', [{ ...draft, clientRevision: 2,
    payload: { items: [{ lineGuid: 'duplicate' }, { lineGuid: 'duplicate' }] },
  }], [other])).rejects.toThrow('UNIQUE constraint failed');
  expect(await offline.readOfflineDrafts('u1')).toEqual(expect.arrayContaining([draft, other]));
  expect(await db.getAllAsync('SELECT * FROM offline_draft_lines WHERE user_id = ?', 'u1')).toHaveLength(2);
  expect(await db.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
});

it('opens an already migrated WAL database while another connection writes, without rewriting its schema', async () => {
  await offline.upsertOfflineDraft('u1', draft);
  const writer = new SQLiteTestDatabase(db.databasePath);
  await writer.execAsync("BEGIN IMMEDIATE; INSERT INTO catalog_meta VALUES ('other-writer', '1');");
  await db.closeAsync();
  db = new SQLiteTestDatabase(join(directory, 'catalog.db'));
  try {
    // This is the unconditional write at the end of the previous initializer.
    await expect(db.execAsync('PRAGMA user_version = 3')).rejects.toThrow('database is locked');
    jest.resetModules();
    require('expo-sqlite').openDatabaseAsync.mockResolvedValue(db);
    catalog = require('../src/features/productCatalog/data/catalogDatabase');
    offline = require('../src/features/clientOrders/offline/offlineOrdersDatabase');
    const calls = jest.spyOn(db, 'execAsync');
    expect(await catalog.getCatalogDatabase()).toBe(db);
    expect(calls.mock.calls.flat().join(' ')).not.toMatch(/CREATE |user_version\s*=/);
    expect(await offline.readOfflineDrafts('u1')).toEqual([draft]);
  } finally {
    await writer.execAsync('ROLLBACK');
    await writer.closeAsync();
  }
  expect(await offline.markOfflineDataSynced('u1')).toBe(true);
  expect(await db.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
});

it('rolls back a failed schema upgrade and preserves drafts and the previous version', async () => {
  await offline.upsertOfflineDraft('u1', draft);
  await db.execAsync('PRAGMA user_version = 2');
  const transaction = db.withExclusiveTransactionAsync.bind(db);
  jest.spyOn(db, 'withExclusiveTransactionAsync').mockImplementationOnce(task => transaction(async tx => {
    await task(tx);
    throw new Error('simulated migration failure before commit');
  }));
  // Simulate a new runtime while keeping the test connection readable after the
  // failed opener calls close. Production closes its failed handle normally.
  const realClose = db.closeAsync.bind(db);
  jest.spyOn(db, 'closeAsync').mockResolvedValueOnce(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.resetModules();
  require('expo-sqlite').openDatabaseAsync.mockResolvedValue(db);
  catalog = require('../src/features/productCatalog/data/catalogDatabase');
  expect(await catalog.getCatalogDatabase()).toBeNull();
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 2 });
  expect((await db.getFirstAsync<any>('SELECT client_order_id FROM offline_drafts'))?.client_order_id).toBe('client-id');
  expect(await catalog.getCatalogDatabase()).toBe(db);
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 3 });
  db.closeAsync = realClose;
});

it('loads three datasets alongside catalog and draft writes without collisions', async () => {
  const prices = Array.from({ length: 100 }, (_, index) => ({ syncKey: `price-${index}`, product: { guid: `p-${index}` }, priceType: { guid: 'retail' }, price: 42 }));
  const stock = Array.from({ length: 100 }, (_, index) => ({ product: { guid: `p-${index}` }, warehouse: { guid: 'w' }, freeAvailable: 3, available: 3 }));
  const reserves = [{ syncKey: 'reserve', product: { guid: 'p-1' }, warehouse: { guid: 'w' }, reserved: 6 }];
  const datasets = [['selling-prices', prices], ['stock', stock], ['manager-stock', reserves]] as const;
  const results = await Promise.all([
    ...datasets.map(async ([entity, items]) => {
      const staging = await offline.beginOfflineEntitySnapshot('u1', entity);
      await offline.appendOfflineEntitySnapshot(staging!, entity, [...items]);
      return offline.commitOfflineEntitySnapshot('u1', { ...meta(entity), itemCount: items.length });
    }),
    catalog.replaceCatalog({ epoch: 'catalog', revision: '1', schemaVersion: 1, products: [
      { guid: 'p', name: 'Товар', isActive: true, revision: '1', packages: [] },
    ] }),
    offline.upsertOfflineDraft('u1', draft),
    offline.markOfflineDataSynced('u1'),
  ]);
  expect(results).toEqual(Array(results.length).fill(true));
  for (const [entity, items] of datasets) {
    expect(await offline.readOfflineEntityItems('u1', entity)).toHaveLength(items.length);
    expect(await offline.readOfflineDatasetMeta('u1', entity)).toMatchObject({ itemCount: items.length });
  }
  expect(await offline.readOfflineDrafts('u1')).toEqual([draft]);
  expect(await catalog.readCatalogMeta()).toMatchObject({ revision: '1', productCount: 1 });
  expect(await offline.readOfflineEntityItems('u2', 'selling-prices')).toEqual([]);
});

it('keeps the old snapshot after a failed write and permits a clean retry', async () => {
  const oldPrice = { syncKey: 'old', productGuid: 'p', priceTypeGuid: 'retail', price: 10 };
  await offline.replaceOfflineEntity('u1', meta('selling-prices'), [oldPrice]);
  const staging = await offline.beginOfflineEntitySnapshot('u1', 'selling-prices');
  await offline.appendOfflineEntitySnapshot(staging!, 'selling-prices', [{ ...oldPrice, price: 20 }]);
  expect(await offline.readOfflineEntityItems('u1', 'selling-prices')).toEqual([oldPrice]);
  await expect(offline.appendOfflineEntitySnapshot(staging!, 'selling-prices', [
    { ...oldPrice, syncKey: 'valid-before-failure' },
    { syncKey: 'broken', price: 99 },
  ])).rejects.toThrow('NOT NULL constraint failed');
  expect(await offline.readOfflineEntityItems(staging!, 'selling-prices')).toHaveLength(1);
  await offline.abortOfflineEntitySnapshot('u1', 'selling-prices');
  expect(await offline.readOfflineEntityItems('u1', 'selling-prices')).toEqual([oldPrice]);
  expect(await offline.readOfflineDatasetMeta('u1', 'selling-prices')).toMatchObject({ revision: '1' });
  expect(await offline.readOfflineDataSyncTime('u1')).toBeNull();
  const retry = await offline.beginOfflineEntitySnapshot('u1', 'selling-prices');
  await offline.appendOfflineEntitySnapshot(retry!, 'selling-prices', [{ ...oldPrice, price: 30 }]);
  await offline.commitOfflineEntitySnapshot('u1', meta('selling-prices', '2'));
  expect(await offline.readOfflineEntityItems('u1', 'selling-prices')).toEqual([{ ...oldPrice, price: 30 }]);
  expect(await offline.readOfflineDatasetMeta('u1', 'selling-prices')).toMatchObject({ revision: '2' });
});

it('finishes an accepted write before OTA, closes the actual file and preserves drafts when reloaded', async () => {
  await offline.upsertOfflineDraft('u1', draft);
  await offline.replaceOfflineEntity('u1', meta('agreements'), [{ guid: 'agreement', name: 'Соглашение' }]);
  const { withSQLiteWriteTransaction } = require('../src/shared/storage/sqliteWriteQueue');
  const { reloadAppSafely } = require('../src/shared/ota/appReloadLifecycle');
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  const writing = withSQLiteWriteTransaction(db, async (tx: SQLiteTestDatabase) => {
    await tx.runAsync("INSERT INTO catalog_meta VALUES ('ota-write', 'committed')");
    started(); await gate;
  });
  await ready;
  const nativeFailure = new Error('Simulated native reload rejection');
  const nativeReload = jest.fn(async () => { throw nativeFailure; });
  const outcome = reloadAppSafely(nativeReload).catch((error: unknown) => error);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(nativeReload).not.toHaveBeenCalled();
  release(); await writing;
  expect(await outcome).toBe(nativeFailure);
  expect(nativeReload).toHaveBeenCalledTimes(1);
  // The same JS runtime can recover from a rejected native reload by opening a
  // fresh handle, without deleting or copying the user's database.
  db = new SQLiteTestDatabase(join(directory, 'catalog.db'));
  require('expo-sqlite').openDatabaseAsync.mockResolvedValue(db);
  expect(await catalog.getCatalogDatabase()).toBe(db);
  expect(await offline.readOfflineDrafts('u1')).toEqual([draft]);
  expect(await offline.readOfflineEntityItems('u1', 'agreements')).toEqual([{ guid: 'agreement', name: 'Соглашение' }]);
  expect(await db.getFirstAsync("SELECT value FROM catalog_meta WHERE key = 'ota-write'")).toEqual({ value: 'committed' });
  expect(await db.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
});

it('repeatedly updates and searches FTS alongside drafts and survives reopening the file', async () => {
  await offline.upsertOfflineDraft('u1', draft);
  await catalog.replaceCatalog({ epoch: 'catalog', revision: '1', schemaVersion: 1, products: [
    { guid: 'p', name: 'Молоко', isActive: true, revision: '1', packages: [] },
  ] });
  for (let cycle = 2; cycle <= 50; cycle += 1) {
    const name = cycle % 2 === 0 ? 'Сыр' : 'Молоко';
    await Promise.all([
      catalog.applyCatalogChanges({ epoch: 'catalog', revision: String(cycle), schemaVersion: 1, changes: [
        { productGuid: 'p', revision: String(cycle), operation: 'UPSERT', item: {
          guid: 'p', name, isActive: true, revision: String(cycle), packages: [],
        } },
      ] }),
      offline.upsertOfflineDraft('u1', { ...draft, clientRevision: cycle }),
      offline.markOfflineDataSynced('u1'),
    ]);
    const found = await catalog.searchCatalogProducts(name, 10, 0);
    expect(found?.items).toEqual([expect.objectContaining({ guid: 'p', name })]);
    const previous = await catalog.searchCatalogProducts(cycle % 2 === 0 ? 'Молоко' : 'Сыр', 10, 0);
    expect(previous?.items).toEqual([]);
  }
  // A genuine file close/reopen verifies persistence; the native FTS finalizer
  // crash itself needs the separate Android test, not this Node SQLite adapter.
  await db.closeAsync();
  db = new SQLiteTestDatabase(join(directory, 'catalog.db'));
  jest.resetModules();
  require('expo-sqlite').openDatabaseAsync.mockResolvedValue(db);
  catalog = require('../src/features/productCatalog/data/catalogDatabase');
  offline = require('../src/features/clientOrders/offline/offlineOrdersDatabase');
  expect(await catalog.getCatalogDatabase()).not.toBeNull();
  expect((await catalog.searchCatalogProducts('Сыр', 10, 0))?.items).toHaveLength(1);
  expect(await offline.readOfflineDrafts('u1')).toEqual([{ ...draft, clientRevision: 50 }]);
  expect(await offline.readOfflineDrafts('u2')).toEqual([]);
  expect(await db.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
});

it('rolls back failed catalog/FTS replacement and keeps the previous draft and index', async () => {
  await offline.upsertOfflineDraft('u1', draft);
  const product = { guid: 'p', name: 'Молоко', isActive: true, revision: '1', packages: [] };
  await catalog.replaceCatalog({ epoch: 'catalog', revision: '1', schemaVersion: 1, products: [product] });
  await expect(catalog.replaceCatalog({ epoch: 'catalog', revision: '2', schemaVersion: 1, products: [
    { ...product, name: 'Сыр' },
    { ...product, guid: 'broken', name: null as unknown as string },
  ] })).rejects.toThrow('NOT NULL constraint failed');
  expect((await catalog.searchCatalogProducts('Молоко', 10, 0))?.items).toHaveLength(1);
  expect((await catalog.searchCatalogProducts('Сыр', 10, 0))?.items).toEqual([]);
  expect(await offline.readOfflineDrafts('u1')).toEqual([draft]);
  expect(await catalog.readCatalogMeta()).toMatchObject({ revision: '1', productCount: 1 });
  await catalog.applyCatalogChanges({ epoch: 'catalog', revision: '2', schemaVersion: 1, changes: [
    { productGuid: 'p', revision: '2', operation: 'DELETE', item: null },
  ] });
  expect(await db.getFirstAsync('SELECT COUNT(*) AS count FROM catalog_products_fts')).toEqual({ count: 0 });
  expect(await offline.readOfflineDrafts('u1')).toEqual([draft]);
});

it('stores shared delivery addresses for both clients and applies scoped deletes without losing other users', async () => {
  const first = { guid: 'partner:address', counterparty: { guid: 'c1' }, fullAddress: 'Street', comment: '10–18' };
  const second = { ...first, counterparty: { guid: 'c2' } };
  const snapshot = { ...meta('delivery-addresses'), schemaVersion: 2, itemCount: 2 };
  await offline.replaceOfflineEntity('u1', snapshot, [first, second]);
  await offline.replaceOfflineEntity('u2', snapshot, [first]);
  expect(await offline.readOfflineEntityItems('u1', 'delivery-addresses')).toHaveLength(2);
  expect(offline.offlineItemKey('delivery-addresses', first)).toBe(JSON.stringify(['c1', 'partner:address']));
  await offline.applyOfflineChanges('u1', { ...snapshot, revision: '2', itemCount: 1 }, [{
    revision: '2', itemKey: offline.offlineItemKey('delivery-addresses', first), operation: 'DELETE', item: null,
  }]);
  expect(await offline.readOfflineEntityItems('u1', 'delivery-addresses')).toEqual([second]);
  expect(await offline.readOfflineEntityItems('u2', 'delivery-addresses')).toEqual([first]);
  expect(await db.getFirstAsync('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
});

it('requires a fresh address snapshot for legacy keys without erasing usable offline rows', async () => {
  const address = { guid: 'partner:address', counterparty: { guid: 'c1' }, fullAddress: 'Street' };
  const snapshot = { ...meta('delivery-addresses'), schemaVersion: 2 };
  await offline.replaceOfflineEntity('u1', snapshot, [address]);
  await db.runAsync('UPDATE offline_entities SET item_key = ? WHERE user_id = ? AND entity = ?',
    address.guid, 'u1', 'delivery-addresses');
  expect(await offline.readOfflineDatasetMeta('u1', 'delivery-addresses')).toMatchObject({ schemaVersion: 0 });
  expect(await offline.readOfflineEntityItems('u1', 'delivery-addresses')).toEqual([address]);
  await offline.replaceOfflineEntity('u1', snapshot, [address]);
  expect(await offline.readOfflineDatasetMeta('u1', 'delivery-addresses')).toMatchObject({ schemaVersion: 2 });
});
