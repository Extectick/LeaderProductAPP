import type { SQLiteDatabase } from 'expo-sqlite';
import { AppReloadDeferredError, registerAppReloadPreparation, waitForReloadWork } from '../ota/appReloadLifecycle';

export class SQLiteReloadingError extends Error {
  constructor() { super('SQLite is paused for application reload'); }
}
let paused = false;
const activities = new Set<Promise<unknown>>();
const databases = new Map<SQLiteDatabase, { closed: () => void; closeFailed: boolean }>();

export function assertSQLiteAvailable() {
  if (paused) throw new SQLiteReloadingError();
}

/** A lease spans every statement, COMMIT/ROLLBACK and native transaction close. */
export function withSQLiteActivity<T>(task: () => Promise<T>): Promise<T> {
  try { assertSQLiteAvailable(); } catch (error) { return Promise.reject(error); }
  const result = Promise.resolve().then(task);
  activities.add(result);
  const release = () => { activities.delete(result); };
  void result.then(release, release);
  return result;
}

/** Track reads on the main handle; write transactions have their own lease. */
export function manageSQLiteConnection(db: SQLiteDatabase, closed: () => void) {
  if (databases.has(db)) return;
  databases.set(db, { closed, closeFailed: false });
  for (const method of ['getFirstAsync', 'getAllAsync'] as const) {
    const original = db[method].bind(db);
    db[method] = ((...args: any[]) => withSQLiteActivity(() => (original as any)(...args))) as typeof db[typeof method];
  }
}

registerAppReloadPreparation(async (signal) => {
  if (paused) throw new AppReloadDeferredError('Дождитесь завершения работы с данными');
  paused = true;
  const resume = () => { paused = false; };
  try {
    // Admission is closed synchronously before taking the snapshot, so no new
    // reader or queued writer can race with close or native Updates.reloadAsync.
    await waitForReloadWork(Promise.allSettled([...activities]), signal);
    for (const [db, entry] of databases) {
      if (signal.aborted) throw signal.reason;
      if (entry.closeFailed) throw new AppReloadDeferredError('Перезапустите приложение для применения обновления');
      try {
        // Never race/abandon close itself. Expo removes its native cache entry
        // before closing; a failed close must not be retried as a fake success.
        await db.closeAsync();
      } catch (error) {
        entry.closeFailed = true;
        throw error;
      }
      databases.delete(db);
      entry.closed();
    }
    if (signal.aborted) throw signal.reason;
    return resume;
  } catch (error) {
    resume();
    throw error;
  }
});
