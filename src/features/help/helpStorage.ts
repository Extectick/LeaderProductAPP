import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/utils/config';
import type { HelpDetail, HelpMessageInput } from './helpApi';
import { readOutbox, putOutbox, deleteOutbox, readAccountValue, insertAccountValueIfAbsent, writeAccountValue, writeAccountChanges } from './helpHistoryDatabase';
import { helpHistoryScope } from './helpHistory';
import type { HelpPending } from './helpDurableTypes';
export type { HelpPending } from './helpDurableTypes';
const writes = new Map<string, Promise<unknown>>();
export const helpStorageKey = (userId: number, name: string) => `help:v1:${encodeURIComponent(API_BASE_URL)}:${userId}:${name}`;
export const helpClientId = () => `help-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = writes.get(key) || Promise.resolve();
    const next = previous.catch(() => { }).then(action);
    writes.set(key, next);
    try {
        return await next;
    }
    finally {
        if (writes.get(key) === next)
            writes.delete(key);
    }
}
const outboxObservers = new Map<number, Set<() => void>>();
const notifyOutbox = (userId: number) => { outboxObservers.get(userId)?.forEach(listener => listener()); };
export function subscribeHelpOutbox(userId: number, listener: () => void) { let observers = outboxObservers.get(userId); if (!observers) {
    observers = new Set();
    outboxObservers.set(userId, observers);
} observers.add(listener); return () => { observers!.delete(listener); if (!observers!.size)
    outboxObservers.delete(userId); }; }
const migrations = new Map<string, Promise<void>>();
async function migratePending(userId: number) {
    const scope = helpHistoryScope(userId), existing = migrations.get(scope);
    if (existing)
        return existing;
    const work = (async () => {
        if (await readAccountValue(scope, 'outbox-migrated'))
            return;
        const key = helpStorageKey(userId, 'pending'), raw = await AsyncStorage.getItem(key);
        if (raw) {
            const items = JSON.parse(raw);
            if (!Array.isArray(items))
                throw new Error('Cannot read saved pending messages');
            for (const item of items)
                await putOutbox(scope, { ...item, status: item.status ?? 'queued' });
        }
        await writeAccountValue(scope, 'outbox-migrated', '1');
        if (raw)
            await AsyncStorage.removeItem(key);
    })();
    migrations.set(scope, work);
    try {
        await work;
    }
    catch (error) {
        migrations.delete(scope);
        throw error;
    }
}
export async function readHelpPending(userId: number): Promise<HelpPending[]> { await migratePending(userId); return readOutbox(helpHistoryScope(userId)); }
export async function saveHelpPending(userId: number, item: HelpPending) { await migratePending(userId); await putOutbox(helpHistoryScope(userId), item); notifyOutbox(userId); }
export async function removeHelpPending(userId: number, id: string) { await migratePending(userId); await deleteOutbox(helpHistoryScope(userId), id); notifyOutbox(userId); }
/** The accepted server page and outbox acknowledgement commit together. */
export async function confirmHelpPending(userId: number, key: string, detail: HelpDetail) {
    const first = detail.messages[0]?.sequence, last = detail.messages.at(-1)?.sequence ?? 0;
    const item=(await readOutbox(helpHistoryScope(userId))).find(row=>row.key===key);
    const mapping=item?.create?{'last-created':JSON.stringify({key,ticketId:detail.ticket.id,text:item.input.text,sourceTicketId:item.input.sourceTicketId,createdAt:Date.now()})}:undefined;
    await writeAccountChanges(helpHistoryScope(userId), [{ ticketId: detail.ticket.id, change: { ticket: detail.ticket, page: { messages: detail.messages, nextCursor: detail.nextCursor ?? null, olderCursor: detail.olderCursor ?? null, newerCursor: detail.newerCursor ?? null, hasOlder: detail.hasOlder ?? detail.messages.length >= 100, hasNewer: detail.hasNewer ?? false, lastSequence: detail.lastSequence ?? detail.ticket.lastSequence ?? last, lastReadSequence: detail.lastReadSequence ?? detail.ticket.lastReadSequence ?? 0, firstUnreadSequence: detail.firstUnreadSequence ?? null, eventCursor: detail.eventCursor ?? 0, snapshotCursor: detail.snapshotCursor ?? detail.eventCursor ?? 0 } } }], undefined, key, false, mapping,item?.create?{key:`draft:new:${item.input.sourceTicketId??'plain'}`,text:item.input.text}:undefined);
    notifyOutbox(userId);
}
export function helpRetryDelay(attempts: number, random = Math.random()) { return Math.min(300000, 1000 * 2 ** Math.min(attempts, 8)) * (.75 + random * .5); }
export async function hasPresentedHelpNotification(userId: number, eventId: number) { return (JSON.parse(await readAccountValue(helpHistoryScope(userId), 'presented-events') || '[]') as number[]).includes(eventId); }
export async function markHelpNotificationPresented(userId: number, eventId: number) {
    const scope = helpHistoryScope(userId);
    await serialized(`${scope}:notifications`, async () => { const events = JSON.parse(await readAccountValue(scope, 'presented-events') || '[]') as number[]; if (!events.includes(eventId))
        await writeAccountValue(scope, 'presented-events', JSON.stringify([...events, eventId].slice(-1000))); });
}
export async function getHelpDraft(userId: number, key: string) {
    const scope = helpHistoryScope(userId), value = await readAccountValue(scope, `draft:${key}`);
    if (value !== null)
        return value;
    const oldKey = helpStorageKey(userId, `draft:${key}`), old = await AsyncStorage.getItem(oldKey) || '';
    const winner=await insertAccountValueIfAbsent(scope,`draft:${key}`,old);
    if (old)
        await AsyncStorage.removeItem(oldKey);
    return winner;
}
export async function setHelpDraft(userId: number, key: string, text: string) { return writeAccountValue(helpHistoryScope(userId), `draft:${key}`, text); }
export function sameHelpPayload(a: HelpMessageInput, b: HelpMessageInput) {
    return a.text === b.text && JSON.stringify(a.attachmentIds || []) === JSON.stringify(b.attachmentIds || [])
        && a.replyToId === b.replyToId && a.forwardedFromId === b.forwardedFromId;
}

export type HelpCreatedOperation={key:string;ticketId:number;text:string;sourceTicketId?:number;createdAt:number};
export async function readLastCreatedOperation(userId:number):Promise<HelpCreatedOperation|null>{const raw=await readAccountValue(helpHistoryScope(userId),'last-created');return raw?JSON.parse(raw):null;}
