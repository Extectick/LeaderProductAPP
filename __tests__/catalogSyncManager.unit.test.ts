jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn() }));
jest.mock('../src/features/productCatalog/api/catalogApi', () => ({
  fetchCatalogManifest: jest.fn(), fetchCatalogSnapshotPage: jest.fn(), fetchCatalogChangesPage: jest.fn(),
}));
jest.mock('../src/features/productCatalog/data/catalogDatabase', () => ({
  readCatalogMeta: jest.fn(), replaceCatalog: jest.fn(), applyCatalogChanges: jest.fn(),
}));

it('preserves the native cause for a manual caller joining background sync and allows a retry', async () => {
  jest.resetModules();
  const api = require('../src/features/productCatalog/api/catalogApi');
  const db = require('../src/features/productCatalog/data/catalogDatabase');
  const monitoring = require('../src/shared/monitoring');
  const { syncProductCatalog } = require('../src/features/productCatalog/sync/catalogSyncManager');
  db.readCatalogMeta.mockResolvedValue({ productCount: 0, revision: '0' });
  api.fetchCatalogManifest.mockResolvedValue({ epoch: 'e', schemaVersion: 1, revision: '1' });
  api.fetchCatalogSnapshotPage.mockResolvedValue({ epoch: 'e', schemaVersion: 1, snapshotRevision: '1', items: [], hasMore: false });
  const failure = new Error('NativeDatabase.closeAsync: SQLITE_BUSY');
  db.replaceCatalog.mockRejectedValueOnce(failure).mockResolvedValue(true);
  const background = syncProductCatalog({ silent: true });
  const manual = syncProductCatalog({ throwOnError: true });
  await expect(manual).rejects.toBe(failure);
  expect(await background).toBe(false);
  expect(monitoring.captureException).toHaveBeenCalledWith(failure, {
    tags: { offline_sync_stage: 'catalog.replace', offline_sync_entity: 'catalog' },
  });
  expect(api.fetchCatalogManifest).toHaveBeenCalledTimes(1);
  expect(await syncProductCatalog({ throwOnError: true })).toBe(true);
});

it('replays page progress to a joining caller and reports 100% only after the SQLite commit', async () => {
  jest.resetModules();
  const api = require('../src/features/productCatalog/api/catalogApi');
  const db = require('../src/features/productCatalog/data/catalogDatabase');
  const { syncProductCatalog } = require('../src/features/productCatalog/sync/catalogSyncManager');
  db.readCatalogMeta.mockResolvedValue({ epoch: 'old', productCount: 2, revision: '1' });
  api.fetchCatalogManifest.mockResolvedValue({ epoch: 'new', schemaVersion: 1, revision: '2', productCount: 4 });
  let nextPage!: (value: unknown) => void;
  let commit!: (value: boolean) => void;
  api.fetchCatalogSnapshotPage
    .mockResolvedValueOnce({ epoch: 'new', schemaVersion: 1, snapshotRevision: '2', items: [{}, {}], hasMore: true, nextCursor: 'next' })
    .mockImplementationOnce(() => new Promise((resolve) => { nextPage = resolve; }));
  db.replaceCatalog.mockImplementationOnce(() => new Promise((resolve) => { commit = resolve; }));
  const first = jest.fn();
  const second = jest.fn();
  const background = syncProductCatalog({ onProgress: first });
  for (let i = 0; i < 24; i++) await Promise.resolve();
  const manual = syncProductCatalog({ onProgress: second, throwOnError: true });
  expect(second).toHaveBeenLastCalledWith({ progress: 0.5, updating: true, itemsLoaded: 2, itemsTotal: 4 });
  nextPage({ epoch: 'new', schemaVersion: 1, snapshotRevision: '2', items: [{}, {}], hasMore: false });
  for (let i = 0; i < 24; i++) await Promise.resolve();
  expect(second).toHaveBeenLastCalledWith({ progress: 0.95, updating: true, itemsLoaded: 4, itemsTotal: 4 });
  commit(true);
  expect(await manual).toBe(true);
  expect(await background).toBe(true);
  expect(second).toHaveBeenLastCalledWith({ progress: 1, updating: true, itemsLoaded: 4, itemsTotal: 4 });
  expect(api.fetchCatalogManifest).toHaveBeenCalledTimes(1);
  expect(api.fetchCatalogSnapshotPage).toHaveBeenCalledTimes(2);
  first.mockClear(); second.mockClear();
  db.readCatalogMeta.mockResolvedValue({ epoch: 'new', productCount: 4, revision: '2', schemaVersion: 1 });
  await syncProductCatalog({ force: true });
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
});

it('counts actual catalog delta rows instead of global revision numbers', async () => {
  jest.resetModules();
  const api = require('../src/features/productCatalog/api/catalogApi');
  const db = require('../src/features/productCatalog/data/catalogDatabase');
  const { syncProductCatalog } = require('../src/features/productCatalog/sync/catalogSyncManager');
  db.readCatalogMeta.mockResolvedValue({ epoch: 'e', schemaVersion: 1, productCount: 2000, revision: '1000' });
  api.fetchCatalogManifest.mockResolvedValue({ epoch: 'e', schemaVersion: 1, revision: '9000', productCount: 2002 });
  api.fetchCatalogChangesPage
    .mockResolvedValueOnce({ epoch: 'e', schemaVersion: 1, nextRevision: '8000', hasMore: true, changes: [{}, {}] })
    .mockResolvedValueOnce({ epoch: 'e', schemaVersion: 1, nextRevision: '9000', hasMore: false, changes: [{}] });
  db.applyCatalogChanges.mockResolvedValue(true);
  const progress = jest.fn();
  expect(await syncProductCatalog({ force: true, onProgress: progress })).toBe(true);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ itemsLoaded: 2, itemsTotal: null }));
  expect(progress).toHaveBeenLastCalledWith({ progress: 1, updating: true, itemsLoaded: 3, itemsTotal: 3 });
});
