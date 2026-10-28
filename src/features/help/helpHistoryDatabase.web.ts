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
