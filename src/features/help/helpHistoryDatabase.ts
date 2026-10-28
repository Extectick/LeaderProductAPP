import * as SQLite from 'expo-sqlite';
import { assertSQLiteAvailable, manageSQLiteConnection, withSQLiteActivity } from '@/src/shared/storage/sqliteLifecycle';
import { withSQLiteWriteTransaction } from '@/src/shared/storage/sqliteWriteQueue';
import type { HelpMessage } from './helpApi';
import type { HelpHistoryRecord } from './helpHistoryTypes';
import { updateHelpHistoryRecord, type HelpHistoryChange } from './helpHistoryRecord';

let opening: Promise<SQLite.SQLiteDatabase> | null = null;
async function database() {
  assertSQLiteAvailable();
  if (!opening) opening = withSQLiteActivity(async () => {
    const db = await SQLite.openDatabaseAsync('help-history-v1.db', { useNewConnection: true, finalizeUnusedStatementsBeforeClosing: false });
    try {
      await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS help_history_tickets (scope TEXT NOT NULL, ticket_id INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,ticket_id));
        CREATE TABLE IF NOT EXISTS help_history_messages (scope TEXT NOT NULL, ticket_id INTEGER NOT NULL, message_id INTEGER NOT NULL, sequence INTEGER NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,ticket_id,message_id));
        CREATE INDEX IF NOT EXISTS help_history_sequence ON help_history_messages(scope,ticket_id,sequence);`);
      manageSQLiteConnection(db, () => { opening = null; });
      return db;
    } catch (error) { await db.closeAsync().catch(() => {}); throw error; }
  }).catch(error => { opening = null; throw error; });
  return opening;
}
export async function readHistoryRecord(scope: string, ticketId: number): Promise<HelpHistoryRecord | null> {
  const row = await (await database()).getFirstAsync<{data:string}>('SELECT data FROM help_history_tickets WHERE scope=? AND ticket_id=?', scope, ticketId);
  return row ? JSON.parse(row.data) : null;
}
export async function listHistoryRecords(scope: string): Promise<HelpHistoryRecord[]> {
  const rows = await (await database()).getAllAsync<{data:string}>('SELECT data FROM help_history_tickets WHERE scope=?', scope);
  return rows.map(row => JSON.parse(row.data));
}
export async function readHistoryMessages(scope: string, ticketId: number, from: number, to: number, limit = 100, descending = false): Promise<HelpMessage[]> {
  const rows = await (await database()).getAllAsync<{data:string}>(`SELECT data FROM help_history_messages WHERE scope=? AND ticket_id=? AND sequence>=? AND sequence<=? AND data!='null' ORDER BY sequence ${descending ? 'DESC' : 'ASC'} LIMIT ?`, scope, ticketId, from, to, limit);
  const messages: HelpMessage[] = rows.map(row => JSON.parse(row.data));
  return descending ? messages.reverse() : messages;
}
export async function readHistoryMessage(scope:string,ticketId:number,messageId:number):Promise<HelpMessage|null>{
  const row=await(await database()).getFirstAsync<{data:string}>('SELECT data FROM help_history_messages WHERE scope=? AND ticket_id=? AND message_id=?',scope,ticketId,messageId);
  return row?JSON.parse(row.data):null;
}
export async function writeHistoryChange(scope: string, ticketId: number, change: HelpHistoryChange) {
  const db = await database();
  await withSQLiteWriteTransaction(db, async tx => {
    const row = await tx.getFirstAsync<{data:string}>('SELECT data FROM help_history_tickets WHERE scope=? AND ticket_id=?', scope, ticketId);
    const previous: HelpHistoryRecord | null = row ? JSON.parse(row.data) : null;
    const record = updateHelpHistoryRecord(previous, change);
    if (!record) return;
    const version = change.sync?.snapshotCursor ?? change.sync?.eventCursor ?? change.page?.snapshotCursor ?? change.page?.eventCursor ?? 0;
    for (const message of change.sync?.messages ?? change.page?.messages ?? []) {
      await tx.runAsync(`INSERT INTO help_history_messages(scope,ticket_id,message_id,sequence,version,data) VALUES(?,?,?,?,?,?)
        ON CONFLICT(scope,ticket_id,message_id) DO UPDATE SET sequence=excluded.sequence,version=excluded.version,data=excluded.data WHERE excluded.version>=help_history_messages.version`,
      scope, ticketId, message.id, message.sequence, version, JSON.stringify(message));
    }
    // Keep a versioned tombstone so a slower old page cannot resurrect a deleted row.
    for (const id of change.sync?.deletedMessageIds ?? []) await tx.runAsync(`INSERT INTO help_history_messages(scope,ticket_id,message_id,sequence,version,data) VALUES(?,?,?,0,?,'null')
      ON CONFLICT(scope,ticket_id,message_id) DO UPDATE SET version=excluded.version,data='null' WHERE excluded.version>=help_history_messages.version`,scope,ticketId,id,version);
    await tx.runAsync('INSERT INTO help_history_tickets(scope,ticket_id,data) VALUES(?,?,?) ON CONFLICT(scope,ticket_id) DO UPDATE SET data=excluded.data', scope, ticketId, JSON.stringify(record));
  });
}
export async function removeHistoryTicket(scope: string, ticketId: number) {
  await withSQLiteWriteTransaction(await database(), async tx => {
    await tx.runAsync('DELETE FROM help_history_messages WHERE scope=? AND ticket_id=?', scope, ticketId);
    await tx.runAsync('DELETE FROM help_history_tickets WHERE scope=? AND ticket_id=?', scope, ticketId);
  });
}
