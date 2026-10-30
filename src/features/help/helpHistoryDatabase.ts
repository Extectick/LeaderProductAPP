import * as SQLite from 'expo-sqlite';
import { assertSQLiteAvailable, manageSQLiteConnection, withSQLiteActivity } from '@/src/shared/storage/sqliteLifecycle';
import { withSQLiteWriteTransaction } from '@/src/shared/storage/sqliteWriteQueue';
import type { HelpMessage } from './helpApi';
import type { HelpHistoryRecord } from './helpHistoryTypes';
import type { HelpPending } from './helpDurableTypes';
import { updateHelpHistoryRecord, type HelpHistoryChange } from './helpHistoryRecord';
function parseRecord(raw:string):HelpHistoryRecord|null {
  try{const value=JSON.parse(raw);return value&&Number.isSafeInteger(value.ticket?.id)&&Array.isArray(value.ranges)&&Number.isSafeInteger(value.syncCursor)?value:null;}catch{return null;}
}
let opening: Promise<SQLite.SQLiteDatabase> | null = null;
async function database() {
    assertSQLiteAvailable();
    if (!opening)
        opening = withSQLiteActivity(async () => {
            const db = await SQLite.openDatabaseAsync('help-history-v1.db', { useNewConnection: true, finalizeUnusedStatementsBeforeClosing: false });
            try {
                const schema = await db.getFirstAsync<{
                    user_version: number;
                }>('PRAGMA user_version');
                if ((schema?.user_version ?? 0) > 1)
                    throw new Error('Help database requires a newer application');
                await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS help_history_tickets (scope TEXT NOT NULL, ticket_id INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,ticket_id));
        CREATE TABLE IF NOT EXISTS help_history_messages (scope TEXT NOT NULL, ticket_id INTEGER NOT NULL, message_id INTEGER NOT NULL, sequence INTEGER NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,ticket_id,message_id));
        CREATE INDEX IF NOT EXISTS help_history_sequence ON help_history_messages(scope,ticket_id,sequence);`);
                await withSQLiteWriteTransaction(db, async (tx) => {
                    const version = await tx.getFirstAsync<{
                        user_version: number;
                    }>('PRAGMA user_version');
                    if ((version?.user_version ?? 0) > 1)
                        throw new Error('Help database requires a newer application');
                    if ((version?.user_version ?? 0) < 1)
                        await tx.execAsync(`
          CREATE TABLE IF NOT EXISTS help_outbox(scope TEXT NOT NULL, operation_id TEXT NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,operation_id));
          CREATE TABLE IF NOT EXISTS help_account_state(scope TEXT NOT NULL, state_key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,state_key));
          PRAGMA user_version = 1;`);
                });
                manageSQLiteConnection(db, () => { opening = null; });
                return db;
            }
            catch (error) {
                await db.closeAsync().catch(() => { });
                throw error;
            }
        }).catch(error => { opening = null; throw error; });
    return opening;
}
export async function readHistoryRecord(scope: string, ticketId: number): Promise<HelpHistoryRecord | null> {
    const row = await (await database()).getFirstAsync<{
        data: string;
    }>('SELECT data FROM help_history_tickets WHERE scope=? AND ticket_id=?', scope, ticketId);
    return row ? parseRecord(row.data) : null;
}
export async function listHistoryRecords(scope: string): Promise<HelpHistoryRecord[]> {
    const rows = await (await database()).getAllAsync<{
        data: string;
    }>('SELECT data FROM help_history_tickets WHERE scope=?', scope);
    return rows.flatMap(row=>{const record=parseRecord(row.data);return record?[record]:[];});
}
export async function readHistoryMessages(scope: string, ticketId: number, from: number, to: number, limit = 100, descending = false): Promise<HelpMessage[]> {
    const rows = await (await database()).getAllAsync<{
        data: string;
    }>(`SELECT data FROM help_history_messages WHERE scope=? AND ticket_id=? AND sequence>=? AND sequence<=? AND data!='null' ORDER BY sequence ${descending ? 'DESC' : 'ASC'} LIMIT ?`, scope, ticketId, from, to, limit);
    const messages: HelpMessage[] = rows.map(row => JSON.parse(row.data));
    return descending ? messages.reverse() : messages;
}
export async function readHistoryMessage(scope: string, ticketId: number, messageId: number): Promise<HelpMessage | null> {
    const row = await (await database()).getFirstAsync<{
        data: string;
    }>('SELECT data FROM help_history_messages WHERE scope=? AND ticket_id=? AND message_id=?', scope, ticketId, messageId);
    return row ? JSON.parse(row.data) : null;
}
async function applyChange(tx: SQLite.SQLiteDatabase, scope: string, ticketId: number, change: HelpHistoryChange) {
    const row = await tx.getFirstAsync<{
        data: string;
    }>('SELECT data FROM help_history_tickets WHERE scope=? AND ticket_id=?', scope, ticketId);
    const previous: HelpHistoryRecord | null = row ? parseRecord(row.data) : null;
    const record = updateHelpHistoryRecord(previous, change);
    if (!record)
        return;
    const version = change.sync?.snapshotCursor ?? change.sync?.eventCursor ?? change.page?.snapshotCursor ?? change.page?.eventCursor ?? 0;
    for (const message of change.sync?.messages ?? change.page?.messages ?? []) {
        await tx.runAsync(`INSERT INTO help_history_messages(scope,ticket_id,message_id,sequence,version,data) VALUES(?,?,?,?,?,?)
        ON CONFLICT(scope,ticket_id,message_id) DO UPDATE SET sequence=excluded.sequence,version=excluded.version,data=excluded.data WHERE excluded.version>=help_history_messages.version`, scope, ticketId, message.id, message.sequence, version, JSON.stringify(message));
    }
    // Keep a versioned tombstone so a slower old page cannot resurrect a deleted row.
    for (const id of change.sync?.deletedMessageIds ?? [])
        await tx.runAsync(`INSERT INTO help_history_messages(scope,ticket_id,message_id,sequence,version,data) VALUES(?,?,?,0,?,'null')
      ON CONFLICT(scope,ticket_id,message_id) DO UPDATE SET version=excluded.version,data='null' WHERE excluded.version>=help_history_messages.version`, scope, ticketId, id, version);
    await tx.runAsync('INSERT INTO help_history_tickets(scope,ticket_id,data) VALUES(?,?,?) ON CONFLICT(scope,ticket_id) DO UPDATE SET data=excluded.data', scope, ticketId, JSON.stringify(record));
}
export async function writeHistoryChange(scope: string, ticketId: number, change: HelpHistoryChange) {
    await withSQLiteWriteTransaction(await database(), tx => applyChange(tx, scope, ticketId, change));
}
export async function writeAccountChanges(scope: string, changes: {
    ticketId: number;
    change: HelpHistoryChange;
}[], cursor?: number, completedOperation?: string, resetCursor = false, accountValues?:Record<string,string>,clearMatchingDraft?:{key:string;text:string}) {
    await withSQLiteWriteTransaction(await database(), async (tx) => {
        for (const item of changes)
            await applyChange(tx, scope, item.ticketId, item.change);
        if (cursor !== undefined && resetCursor)
            await tx.runAsync("INSERT INTO help_account_state(scope,state_key,data) VALUES(?,'events',?) ON CONFLICT(scope,state_key) DO UPDATE SET data=excluded.data", scope, String(cursor));
        else if (cursor !== undefined)
            await tx.runAsync("INSERT INTO help_account_state(scope,state_key,data) VALUES(?,'events',?) ON CONFLICT(scope,state_key) DO UPDATE SET data=CAST(MAX(CAST(data AS INTEGER),CAST(excluded.data AS INTEGER)) AS TEXT)", scope, String(cursor));
        for(const [key,value] of Object.entries(accountValues??{}))await tx.runAsync('INSERT INTO help_account_state(scope,state_key,data) VALUES(?,?,?) ON CONFLICT(scope,state_key) DO UPDATE SET data=excluded.data',scope,key,value);
        if(clearMatchingDraft){const draft=await tx.getFirstAsync<{data:string}>('SELECT data FROM help_account_state WHERE scope=? AND state_key=?',scope,clearMatchingDraft.key);if(draft?.data.trim()===clearMatchingDraft.text.trim())await tx.runAsync("UPDATE help_account_state SET data='' WHERE scope=? AND state_key=?",scope,clearMatchingDraft.key);}
        if (completedOperation)
            await tx.runAsync('DELETE FROM help_outbox WHERE scope=? AND operation_id=?', scope, completedOperation);
    });
}
export async function removeHistoryTicket(scope: string, ticketId: number) {
    await withSQLiteWriteTransaction(await database(), async (tx) => {
        await tx.runAsync('DELETE FROM help_history_messages WHERE scope=? AND ticket_id=?', scope, ticketId);
        await tx.runAsync('DELETE FROM help_history_tickets WHERE scope=? AND ticket_id=?', scope, ticketId);
    });
}
export async function readHistorySnapshot(scope: string, ticketId: number, sequence?: number): Promise<{
    record: HelpHistoryRecord;
    messages: HelpMessage[];
} | null> {
    let result: {
        record: HelpHistoryRecord;
        messages: HelpMessage[];
    } | null = null;
    await withSQLiteWriteTransaction(await database(), async (tx) => {
        const row = await tx.getFirstAsync<{
            data: string;
        }>('SELECT data FROM help_history_tickets WHERE scope=? AND ticket_id=?', scope, ticketId);
        if (!row)
            return;
        const record=parseRecord(row.data);if(!record)return;const target=sequence??record.lastSequence;
        const range = record.ranges.find(r => target >= r.from && target <= r.to) ?? (!sequence ? record.ranges.at(-1) : undefined);
        if (!range) {
            result = { record, messages: [] };
            return;
        }
        const get = async (from: number, to: number, limit: number, desc = false) => {
            const rows = await tx.getAllAsync<{
                data: string;
            }>(`SELECT data FROM help_history_messages WHERE scope=? AND ticket_id=? AND sequence>=? AND sequence<=? AND data!='null' ORDER BY sequence ${desc ? 'DESC' : 'ASC'} LIMIT ?`, scope, ticketId, from, to, limit);
            const messages: HelpMessage[] = rows.map(r => JSON.parse(r.data));
            return desc ? messages.reverse() : messages;
        };
        const before = sequence ? await get(range.from, target, 40, true) : [];
        result = { record, messages: sequence ? [...before, ...await get(target + 1, range.to, 100 - before.length)] : await get(range.from, range.to, 100, true) };
    });
    return result;
}
export async function readAccountValue(scope: string, key: string): Promise<string | null> {
    const row = await (await database()).getFirstAsync<{
        data: string;
    }>('SELECT data FROM help_account_state WHERE scope=? AND state_key=?', scope, key);
    return row?.data ?? null;
}
export async function writeAccountValue(scope: string, key: string, data: string) {
    await withSQLiteWriteTransaction(await database(), async (tx) => { await tx.runAsync('INSERT INTO help_account_state(scope,state_key,data) VALUES(?,?,?) ON CONFLICT(scope,state_key) DO UPDATE SET data=excluded.data', scope, key, data); });
}
export async function readOutbox(scope: string): Promise<HelpPending[]> {
    const rows = await (await database()).getAllAsync<{
        data: string;
    }>('SELECT data FROM help_outbox WHERE scope=? ORDER BY created_at,operation_id', scope);
    return rows.map(row => JSON.parse(row.data));
}
export async function putOutbox(scope: string, item: HelpPending) {
    await withSQLiteWriteTransaction(await database(), async (tx) => {
        const old = await tx.getFirstAsync<{
            data: string;
        }>('SELECT data FROM help_outbox WHERE scope=? AND operation_id=?', scope, item.key);
        if (old && JSON.stringify(JSON.parse(old.data).input) !== JSON.stringify(item.input))
            throw new Error('Pending operation payload cannot be changed');
        await tx.runAsync('INSERT INTO help_outbox(scope,operation_id,created_at,data) VALUES(?,?,?,?) ON CONFLICT(scope,operation_id) DO UPDATE SET data=excluded.data', scope, item.key, item.createdAt, JSON.stringify(item));
    });
}
export async function deleteOutbox(scope: string, key: string) { await withSQLiteWriteTransaction(await database(), async (tx) => { await tx.runAsync('DELETE FROM help_outbox WHERE scope=? AND operation_id=?', scope, key); }); }
/** Evict only downloaded history. Drafts/outbox remain durable and untouched. */
export async function maintainHelpHistory(scope: string, activeTicketId: number | null, maxRows = 20000, maxAgeMs = 90 * 86400000) {
    let removedMessages = 0, evictedTickets = 0;
    await withSQLiteWriteTransaction(await database(), async (tx) => {
        const rows = await tx.getAllAsync<{
            ticket_id: number;
            data: string;
        }>('SELECT ticket_id,data FROM help_history_tickets WHERE scope=?', scope);
        const pending = await tx.getAllAsync<{
            data: string;
        }>('SELECT data FROM help_outbox WHERE scope=?', scope);
        const protectedIds = new Set<number>(pending.flatMap(row => { try {
            return [JSON.parse(row.data).ticketId];
        }
        catch {
            return [];
        } }));
        if (activeTicketId !== null)
            protectedIds.add(activeTicketId);
        const count = await tx.getFirstAsync<{
            n: number;
        }>('SELECT COUNT(*) AS n FROM help_history_messages WHERE scope=?', scope);
        let remaining = count?.n ?? 0;
        const records = rows.flatMap(row => { try {
            return [{ id: row.ticket_id, record: JSON.parse(row.data) as HelpHistoryRecord }];
        }
        catch {
            return [];
        } }).sort((a, b) => a.record.updatedAt - b.record.updatedAt);
        for (const row of records) {
            if (protectedIds.has(row.id) || !row.record.ranges.length || remaining <= maxRows && Date.now() - row.record.updatedAt < maxAgeMs)
                continue;
            const messages = await tx.getFirstAsync<{
                n: number;
            }>('SELECT COUNT(*) AS n FROM help_history_messages WHERE scope=? AND ticket_id=?', scope, row.id);
            await tx.runAsync('DELETE FROM help_history_messages WHERE scope=? AND ticket_id=?', scope, row.id);
            const record = { ...row.record, ranges: [], anchor: null, syncCursor: 0, snapshotCursor: 0 };
            await tx.runAsync('UPDATE help_history_tickets SET data=? WHERE scope=? AND ticket_id=?', JSON.stringify(record), scope, row.id);
            remaining -= messages?.n ?? 0;
            removedMessages += messages?.n ?? 0;
            evictedTickets++;
        }
    });
    return { removedMessages, evictedTickets };
}

/** A server-declared expired/future cursor invalidates downloaded versions, not user work. */
export async function resetHelpDownloadedState(scope:string){
  await withSQLiteWriteTransaction(await database(),async tx=>{
    const records=await tx.getAllAsync<{ticket_id:number;data:string}>('SELECT ticket_id,data FROM help_history_tickets WHERE scope=?',scope);
    await tx.runAsync('DELETE FROM help_history_messages WHERE scope=?',scope);
    for(const row of records){let record:HelpHistoryRecord;try{record=JSON.parse(row.data);}catch{await tx.runAsync('DELETE FROM help_history_tickets WHERE scope=? AND ticket_id=?',scope,row.ticket_id);continue;}
      await tx.runAsync('UPDATE help_history_tickets SET data=? WHERE scope=? AND ticket_id=?',JSON.stringify({...record,ranges:[],syncCursor:0,snapshotCursor:0,lastSequence:0,lastReadSequence:0,firstUnreadSequence:null}),scope,row.ticket_id);
    }
  });
}

/** Preserve a concurrent edit when importing an older AsyncStorage draft. */
export async function insertAccountValueIfAbsent(scope:string,key:string,data:string):Promise<string>{
  let value=data;
  await withSQLiteWriteTransaction(await database(),async tx=>{
    await tx.runAsync('INSERT OR IGNORE INTO help_account_state(scope,state_key,data) VALUES(?,?,?)',scope,key,data);
    const row=await tx.getFirstAsync<{data:string}>('SELECT data FROM help_account_state WHERE scope=? AND state_key=?',scope,key);value=row?.data??data;
  });return value;
}
