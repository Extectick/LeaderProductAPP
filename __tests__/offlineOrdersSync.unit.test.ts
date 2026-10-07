jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn() }));
jest.mock('../src/features/productCatalog', () => ({ syncProductCatalog: jest.fn() }));
jest.mock('../src/features/clientOrders/offline/offlineOrdersApi', () => ({
  fetchOfflineManifest: jest.fn(), fetchOfflineSnapshot: jest.fn(), fetchOfflineChanges: jest.fn(),
}));
jest.mock('../src/features/clientOrders/offline/offlineOrdersDatabase', () => ({
  OFFLINE_ENTITIES: ['organizations', 'warehouses', 'stock'],
  readOfflineDatasetMeta: jest.fn(), beginOfflineEntitySnapshot: jest.fn(), appendOfflineEntitySnapshot: jest.fn(),
  commitOfflineEntitySnapshot: jest.fn(), abortOfflineEntitySnapshot: jest.fn(), applyOfflineChanges: jest.fn(),
  isOfflineDataReady: jest.fn(), markOfflineDataSynced: jest.fn(),
  refreshOfflineDatasetMeta: jest.fn(),
}));
import { syncProductCatalog } from '../src/features/productCatalog';
import * as api from '../src/features/clientOrders/offline/offlineOrdersApi';
import * as db from '../src/features/clientOrders/offline/offlineOrdersDatabase';
import { isOfflineOrderDataSyncing, resetOfflineOrderSyncThrottle, syncOfflineOrderData } from '../src/features/clientOrders/offline/offlineOrdersSync';
import { OFFLINE_SYNC_RETRY_MESSAGE, offlineSyncErrorMessage } from '../src/features/clientOrders/offline/offlineSyncError';
const sourceTime = '2026-09-17T06:00:00.000Z';
const entry = (entity: string) => ({ entity, epoch: 'e', revision: '2', minAvailableRevision: '0', schemaVersion: 1, itemCount: 2, lastSourceUpdateAt: sourceTime, lastFullReconcileAt: sourceTime });
const manifest = () => ({ enabled: true, entities: db.OFFLINE_ENTITIES.map(entry) });
const page = (items = [{ guid: '1' }, { guid: '2' }]) => ({ epoch: 'e', schemaVersion: 1, snapshotRevision: '2', items, hasMore: false, nextCursor: null });

beforeEach(() => {
  jest.resetAllMocks();
  resetOfflineOrderSyncThrottle();
  jest.mocked(syncProductCatalog).mockImplementation(async (options) => {
    options?.onProgress?.({ progress: 0.5, updating: false, itemsLoaded: 1000, itemsTotal: 2000 });
    return true;
  });
  jest.mocked(api.fetchOfflineManifest).mockResolvedValue(manifest() as any);
  jest.mocked(api.fetchOfflineSnapshot).mockResolvedValue(page() as any);
  jest.mocked(db.readOfflineDatasetMeta).mockResolvedValue(null);
  jest.mocked(db.beginOfflineEntitySnapshot).mockResolvedValue('staging');
  jest.mocked(db.appendOfflineEntitySnapshot).mockResolvedValue(true);
  jest.mocked(db.commitOfflineEntitySnapshot).mockResolvedValue(true);
  jest.mocked(db.abortOfflineEntitySnapshot).mockResolvedValue(true);
  jest.mocked(db.isOfflineDataReady).mockResolvedValue(true);
  jest.mocked(db.markOfflineDataSynced).mockResolvedValue(true);
});

it('reports page/commit progress and marks complete only after all data is on the phone', async () => {
  const progress = jest.fn();
  expect(await syncOfflineOrderData('u1', { force: true, onProgress: progress })).toBe(true);
  expect(syncProductCatalog).toHaveBeenCalledWith({ force: true, silent: true, throwOnError: true, onProgress: expect.any(Function) });
  expect(db.commitOfflineEntitySnapshot).toHaveBeenCalledTimes(3);
  expect(db.markOfflineDataSynced).toHaveBeenCalledWith('u1');
  const values = progress.mock.calls.map(([value]) => value.progress).filter((value) => value !== null);
  expect(values.at(-1)).toBe(1);
  expect(values.slice(0, -1).every((value) => value < 1)).toBe(true);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  expect(progress.mock.calls.some(([status]) => status.transfer?.entity === 'catalog' && status.transfer.completed === 0)).toBe(true);
  expect(progress.mock.calls.at(-1)![0].transfer).toEqual({ entity: null, updating: false, completed: 4, total: 4 });
});

it('joins repeated taps to the same job and reports progress to both callers', async () => {
  let resolve!: (value: any) => void;
  jest.mocked(api.fetchOfflineManifest).mockReturnValue(new Promise((done) => { resolve = done; }));
  const first = jest.fn();
  const second = jest.fn();
  const job = syncOfflineOrderData('u1', { onProgress: first });
  expect(isOfflineOrderDataSyncing('u1')).toBe(true);
  expect(isOfflineOrderDataSyncing('u2')).toBe(false);
  expect(syncOfflineOrderData('u1', { force: true, onProgress: second })).toBe(job);
  resolve(manifest());
  await job;
  expect(isOfflineOrderDataSyncing('u1')).toBe(false);
  expect(api.fetchOfflineManifest).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenLastCalledWith(expect.objectContaining({ progress: 1, error: null }));
  expect(second).toHaveBeenLastCalledWith(expect.objectContaining({ progress: 1, error: null }));
});

it('does not replace a working snapshot with uninitialized server datasets', async () => {
  const data = manifest();
  data.entities[1] = { ...data.entities[1], revision: '0', lastSourceUpdateAt: null, lastFullReconcileAt: null } as any;
  jest.mocked(api.fetchOfflineManifest).mockResolvedValue(data as any);
  const progress = jest.fn();
  expect(await syncOfflineOrderData('u1', { silent: true, onProgress: progress })).toBe(false);
  expect(db.beginOfflineEntitySnapshot).not.toHaveBeenCalled();
  expect(db.markOfflineDataSynced).not.toHaveBeenCalled();
  expect(progress.mock.calls.at(-1)![0].error).toBe(OFFLINE_SYNC_RETRY_MESSAGE);
});

it('retries after network failure without a success timestamp or throttle', async () => {
  jest.mocked(api.fetchOfflineManifest).mockRejectedValueOnce(new Error('Network request failed'));
  expect(await syncOfflineOrderData('u1', { silent: true })).toBe(false);
  expect(db.markOfflineDataSynced).not.toHaveBeenCalled();
  expect(await syncOfflineOrderData('u1', { silent: true })).toBe(true);
  expect(api.fetchOfflineManifest).toHaveBeenCalledTimes(2);
});

it('updates synchronization time after checking unchanged revisions, without redownloading', async () => {
  jest.mocked(db.readOfflineDatasetMeta).mockImplementation(async (_, entity) => entry(entity) as any);
  expect(await syncOfflineOrderData('u1', { force: true })).toBe(true);
  expect(api.fetchOfflineSnapshot).not.toHaveBeenCalled();
  expect(db.markOfflineDataSynced).toHaveBeenCalledWith('u1');
});

it('checks each manual tap but never presents unchanged rows as a download', async () => {
  jest.mocked(syncProductCatalog).mockResolvedValue(true);
  jest.mocked(db.readOfflineDatasetMeta).mockImplementation(async (_, entity) => entry(entity) as any);
  const progress = jest.fn();
  await syncOfflineOrderData('u1', { force: true, onProgress: progress });
  await syncOfflineOrderData('u1', { force: true, onProgress: progress });
  expect(api.fetchOfflineManifest).toHaveBeenCalledTimes(2);
  expect(api.fetchOfflineSnapshot).not.toHaveBeenCalled();
  expect(api.fetchOfflineChanges).not.toHaveBeenCalled();
  expect(progress.mock.calls.every(([status]) => !status.transfer?.entity)).toBe(true);
  expect(db.refreshOfflineDatasetMeta).toHaveBeenCalledTimes(6);
});

it('bounds deltas by the manifest revision and applies tombstones without full download', async () => {
  jest.mocked(db.readOfflineDatasetMeta).mockImplementation(async (_, entity) => ({ ...entry(entity), revision: '1' }) as any);
  jest.mocked(db.applyOfflineChanges).mockResolvedValue(true);
  const changes = [{ itemKey: 'deleted', operation: 'DELETE', item: null }];
  jest.mocked(api.fetchOfflineChanges).mockResolvedValue({ epoch: 'e', schemaVersion: 1, nextRevision: '2', hasMore: false, changes } as any);
  expect(await syncOfflineOrderData('u1', { force: true })).toBe(true);
  expect(api.fetchOfflineChanges).toHaveBeenCalledWith('stock', { afterRevision: '1', untilRevision: '2', epoch: 'e', limit: 1000 });
  expect(db.applyOfflineChanges).toHaveBeenCalledWith('u1', expect.objectContaining({ entity: 'stock', revision: '2' }), changes);
  expect(api.fetchOfflineSnapshot).not.toHaveBeenCalled();
});

it('does not call a failed SQLite write a successful delta synchronization', async () => {
  jest.mocked(db.readOfflineDatasetMeta).mockImplementation(async (_, entity) => ({ ...entry(entity), revision: '1' }) as any);
  jest.mocked(api.fetchOfflineChanges).mockResolvedValue({ epoch: 'e', schemaVersion: 1, nextRevision: '2', hasMore: false, changes: [] } as any);
  jest.mocked(db.applyOfflineChanges).mockResolvedValue(false);
  expect(await syncOfflineOrderData('u1', { silent: true })).toBe(false);
  expect(db.markOfflineDataSynced).not.toHaveBeenCalled();
});

it('waits for an in-flight batch to finish before allowing another download after failure', async () => {
  let resolve!: (value: any) => void;
  jest.mocked(api.fetchOfflineSnapshot).mockImplementation((entity) => entity === 'stock'
    ? new Promise((done) => { resolve = done; }) : Promise.reject(new Error('Failed page')));
  const job = syncOfflineOrderData('u1', { silent: true });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(resolve).toBeDefined();
  expect(syncOfflineOrderData('u1', { force: true })).toBe(job);
  resolve(page());
  expect(await job).toBe(false);
  expect(db.abortOfflineEntitySnapshot).toHaveBeenCalled();
  expect(db.markOfflineDataSynced).not.toHaveBeenCalled();
});

it('keeps progress and throttling isolated between users', async () => {
  const first = jest.fn();
  await syncOfflineOrderData('u1', { onProgress: first });
  first.mockClear();
  await syncOfflineOrderData('u2');
  expect(api.fetchOfflineManifest).toHaveBeenCalledTimes(2);
  expect(first).not.toHaveBeenCalled();
});

it.each([
  "Call to function 'NativeSatement.finalizeAsync' has been rejected",
  'NOT NULL constraint failed: offline_selling_prices.product_guid',
  'Unknown native bridge failure',
  'Сервер повторил курсор selling-prices',
])('does not expose technical download errors in progress/UI: %s', async (message) => {
  const failure = new Error(message);
  jest.mocked(db.appendOfflineEntitySnapshot).mockRejectedValueOnce(failure);
  const progress = jest.fn();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await syncOfflineOrderData('u1', { force: true, onProgress: progress })).toBe(false);
  expect(progress).toHaveBeenLastCalledWith({ progress: null, error: OFFLINE_SYNC_RETRY_MESSAGE });
  expect(warn).toHaveBeenCalledWith('[offline-orders] synchronization failed', failure);
  expect(db.markOfflineDataSynced).not.toHaveBeenCalled();
  expect(await syncOfflineOrderData('u1', { force: true, silent: true })).toBe(true);
});

it('uses the same short error for storage, network and status-read failures', () => {
  expect(offlineSyncErrorMessage(new Error('NativeDatabase.execAsync: database is locked'))).toBe(OFFLINE_SYNC_RETRY_MESSAGE);
  expect(offlineSyncErrorMessage(new Error('SQLITE_FULL: database or disk is full'))).toBe(OFFLINE_SYNC_RETRY_MESSAGE);
  expect(offlineSyncErrorMessage(new Error('Network request failed'))).toBe(OFFLINE_SYNC_RETRY_MESSAGE);
  expect(offlineSyncErrorMessage(new Error('NativeStatement.getFirstAsync failed'))).toBe(OFFLINE_SYNC_RETRY_MESSAGE);
});

it('uses existing local metadata for updating labels and keeps a stable label during parallel downloads', async () => {
  jest.mocked(syncProductCatalog).mockImplementation(async (options) => {
    options?.onProgress?.({ progress: 0.5, updating: true, itemsLoaded: 1000, itemsTotal: 2000 });
    return true;
  });
  jest.mocked(db.readOfflineDatasetMeta).mockImplementation(async (_, entity) => entity === 'organizations'
    ? { ...entry(entity), epoch: 'old' } as any : null);
  const progress = jest.fn();
  expect(await syncOfflineOrderData('u1', { force: true, onProgress: progress })).toBe(true);
  const states = progress.mock.calls.map(([status]) => status.transfer).filter(Boolean);
  expect(states.some((state) => state.entity === 'catalog' && state.updating)).toBe(true);
  expect(states.some((state) => state.entity === 'organizations' && state.updating)).toBe(true);
  expect(states.some((state) => state.entity === 'stock' && !state.updating)).toBe(true);
  // No oscillation back to an already completed dataset as other pages finish.
  const order = ['catalog', 'organizations', 'warehouses', 'stock'];
  const focused = states.filter((state) => state.entity).map((state) => order.indexOf(state.entity));
  expect(focused).toEqual([...focused].sort((a, b) => a - b));
});

it('does not count downloaded pages as committed directories after a write failure', async () => {
  jest.mocked(db.commitOfflineEntitySnapshot).mockImplementation(async (_, meta) => meta.entity !== 'stock');
  const progress = jest.fn();
  expect(await syncOfflineOrderData('u1', { force: true, silent: true, onProgress: progress })).toBe(false);
  const counts = progress.mock.calls.map(([status]) => status.transfer?.completed ?? 0);
  expect(Math.max(...counts)).toBe(3); // catalog and two successful directories, not stock
  expect(db.markOfflineDataSynced).not.toHaveBeenCalled();
});

it('reports the current directory row count only after each page is stored', async () => {
  let store!: (value: boolean) => void;
  jest.mocked(api.fetchOfflineSnapshot).mockImplementation(async (entity, options) => entity === 'organizations'
    ? { ...page([{ guid: options.cursor ? '2' : '1' }]), hasMore: !options.cursor, nextCursor: options.cursor ? null : 'next' } as any
    : page() as any);
  jest.mocked(db.appendOfflineEntitySnapshot).mockImplementation((_, entity) => entity === 'organizations' && !store
    ? new Promise((done) => { store = done; }) : Promise.resolve(true));
  const progress = jest.fn();
  const job = syncOfflineOrderData('u1', { force: true, onProgress: progress });
  for (let i = 0; i < 40; i++) await Promise.resolve();
  const states = () => progress.mock.calls.map(([status]) => status.transfer).filter((state) => state?.entity === 'organizations');
  expect(states().some((state) => state.itemsLoaded === 0 && state.itemsTotal === 2)).toBe(true);
  expect(states().some((state) => state.itemsLoaded > 0)).toBe(false);
  store(true);
  expect(await job).toBe(true);
  expect(states().some((state) => state.itemsLoaded === 1 && state.itemsTotal === 2)).toBe(true);
  expect(states().some((state) => state.itemsLoaded === 2 && state.itemsTotal === 2)).toBe(true);
  expect(progress.mock.calls.some(([status]) => status.transfer?.entity === 'catalog'
    && status.transfer.itemsLoaded === 1000 && status.transfer.itemsTotal === 2000)).toBe(true);
});

it('counts delta records without confusing revisions or full dataset totals with transferred items', async () => {
  jest.mocked(api.fetchOfflineManifest).mockResolvedValue({ ...manifest(), entities: db.OFFLINE_ENTITIES.map((entity) => ({ ...entry(entity), revision: '9000', itemCount: 7879 })) } as any);
  jest.mocked(db.readOfflineDatasetMeta).mockImplementation(async (_, entity) => ({ ...entry(entity), revision: '1000', itemCount: 7878 }) as any);
  jest.mocked(db.applyOfflineChanges).mockResolvedValue(true);
  jest.mocked(api.fetchOfflineChanges).mockImplementation(async (_, options) => ({ epoch: 'e', schemaVersion: 1,
    nextRevision: options.afterRevision === '1000' ? '8000' : '9000', hasMore: options.afterRevision === '1000',
    changes: options.afterRevision === '1000' ? [{}, {}] : [{}] }) as any);
  const progress = jest.fn();
  expect(await syncOfflineOrderData('u1', { force: true, onProgress: progress })).toBe(true);
  const states = progress.mock.calls.map(([status]) => status.transfer).filter((state) => state?.entity === 'organizations');
  expect(states.some((state) => state.itemsLoaded === 2 && state.itemsTotal === null)).toBe(true);
  expect(states.some((state) => state.itemsLoaded === 3 && state.itemsTotal === 3)).toBe(true);
  expect(states.some((state) => state.itemsTotal === 7879 || state.itemsTotal === 8000)).toBe(false);
});

it('resets the row counter when a delta falls back to a full snapshot without rewinding overall progress', async () => {
  jest.mocked(db.readOfflineDatasetMeta).mockImplementation(async (_, entity) => ({ ...entry(entity), revision: '1' }) as any);
  jest.mocked(api.fetchOfflineChanges).mockRejectedValue(Object.assign(new Error('Snapshot required'), { status: 409 }));
  const progress = jest.fn();
  expect(await syncOfflineOrderData('u1', { force: true, onProgress: progress })).toBe(true);
  const states = progress.mock.calls.map(([status]) => status.transfer).filter((state) => state?.entity === 'organizations');
  expect(states.some((state) => state.itemsLoaded === 0 && state.itemsTotal === null)).toBe(true);
  expect(states.some((state) => state.itemsLoaded === 0 && state.itemsTotal === 2)).toBe(true);
  expect(states.some((state) => state.itemsLoaded === 2 && state.itemsTotal === 2)).toBe(true);
  const values = progress.mock.calls.map(([status]) => status.progress).filter((value) => value !== null);
  expect(values).toEqual([...values].sort((a, b) => a - b));
});
