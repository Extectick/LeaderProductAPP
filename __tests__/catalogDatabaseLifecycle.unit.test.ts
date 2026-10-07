jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('../src/shared/monitoring', () => ({ captureException: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../node_modules/expo-sqlite/src/ExpoSQLite', () => ({
  __esModule: true,
  default: { NativeDatabase: jest.fn() },
}));
jest.mock('../node_modules/expo-sqlite/src/SQLiteDevToolsClient', () => ({
  registerDatabaseForDevToolsAsync: jest.fn(),
  unregisterDatabaseForDevToolsAsync: jest.fn(),
}));

function setup() {
  jest.resetModules();
  const db = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(async (sql: string) => sql.includes('journal_mode') ? { journal_mode: 'wal' } : { user_version: 3 }),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withExclusiveTransactionAsync: jest.fn(async (task: (tx: any) => Promise<void>) => task(db)),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };
  const open = require('expo-sqlite').openDatabaseAsync as jest.Mock;
  open.mockResolvedValue(db);
  const catalog = require('../src/features/productCatalog/data/catalogDatabase') as
    typeof import('../src/features/productCatalog/data/catalogDatabase');
  return { db, open, catalog };
}

afterEach(() => jest.restoreAllMocks());

it('disables blanket finalization of FTS-owned statements and shares initialization', async () => {
  const { db, open, catalog } = setup();
  const results = await Promise.all(Array.from({ length: 10 }, () => catalog.getCatalogDatabase()));
  expect(results.every((result) => result === db)).toBe(true);
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith('leader-product-catalog.db', {
    finalizeUnusedStatementsBeforeClosing: false,
    useNewConnection: true,
  });
  expect(db.execAsync).toHaveBeenCalledTimes(2);
  expect(db.execAsync.mock.calls[0][0]).toMatch(/^PRAGMA busy_timeout/);
  expect(db.withExclusiveTransactionAsync).not.toHaveBeenCalled();
  expect(db.execAsync.mock.calls.flat().join(' ')).not.toMatch(/CREATE |user_version\s*=/);
  expect(db.closeAsync).not.toHaveBeenCalled();
});

it.each([false, true])('passes safe options through the installed Expo transaction implementation (rollback=%s)', async (rollback) => {
  const { open, catalog } = setup();
  await catalog.getCatalogDatabase();
  const options = open.mock.calls[0][1];
  // Exercise the real Expo JS implementation, not our Node test adapter. A
  // dependency update must not silently re-enable blanket cleanup on writers.
  // The native bridge is mocked; this is not an Android crash reproduction.
  const { SQLiteDatabase } = jest.requireActual('../node_modules/expo-sqlite/src/SQLiteDatabase');
  const native = {
    initAsync: jest.fn().mockResolvedValue(undefined),
    execAsync: jest.fn().mockResolvedValue(undefined),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };
  const NativeDatabase = require('../node_modules/expo-sqlite/src/ExpoSQLite').default.NativeDatabase as jest.Mock;
  NativeDatabase.mockImplementation(() => native);
  const db = new SQLiteDatabase('/test/catalog.db', options, {});
  const failure = new Error('write failed');
  const operation = db.withExclusiveTransactionAsync(async (tx: any) => {
    expect(tx.options.finalizeUnusedStatementsBeforeClosing).toBe(false);
    if (rollback) throw failure;
  });
  if (rollback) await expect(operation).rejects.toBe(failure);
  else await operation;
  expect(NativeDatabase).toHaveBeenCalledWith('/test/catalog.db', {
    finalizeUnusedStatementsBeforeClosing: false,
    useNewConnection: true,
  });
  expect(native.execAsync.mock.calls).toEqual([['BEGIN'], [rollback ? 'ROLLBACK' : 'COMMIT']]);
  expect(native.closeAsync).toHaveBeenCalledTimes(1);
});

it('closes a failed initialization before allowing a retry, without deleting the database', async () => {
  const { db, open, catalog } = setup();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  db.execAsync.mockRejectedValueOnce(new Error('disk full'));
  let release!: () => void;
  db.closeAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const first = catalog.getCatalogDatabase();
  // Drain the open/migrate rejection handlers until close begins.
  for (let i = 0; i < 10 && !release; i += 1) await Promise.resolve();
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
  const concurrent = catalog.getCatalogDatabase();
  expect(open).toHaveBeenCalledTimes(1);
  release();
  expect(await first).toBeNull();
  expect(await concurrent).toBeNull();
  expect(await catalog.getCatalogDatabase()).toBe(db);
  expect(open).toHaveBeenCalledTimes(2);
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
});

it('preserves the migration error if closing also fails', async () => {
  const { db, catalog } = setup();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const migrationError = new Error('migration failed');
  db.execAsync.mockRejectedValueOnce(migrationError);
  db.closeAsync.mockRejectedValueOnce(new Error('close failed'));
  expect(await catalog.getCatalogDatabase()).toBeNull();
  expect(warn).toHaveBeenCalledWith('[catalog] SQLite initialization failed', migrationError);
  expect(await catalog.getCatalogDatabase()).toBe(db);
});

it('allows a retry after open rejects', async () => {
  const { db, open, catalog } = setup();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  open.mockRejectedValueOnce(new Error('open failed'));
  expect(await catalog.getCatalogDatabase()).toBeNull();
  expect(db.closeAsync).not.toHaveBeenCalled();
  expect(await catalog.getCatalogDatabase()).toBe(db);
});

it('does not open native SQLite on web', async () => {
  const { open, catalog } = setup();
  require('react-native').Platform.OS = 'web';
  expect(await catalog.getCatalogDatabase()).toBeNull();
  expect(open).not.toHaveBeenCalled();
});

it('migrates only an older schema and rechecks the version inside its transaction', async () => {
  const { db, catalog } = setup();
  const read = db.getFirstAsync;
  db.getFirstAsync.mockImplementation(async (sql: string) => sql.includes('journal_mode') ? { journal_mode: 'wal' } : { user_version: 2 });
  expect(await catalog.getCatalogDatabase()).toBe(db);
  expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  expect(read.mock.calls.filter(([sql]) => sql === 'PRAGMA user_version')).toHaveLength(2);
  expect(db.execAsync.mock.calls.some(([sql]) => sql.includes('CREATE TABLE IF NOT EXISTS offline_drafts'))).toBe(true);
});

it('does not mask initialization failure as an empty catalog to download again', async () => {
  const { db, catalog } = setup();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const failure = new Error('SQLite disk full');
  db.execAsync.mockRejectedValue(failure);
  await expect(catalog.readCatalogMeta()).rejects.toBe(failure);
});
