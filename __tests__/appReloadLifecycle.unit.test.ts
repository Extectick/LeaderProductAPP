function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function tick() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function setup() {
  jest.resetModules();
  const ota = require('../src/shared/ota/appReloadLifecycle') as typeof import('../src/shared/ota/appReloadLifecycle');
  const storage = require('../src/shared/storage/sqliteLifecycle') as typeof import('../src/shared/storage/sqliteLifecycle');
  const { withSQLiteWriteTransaction } = require('../src/shared/storage/sqliteWriteQueue') as typeof import('../src/shared/storage/sqliteWriteQueue');
  const events: string[] = [];
  const db: any = {
    databasePath: 'catalog.db',
    getFirstAsync: jest.fn(async () => ({})), getAllAsync: jest.fn(async () => []),
    closeAsync: jest.fn(async () => { events.push('close'); }),
    withExclusiveTransactionAsync: jest.fn(async (task) => {
      try { await task({ execAsync: async () => {} }); events.push('commit'); }
      finally { events.push('transaction-close'); }
    }),
  };
  storage.manageSQLiteConnection(db, () => events.push('closed-callback'));
  return { ota, storage, db, events, withSQLiteWriteTransaction };
}
beforeEach(() => jest.useFakeTimers());
afterEach(async () => { await jest.advanceTimersByTimeAsync(8000); jest.useRealTimers(); });

it('waits for reads, queued writes and transaction cleanup before closing SQLite and reloading', async () => {
  const { ota, db, storage, events, withSQLiteWriteTransaction } = setup();
  const read = deferred<any>(); const write = deferred();
  // The managed connection wraps the original read, so manage this fixture after configuring it.
  const reader: any = { ...db, databasePath: 'reader.db', getFirstAsync: () => read.promise, getAllAsync: async () => [],
    closeAsync: async () => { events.push('reader-close'); } };
  storage.manageSQLiteConnection(reader, () => {});
  const reading = reader.getFirstAsync('SELECT');
  const writing = withSQLiteWriteTransaction(db, async () => { events.push('write'); await write.promise; });
  const queued = withSQLiteWriteTransaction(db, async () => { events.push('queued'); });
  const reload = jest.fn(async () => { events.push('reload'); });
  const job = ota.reloadAppSafely(reload);
  expect(ota.reloadAppSafely(reload)).toBe(job);
  await tick();
  expect(events).toEqual(['write']);
  await expect(reader.getFirstAsync('NEW')).rejects.toBeInstanceOf(storage.SQLiteReloadingError);
  await expect(withSQLiteWriteTransaction(db, async () => {})).rejects.toBeInstanceOf(storage.SQLiteReloadingError);
  write.resolve(); await writing; await queued;
  expect(db.closeAsync).not.toHaveBeenCalled();
  read.resolve({}); await reading; await job;
  expect(events).toEqual(['write', 'commit', 'transaction-close', 'queued', 'commit', 'transaction-close', 'close', 'closed-callback', 'reader-close', 'reload']);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(() => storage.assertSQLiteAvailable()).toThrow();
});

it('does not interrupt a download or discard unsaved edits when a feature blocks reload', async () => {
  const { ota, db } = setup();
  const unregister = ota.registerAppReloadBlocker(() => 'Сначала сохраните заказ');
  const reload = jest.fn(async () => {});
  await expect(ota.reloadAppSafely(reload)).rejects.toThrow('Сначала сохраните заказ');
  expect(db.closeAsync).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  unregister();
  await ota.reloadAppSafely(reload);
  expect(reload).toHaveBeenCalledTimes(1);
});

it('cancels a timed-out barrier with no late close/reload and preserves the accepted writer queue', async () => {
  const { ota, db, storage, events, withSQLiteWriteTransaction } = setup();
  const gate = deferred();
  const writing = withSQLiteWriteTransaction(db, () => gate.promise);
  const reload = jest.fn(async () => {});
  const failed = ota.reloadAppSafely(reload).catch(error => error);
  await tick();
  await expect(withSQLiteWriteTransaction(db, async () => {})).rejects.toBeInstanceOf(storage.SQLiteReloadingError);
  await jest.advanceTimersByTimeAsync(8000);
  expect(await failed).toBeInstanceOf(ota.AppReloadDeferredError);
  expect(() => storage.assertSQLiteAvailable()).not.toThrow();
  const next = withSQLiteWriteTransaction(db, async () => { events.push('next'); });
  await tick();
  expect(events).not.toContain('next');
  gate.resolve(); await writing; await next; await tick();
  expect(db.closeAsync).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(events).toEqual(['commit', 'transaction-close', 'next', 'commit', 'transaction-close']);
});

it('allows reopening storage if native reload rejects after a successful close', async () => {
  const { ota, storage, db } = setup();
  const failure = new Error('native reload failed');
  await expect(ota.reloadAppSafely(async () => { throw failure; })).rejects.toBe(failure);
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
  expect(() => storage.assertSQLiteAvailable()).not.toThrow();
});

it('does not reload or repeatedly close a handle whose native close failed', async () => {
  const { ota, storage, db } = setup();
  db.closeAsync.mockRejectedValueOnce(new Error('SQLITE_BUSY during close'));
  const reload = jest.fn(async () => {});
  await expect(ota.reloadAppSafely(reload)).rejects.toThrow('SQLITE_BUSY');
  await expect(ota.reloadAppSafely(reload)).rejects.toThrow('Перезапустите приложение');
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
  expect(() => storage.assertSQLiteAvailable()).not.toThrow();
});

it('does not issue a late native reload when close finishes after the deadline', async () => {
  const { ota, db, storage } = setup();
  const gate = deferred();
  db.closeAsync.mockImplementationOnce(() => gate.promise);
  const reload = jest.fn(async () => {});
  const outcome = ota.reloadAppSafely(reload).catch(error => error);
  await tick();
  await jest.advanceTimersByTimeAsync(8000);
  expect(await outcome).toBeInstanceOf(ota.AppReloadDeferredError);
  await expect(ota.reloadAppSafely(reload)).rejects.toThrow('Дождитесь');
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
  gate.resolve(); await tick();
  expect(reload).not.toHaveBeenCalled();
  expect(() => storage.assertSQLiteAvailable()).not.toThrow();
});
