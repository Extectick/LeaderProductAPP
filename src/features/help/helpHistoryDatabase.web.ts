import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HelpMessage } from './helpApi';
import type { HelpHistoryRecord } from './helpHistoryTypes';
import { updateHelpHistoryRecord, type HelpHistoryChange } from './helpHistoryRecord';

type WebRecord = { record: HelpHistoryRecord; messages: Record<number, { version: number; message: HelpMessage | null }> };
const writes = new Map<string, Promise<unknown>>();
const keyFor = (scope: string, id: number) => `help:history:v1:${scope}:${id}`;
async function read(scope: string, id: number): Promise<WebRecord | null> {
  const key = keyFor(scope, id); await writes.get(key)?.catch(() => {});
  const value = await AsyncStorage.getItem(key); return value ? JSON.parse(value) : null;
}
async function serialized(key: string, work: () => Promise<void>) {
  const next = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(work); writes.set(key, next);
  try { await next; } finally { if (writes.get(key) === next) writes.delete(key); }
}
export async function readHistoryRecord(scope: string, id: number) { return (await read(scope, id))?.record ?? null; }
export async function readHistoryMessage(scope:string,id:number,messageId:number){return (await read(scope,id))?.messages[messageId]?.message??null;}
export async function listHistoryRecords(scope: string): Promise<HelpHistoryRecord[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(`help:history:v1:${scope}:`));
  const values = await AsyncStorage.multiGet(keys);
  return values.flatMap(([, value]) => value ? [(JSON.parse(value) as WebRecord).record] : []);
}
export async function readHistoryMessages(scope: string, id: number, from: number, to: number, limit = 100, descending = false) {
  const messages = Object.values((await read(scope,id))?.messages ?? {}).map(row => row.message).filter((message):message is HelpMessage=>!!message&&message.sequence >= from && message.sequence <= to).sort((a,b) => a.sequence-b.sequence);
  return descending ? messages.slice(-limit) : messages.slice(0,limit);
}
export async function writeHistoryChange(scope: string, id: number, change: HelpHistoryChange) {
  const key = keyFor(scope,id);
  return serialized(key, async () => {
    const value = await AsyncStorage.getItem(key), previous: WebRecord | null = value ? JSON.parse(value) : null;
    const record = updateHelpHistoryRecord(previous?.record ?? null, change); if (!record) return;
    const messages = { ...previous?.messages };
    const version = change.sync?.snapshotCursor ?? change.sync?.eventCursor ?? change.page?.snapshotCursor ?? change.page?.eventCursor ?? 0;
    for (const message of change.sync?.messages ?? change.page?.messages ?? []) if (!messages[message.id] || messages[message.id].version <= version) messages[message.id] = {message,version};
    for (const messageId of change.sync?.deletedMessageIds ?? []) if ((messages[messageId]?.version ?? 0) <= version) messages[messageId]={message:null,version};
    // The cursor and changed rows share one durable write on web too.
    await AsyncStorage.setItem(key, JSON.stringify({record,messages}));
  });
}
export async function removeHistoryTicket(scope: string, id: number) { return serialized(keyFor(scope,id), () => AsyncStorage.removeItem(keyFor(scope,id))); }

// Browser fallback: serialized writes; native SQLite provides the transactional guarantee.
const accountKey=(scope:string)=>`help:account:v2:${scope}`;
export async function readAccountValue(scope:string,key:string){const value=await AsyncStorage.getItem(accountKey(scope));return value?JSON.parse(value).values?.[key]??null:null;}
export async function writeAccountValue(scope:string,key:string,data:string){await serialized(accountKey(scope),async()=>{const value=JSON.parse(await AsyncStorage.getItem(accountKey(scope))||'{}');value.values={...value.values,[key]:data};await AsyncStorage.setItem(accountKey(scope),JSON.stringify(value));});}
export async function readOutbox(scope:string):Promise<import('./helpDurableTypes').HelpPending[]>{await writes.get(accountKey(scope))?.catch(()=>{});return JSON.parse(await AsyncStorage.getItem(accountKey(scope))||'{}').outbox??[];}
export async function putOutbox(scope:string,item:import('./helpDurableTypes').HelpPending){await serialized(accountKey(scope),async()=>{const value=JSON.parse(await AsyncStorage.getItem(accountKey(scope))||'{}'),items=value.outbox??[],old=items.find((row:any)=>row.key===item.key);if(old&&JSON.stringify(old.input)!==JSON.stringify(item.input))throw new Error('Cannot change pending operation');value.outbox=[...items.filter((row:any)=>row.key!==item.key),item];await AsyncStorage.setItem(accountKey(scope),JSON.stringify(value));});}
export async function deleteOutbox(scope:string,key:string){await serialized(accountKey(scope),async()=>{const value=JSON.parse(await AsyncStorage.getItem(accountKey(scope))||'{}');value.outbox=(value.outbox??[]).filter((row:any)=>row.key!==key);await AsyncStorage.setItem(accountKey(scope),JSON.stringify(value));});}
export async function writeAccountChanges(scope:string,changes:{ticketId:number;change:HelpHistoryChange}[],cursor?:number,completedOperation?:string,resetCursor=false,accountValues?:Record<string,string>,clearMatchingDraft?:{key:string;text:string}){for(const row of changes)await writeHistoryChange(scope,row.ticketId,row.change);if(cursor!==undefined)await writeAccountValue(scope,'events',String(resetCursor?cursor:Math.max(Number(await readAccountValue(scope,'events'))||0,cursor)));for(const [key,value] of Object.entries(accountValues??{}))await writeAccountValue(scope,key,value);if(clearMatchingDraft&&(await readAccountValue(scope,clearMatchingDraft.key))?.trim()===clearMatchingDraft.text.trim())await writeAccountValue(scope,clearMatchingDraft.key,'');if(completedOperation)await deleteOutbox(scope,completedOperation);}
export async function readHistorySnapshot(scope:string,id:number,sequence?:number){const value=await read(scope,id);if(!value)return null;const record=value.record,target=sequence??record.lastSequence;const range=record.ranges.find(r=>target>=r.from&&target<=r.to)??(!sequence?record.ranges.at(-1):undefined);if(!range)return {record,messages:[]};const messages=Object.values(value.messages).map(r=>r.message).filter((r):r is HelpMessage=>!!r&&r.sequence>=range.from&&r.sequence<=range.to).sort((a,b)=>a.sequence-b.sequence);return {record,messages:sequence?[...messages.filter(r=>r.sequence<=target).slice(-40),...messages.filter(r=>r.sequence>target).slice(0,100-Math.min(40,messages.filter(r=>r.sequence<=target).length))]:messages.slice(-100)};}

export async function maintainHelpHistory(_scope:string,_activeTicketId:number|null){return {removedMessages:0,evictedTickets:0};}

export async function resetHelpDownloadedState(scope:string){for(const record of await listHistoryRecords(scope)){const key=keyFor(scope,record.ticket.id);await serialized(key,()=>AsyncStorage.setItem(key,JSON.stringify({record:{...record,ranges:[],syncCursor:0,snapshotCursor:0,lastSequence:0,lastReadSequence:0,firstUnreadSequence:null},messages:{}})));}}

export async function insertAccountValueIfAbsent(scope:string,key:string,data:string):Promise<string>{let winner=data;await serialized(accountKey(scope),async()=>{const value=JSON.parse(await AsyncStorage.getItem(accountKey(scope))||'{}');value.values={...value.values};if(value.values[key]===undefined)value.values[key]=data;winner=value.values[key];await AsyncStorage.setItem(accountKey(scope),JSON.stringify(value));});return winner;}
