import type { SQLiteDatabase, SQLiteStatement } from 'expo-sqlite';
import { withSQLiteStatements, withSQLiteWriteTransaction } from '../src/shared/storage/sqliteWriteQueue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function database(path = 'catalog.db') {
  const tx = { execAsync: jest.fn().mockResolvedValue(undefined) } as unknown as SQLiteDatabase;
  const db = {
    databasePath: path,
    withExclusiveTransactionAsync: jest.fn(async (task) => { await task(tx); }),
  } as unknown as SQLiteDatabase;
  return { db, tx };
}

it('queues writers for the same file, even if callers hold different connections', async () => {
  const first = database();
  const second = database();
  const gate = deferred();
  const started = deferred();
  const events: string[] = [];
  const one = withSQLiteWriteTransaction(first.db, async () => {
    events.push('first');
    started.resolve();
    await gate.promise;
    events.push('first done');
  });
  const two = withSQLiteWriteTransaction(second.db, async () => { events.push('second'); });
  await started.promise;
  expect(events).toEqual(['first']);
  expect(second.db.withExclusiveTransactionAsync).not.toHaveBeenCalled();
  gate.resolve();
  await Promise.all([one, two]);
  expect(events).toEqual(['first', 'first done', 'second']);
  expect(first.tx.execAsync).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000;');
});

it('waits for transaction cleanup and lets the next write run after failure', async () => {
  const { db, tx } = database();
  const closing = deferred();
  const started = deferred();
  const failure = new Error('failed write');
  jest.mocked(db.withExclusiveTransactionAsync).mockImplementationOnce(async (task) => {
    try { await task(tx as any); } finally {
      started.resolve();
      await closing.promise;
    }
  });
  const one = withSQLiteWriteTransaction(db, async () => { throw failure; });
  const outcome = one.catch((error) => error);
  const secondTask = jest.fn().mockResolvedValue(undefined);
  const two = withSQLiteWriteTransaction(db, secondTask);
  await started.promise;
  expect(secondTask).not.toHaveBeenCalled();
  closing.resolve();
  expect(await outcome).toBe(failure);
  await two;
  expect(secondTask).toHaveBeenCalledTimes(1);
});

it('does not hold unrelated databases behind a writer', async () => {
  const gate = deferred();
  const one = withSQLiteWriteTransaction(database('first.db').db, () => gate.promise);
  const task = jest.fn().mockResolvedValue(undefined);
  await withSQLiteWriteTransaction(database('second.db').db, task);
  expect(task).toHaveBeenCalledTimes(1);
  gate.resolve();
  await one;
});

function statements() {
  const first = { finalizeAsync: jest.fn().mockResolvedValue(undefined) } as unknown as SQLiteStatement;
  const second = { finalizeAsync: jest.fn().mockResolvedValue(undefined) } as unknown as SQLiteStatement;
  const db = { prepareAsync: jest.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) } as unknown as SQLiteDatabase;
  return { db, first, second };
}

it('finalizes already prepared statements if preparing another one fails', async () => {
  const { db, first } = statements();
  const failure = new Error('prepare failed');
  jest.mocked(db.prepareAsync).mockReset().mockResolvedValueOnce(first).mockRejectedValueOnce(failure);
  await expect(withSQLiteStatements(db, async (prepare) => {
    await prepare('one');
    await prepare('two');
  })).rejects.toBe(failure);
  expect(first.finalizeAsync).toHaveBeenCalledTimes(1);
});

it('drains cleanup and preserves the original SQL error if finalize also fails', async () => {
  const { db, first, second } = statements();
  const failure = new Error('SQLITE_BUSY');
  const gate = deferred();
  const started = deferred();
  jest.mocked(first.finalizeAsync).mockRejectedValue(new Error('NativeStatement.finalizeAsync'));
  jest.mocked(second.finalizeAsync).mockImplementation(async () => { started.resolve(); await gate.promise; });
  let finished = false;
  const result = withSQLiteStatements(db, async (prepare) => {
    await prepare('one');
    await prepare('two');
    throw failure;
  }).catch((error) => { finished = true; return error; });
  await started.promise;
  expect(finished).toBe(false);
  gate.resolve();
  expect(await result).toBe(failure);
  expect(second.finalizeAsync).toHaveBeenCalledTimes(1);
});

it('does not turn a cleanup-only failure into success', async () => {
  const { db, first, second } = statements();
  const failure = new Error('finalize failed');
  jest.mocked(first.finalizeAsync).mockRejectedValue(failure);
  await expect(withSQLiteStatements(db, async (prepare) => {
    await prepare('one');
    await prepare('two');
  })).rejects.toBe(failure);
  expect(second.finalizeAsync).toHaveBeenCalledTimes(1);
});
