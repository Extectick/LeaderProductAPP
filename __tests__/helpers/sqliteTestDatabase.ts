// Real SQLite engine for storage regression tests. Only Expo's async bridge is
// adapted; application SQL, transactions, constraints and rollbacks run as-is.
import { DatabaseSync } from 'node:sqlite';

export class SQLiteTestDatabase {
  private native: DatabaseSync;

  constructor(public databasePath: string) {
    // Match Expo's new transaction connections (no busy timeout / FK pragma).
    this.native = new DatabaseSync(databasePath, { enableForeignKeyConstraints: false, timeout: 0 });
  }

  async execAsync(sql: string) { this.native.exec(sql); }
  async closeAsync() { this.native.close(); }
  async prepareAsync(sql: string) {
    const statement = this.native.prepare(sql);
    let closed = false;
    return {
      async executeAsync(...params: any[]) {
        if (closed) throw new Error('Statement already finalized');
        const args = Array.isArray(params[0]) ? params[0] : params;
        return statement.run(...args);
      },
      async finalizeAsync() { closed = true; },
    };
  }
  async runAsync(sql: string, ...params: any[]) {
    const statement = await this.prepareAsync(sql);
    try { return await statement.executeAsync(...params); }
    finally { await statement.finalizeAsync(); }
  }
  async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    return this.native.prepare(sql).all(...params) as T[];
  }
  async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    return (this.native.prepare(sql).get(...params) as T) ?? null;
  }
  async withExclusiveTransactionAsync(task: (tx: SQLiteTestDatabase) => Promise<void>) {
    const tx = new SQLiteTestDatabase(this.databasePath);
    try {
      await tx.execAsync('BEGIN');
      await task(tx);
      await tx.execAsync('COMMIT');
    } catch (error) {
      await tx.execAsync('ROLLBACK');
      throw error;
    } finally {
      await tx.closeAsync();
    }
  }
}
