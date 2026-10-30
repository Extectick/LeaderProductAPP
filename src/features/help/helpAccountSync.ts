import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {subscribePushRegistrationChanges} from '@/utils/pushRegistrationEvents';
import type { Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/utils/config';
import { createHelpSocket } from './helpSocket';
import { createHelpApi, HelpApiError } from './helpApi';
import type { HelpEvent } from './helpHistoryTypes';
import type { HelpHistoryChange } from './helpHistoryRecord';
import { helpHistoryScope } from './helpHistory';
import { readAccountValue, writeAccountChanges, readHistoryRecord, listHistoryRecords, removeHistoryTicket, maintainHelpHistory,resetHelpDownloadedState } from './helpHistoryDatabase';
import { readHelpPending, helpClientId } from './helpStorage';
import { dispatchHelpPending } from './helpOutbox';
export type HelpAccountNotice = {
    type: 'event';
    event: HelpEvent;
} | {
    type: 'ticket';
    ticketId: number;
} | {
    type: 'revoked';
    ticketId: number;
} | {
    type: 'connected';
    connected: boolean;
} | {
    type: 'error';
    error: unknown;
} | {
    type: 'outbox';
} | {type:'healthy';};
type Listener = (notice: HelpAccountNotice) => void;
type Account = ReturnType<typeof createAccount>;
const accounts = new Map<string, Account>();
const keyFor = (id: number) => `${API_BASE_URL}:${id}`;
function foreground() { return Platform.OS === 'web' ? typeof document !== 'undefined' && document.visibilityState === 'visible' : AppState.currentState === 'active'; }
function createAccount(userId: number) {
    const api = createHelpApi(userId), scope = helpHistoryScope(userId), listeners = new Set<Listener>(), sessionId = helpClientId();
    let alive = true, refs = 0, replay: Promise<void> | null = null, again = false, deviceId = '', pushToken: string | null = null, maintenanceAt = 0, ticketId: number | null = null, active = foreground();
    const liveEvents = new Set<number>();
    const jobs = new Map<number, Promise<HelpHistoryChange[]>>();
    const emit = (notice: HelpAccountNotice) => { if (alive)
        for (const listener of listeners) {
            try {
                listener(notice);
            }
            catch { /* One observer cannot break persistence. */ }
        } };
    const valid = () => alive;
    let presenceTail:Promise<boolean>=Promise.resolve(false);
    const persistPresence=()=>{
        const work=presenceTail.catch(()=>false).then(async()=>{
            try{pushToken=await AsyncStorage.getItem('pushToken');}catch{}
            const socket=connection.getSocket();if(!alive||!socket?.connected)return false;
            return new Promise<boolean>(resolve=>{
                const timer=setTimeout(()=>resolve(false),1000);
                socket.emit('help:presence',{sessionId,deviceId:deviceId||sessionId,pushToken:pushToken??undefined,active:active&&foreground(),ticketId:active&&foreground()?ticketId:null},(reply:{ok?:boolean})=>{clearTimeout(timer);resolve(Boolean(reply?.ok));});
            });
        });presenceTail=work;return work;
    };
    async function syncTicket(id: number): Promise<HelpHistoryChange[]> {
        const pending = jobs.get(id);
        if (pending)
            return pending;
        const work = (async () => {
            const changes: HelpHistoryChange[] = [];
            let cursor = (await readHistoryRecord(scope, id))?.syncCursor ?? 0;
            for (let pages = 0; pages < 100 && valid(); pages++) {
                const result = await api.sync(id, cursor);
                if (!valid())
                    return [];
                if (result.nextCursor < cursor || result.hasMore && result.nextCursor === cursor)
                    throw new Error('Некорректный курсор синхронизации');
                const change = { sync: result };
                await writeAccountChanges(scope, [{ ticketId: id, change }]);
                changes.push(change);
                cursor = result.nextCursor;
                if (!result.hasMore) {
                    emit({ type: 'ticket', ticketId: id });
                    return changes;
                }
            }
            throw new Error('Слишком большой объём синхронизации; повторите подключение');
        })().catch(async (error) => {
            if (error instanceof HelpApiError && [403, 404].includes(error.status)) {
                await removeHistoryTicket(scope, id);
                emit({ type: 'revoked', ticketId: id });
                return [];
            }
            throw error;
        });
        jobs.set(id, work);
        try {
            return await work;
        }
        finally {
            if (jobs.get(id) === work)
                jobs.delete(id);
        }
    }
    async function flushOutbox() {
        const pending = await readHelpPending(userId);
        for (const item of pending) {
            if (!valid())
                return;
            if (item.status === 'failed' || (item.nextAttemptAt ?? 0) > Date.now())
                continue;
            try {
                const detail = await dispatchHelpPending(userId, item);
                if (valid()) {
                    emit({ type: 'ticket', ticketId: detail.ticket.id });
                    emit({ type: 'outbox' });
                }
            }
            catch (error) {
                emit({ type: 'error', error });
                break;
            }
        }
    }
    async function refresh() {
        if (replay) {
            again = true;
            return replay;
        }
        const work = (async () => {
            do {
                again = false;
                let cursor = Number(await readAccountValue(scope, 'events')) || 0;
                for (let page = 0; page < 100 && valid(); page++) {
                    const result = await api.events(cursor);
                    if (!valid())
                        return;
                    if (result.resyncRequired) {
                        await resetHelpDownloadedState(scope);
                        // Rebuild current authorized metadata without deleting drafts or pending sends.
                        const config = await api.config();
                        for (const listScope of config.canManage ? ['mine', 'queue'] : ['mine'])
                            for (const status of ['OPEN', 'CLOSED']) {
                                let after: string | number | undefined;
                                do {
                                    const list = await api.list(status, listScope, after);
                                    await writeAccountChanges(scope, list.tickets.map(ticket => ({ ticketId: ticket.id, change: { ticket } })));
                                    for (const ticket of list.tickets)
                                        emit({ type: 'ticket', ticketId: ticket.id });
                                    after = list.nextCursor ?? undefined;
                                } while (after !== undefined && valid());
                            }
                        for (const record of await listHistoryRecords(scope))
                            await syncTicket(record.ticket.id);
                    }
                    if (result.visibilityComplete && result.visibleTicketIds) {
                        const visible = new Set(result.visibleTicketIds);
                        for (const record of await listHistoryRecords(scope))
                            if (!visible.has(record.ticket.id)) {
                                await removeHistoryTicket(scope, record.ticket.id);
                                emit({ type: 'revoked', ticketId: record.ticket.id });
                            }
                    }
                    const ids = [...new Set(result.events.map(event => event.ticketId))];
                    const changes: {
                        ticketId: number;
                        change: HelpHistoryChange;
                    }[] = [];
                    for (const id of ids) {
                        for (const change of await syncTicket(id))
                            changes.push({ ticketId: id, change });
                    }
                    if (!valid())
                        return;
                    const next = result.resyncRequired ? (result.snapshotCursor ?? result.nextCursor) : result.nextCursor;
                    if (!result.resyncRequired && next < cursor || result.hasMore && next === cursor)
                        throw new Error('Некорректный курсор списка обращений');
                    // Account cursor cannot commit ahead of any corresponding ticket data.
                    await writeAccountChanges(scope, changes, next, undefined, Boolean(result.resyncRequired));
                    emit({type:'healthy'});
                    for (const event of result.events)
                        if (liveEvents.delete(event.id))
                            emit({ type: 'event', event });
                    cursor = next;
                    if (!result.hasMore)
                        break;
                    if (page === 99)
                        again = true;
                }
                await flushOutbox();
                if (Date.now() - maintenanceAt > 3600000) {
                    await maintainHelpHistory(scope, ticketId);
                    maintenanceAt = Date.now();
                }
            } while (again && valid());
        })();
        replay = work;
        try {
            await work;
        }
        finally {
            if (replay === work)
                replay = null;
        }
    }
    const safelyRefresh = () => { void refresh().catch(error => emit({ type: 'error', error })); };
    const connection = createHelpSocket(userId, socket => {
        socket.on('connect', () => { socket.emit('help:subscribe', {}, (ack: {
            ok?: boolean;
        }) => { if (!ack?.ok)
            return; persistPresence(); safelyRefresh(); }); emit({ type: 'connected', connected: true }); });
        socket.on('disconnect', () => emit({ type: 'connected', connected: false }));
        socket.on('help:event', (event: HelpEvent) => { if (!Number.isSafeInteger(event?.id) || !Number.isSafeInteger(event?.ticketId))
            return; liveEvents.add(event.id); if (liveEvents.size > 1000)
            liveEvents.delete(liveEvents.values().next().value!); safelyRefresh(); });
    });
    void AsyncStorage.getItem('help:device-id:v1').then(async (saved) => { if (!alive)
        return; deviceId = saved || helpClientId(); if (!saved)
        await AsyncStorage.setItem('help:device-id:v1', deviceId); persistPresence(); }).catch(error => emit({ type: 'error', error }));
    const stopPushRegistrationObserver=subscribePushRegistrationChanges(()=>{void persistPresence().catch(error=>emit({type:'error',error}));});
    void persistPresence();
    const state = AppState.addEventListener('change', () => { persistPresence(); if (foreground())
        safelyRefresh(); });
    const heartbeat = setInterval(() => { persistPresence(); if (foreground())
        safelyRefresh(); }, 15000);
    const outboxTimer = setInterval(() => { if (foreground())
        void flushOutbox().catch(error => emit({ type: 'error', error })); }, 5000);
    safelyRefresh();
    return { sessionId, listeners, getSocket: () => connection.getSocket(), refresh, syncTicket: async (id: number) => { await syncTicket(id); }, presence: (value: {
            active: boolean;
            ticketId: number | null;
        }) => { active = value.active; ticketId = value.ticketId; persistPresence(); },
        acknowledge: (eventId: number, kind: 'chat' | 'banner') => { void persistPresence().then(ok=>{if(ok&&alive)connection.getSocket()?.emit('help:notification-ack',{eventId,sessionId,kind});}); },
        retain: () => { refs++; }, release: () => { if (--refs > 0)
            return; alive = false; stopPushRegistrationObserver(); connection.disconnect(); state.remove(); clearInterval(heartbeat); clearInterval(outboxTimer); accounts.delete(keyFor(userId)); } };
}
export function acquireHelpAccount(userId:number,listener:Listener){
    let account=accounts.get(keyFor(userId));
    if(!account){account=createAccount(userId);accounts.set(keyFor(userId),account);}
    account.retain();account.listeners.add(listener);
    const current=account;let released=false;
    // A shared connection may already be online before this observer mounts.
    // Defer delivery so callbacks may safely reference the returned lease.
    void Promise.resolve().then(()=>{
        if(released||!current.listeners.has(listener))return;
        try{listener({type:'connected',connected:Boolean(current.getSocket()?.connected)});}catch{/* Isolate observers like live delivery does. */}
    });
    return {sessionId:current.sessionId,getSocket:current.getSocket,refresh:current.refresh,syncTicket:current.syncTicket,release:()=>{
        if(released)return;released=true;current.listeners.delete(listener);current.release();
    }};
}
export function updateHelpPresence(userId: number, value: {
    active: boolean;
    ticketId: number | null;
}) { accounts.get(keyFor(userId))?.presence(value); }
export function acknowledgeHelpEvent(userId: number, eventId: number, kind: 'chat' | 'banner') { accounts.get(keyFor(userId))?.acknowledge(eventId, kind); }
