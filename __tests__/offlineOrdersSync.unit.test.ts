jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../src/features/productCatalog', () => ({ syncProductCatalog: jest.fn() }));
jest.mock('../src/features/clientOrders/offline/offlineOrdersApi', () => ({
  fetchOfflineManifest: jest.fn(), fetchOfflineSnapshot: jest.fn(), fetchOfflineChanges: jest.fn(),
}));
jest.mock('../src/features/clientOrders/offline/offlineOrdersDatabase', () => ({
  OFFLINE_ENTITIES: ['organizations', 'warehouses', 'stock'],
  readOfflineDatasetMeta: jest.fn(), beginOfflineEntitySnapshot: jest.fn(), appendOfflineEntitySnapshot: jest.fn(),
  commitOfflineEntitySnapshot: jest.fn(), abortOfflineEntitySnapshot: jest.fn(), applyOfflineChanges: jest.fn(),
  isOfflineDataReady: jest.fn(), markOfflineDataSynced: jest.fn(),
}));
import { syncProductCatalog } from '../src/features/productCatalog';
import * as api from '../src/features/clientOrders/offline/offlineOrdersApi';
import * as db from '../src/features/clientOrders/offline/offlineOrdersDatabase';
import { isOfflineOrderDataSyncing, resetOfflineOrderSyncThrottle, syncOfflineOrderData } from '../src/features/clientOrders/offline/offlineOrdersSync';
const sourceTime = '2026-09-17T06:00:00.000Z';
const entry = (entity: string) => ({ entity, epoch: 'e', revision: '2', minAvailableRevision: '0', schemaVersion: 1, itemCount: 2, lastSourceUpdateAt: sourceTime, lastFullReconcileAt: sourceTime });
const manifest = () => ({ enabled: true, entities: db.OFFLINE_ENTITIES.map(entry) });
const page = (items = [{ guid: '1' }, { guid: '2' }]) => ({ epoch: 'e', schemaVersion: 1, snapshotRevision: '2', items, hasMore: false, nextCursor: null });

beforeEach(() => {
  jest.resetAllMocks();
  resetOfflineOrderSyncThrottle();
  jest.mocked(syncProductCatalog).mockResolvedValue(true);
  jest.mocked(api.fetchOfflineManifest).mockResolvedValue(manifest() as any);
  jest.mocked(api.fetchOfflineSnapshot).mockResolvedValue(page() as any);
  jest.mocked(db.readOfflineDatasetMeta).mockResolvedValue(null);
  jest.mocked(db.beginOfflineEntitySnapshot).mockResolvedValue('staging');
  jest.mocked(db.appendOfflineEntitySnapshot).mockResolvedValue(true);
  jest.mocked(db.commitOfflineEntitySnapshot).mockResolvedValue(true);
  jest.mocked(db.isOfflineDataReady).mockResolvedValue(true);
  jest.mocked(db.markOfflineDataSynced).mockResolvedValue(true);
});

it('reports page/commit progress and marks complete only after all data is on the phone', async () => {
  const progress = jest.fn();
  expect(await syncOfflineOrderData('u1', { force: true, onProgress: progress })).toBe(true);
  expect(syncProductCatalog).toHaveBeenCalledWith({ force: true, silent: true });
  expect(db.commitOfflineEntitySnapshot).toHaveBeenCalledTimes(3);
  expect(db.markOfflineDataSynced).toHaveBeenCalledWith('u1');
  const values = progress.mock.calls.map(([value]) => value.progress).filter((value) => value !== null);
  expect(values.at(-1)).toBe(1);
  expect(values.slice(0, -1).every((value) => value < 1)).toBe(true);
  expect(values).toEqual([...values].sort((a, b) => a - b));
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
  expect(first).toHaveBeenLastCalledWith({ progress: 1, error: null });
  expect(second).toHaveBeenLastCalledWith({ progress: 1, error: null });
});

it('does not replace a working snapshot with uninitialized server datasets', async () => {
  const data = manifest();
  data.entities[1] = { ...data.entities[1], revision: '0', lastSourceUpdateAt: null, lastFullReconcileAt: null } as any;
  jest.mocked(api.fetchOfflineManifest).mockResolvedValue(data as any);
  const progress = jest.fn();
  expect(await syncOfflineOrderData('u1', { silent: true, onProgress: progress })).toBe(false);
  expect(db.beginOfflineEntitySnapshot).not.toHaveBeenCalled();
  expect(db.markOfflineDataSynced).not.toHaveBeenCalled();
  expect(progress.mock.calls.at(-1)![0].error).toContain('не подготовлены');
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
