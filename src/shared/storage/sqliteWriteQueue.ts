import type { SQLiteDatabase, SQLiteStatement } from 'expo-sqlite';
import { assertSQLiteAvailable, withSQLiteActivity } from './sqliteLifecycle';

const writers = new Map<string, Promise<void>>();

/**
 * Expo opens a separate connection for each exclusive transaction; it does not
 * queue competing writers. Queue the entire transaction (including close) for
 * a database file. Network requests and reads can still run concurrently.
 * Callers must use tx, await all queries, and must not nest queued transactions.
 */
export function withSQLiteWriteTransaction(
  db: SQLiteDatabase,
  task: (tx: SQLiteDatabase) => Promise<void>
): Promise<void> {
  // A rejected new writer must not replace the tail of an accepted queue.
  try { assertSQLiteAvailable(); } catch (error) { return Promise.reject(error); }
  const key = db.databasePath;
  const previous = writers.get(key) ?? Promise.resolve();
  const result = withSQLiteActivity(() => previous.then(() =>
    db.withExclusiveTransactionAsync(async (tx) => {
      // Connection-local: the timeout on the main connection is not inherited.
      await tx.execAsync('PRAGMA busy_timeout = 5000;');
      await task(tx);
    })
  ));
  // A rejected write reaches its caller, but must not poison the next write.
  const settled = result.then(() => {}, () => {});
  writers.set(key, settled);
  void settled.then(() => {
    if (writers.get(key) === settled) writers.delete(key);
  });
  return result;
}

/** Finalize all successfully prepared statements before closing the transaction. */
export async function withSQLiteStatements<T>(
  db: SQLiteDatabase,
  task: (prepare: (sql: string) => Promise<SQLiteStatement>) => Promise<T>
): Promise<T> {
  const statements: SQLiteStatement[] = [];
  let failed = false;
  try {
    return await task(async (sql) => {
      const statement = await db.prepareAsync(sql);
      statements.push(statement);
      return statement;
    });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // Do not let an early rejection close the connection while another
    // statement is still being finalized, or mask the original SQL failure.
    const errors: unknown[] = [];
    for (const statement of statements) {
      try {
        await statement.finalizeAsync();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length && !failed) throw errors[0];
  }
}
