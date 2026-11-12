import { AppState, Platform } from 'react-native';
import { withDeadline } from '@/src/shared/network/withDeadline';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {subscribePushRegistrationChanges} from '@/utils/pushRegistrationEvents';
import type { Socket } from 'socket.io-client';
import { API_BASE_URL } from '@/utils/config';
import { createHelpSocket } from './helpSocket';
import { createHelpApi, HelpApiError } from './helpApi';
import type { HelpEvent } from './helpHistoryTypes';
import type { HelpHistoryChange } from './helpHistoryRecord';
import { helpHistoryScope } from './helpHistory';
import { readAccountValue, writeAccountChanges, readHistoryRecord, listHistoryRecords, listHistoryTicketIds, removeHistoryTicket, maintainHelpHistory,resetHelpDownloadedState } from './helpHistoryDatabase';
import { readHelpPending, helpClientId } from './helpStorage';
import { dispatchHelpPending } from './helpOutbox';
import type {HelpConnectionSnapshot,HelpTransportPhase} from './helpConnectionState';
export type HelpAccountNotice = {
    type: 'event';
    event: HelpEvent;
} | {
    type: 'ticket';
    ticketId: number;
    /** IDs whose authoritative rows were committed; omitted for a full repair. */
    changedMessageIds?: number[];
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
} | {type:'healthy';} | {type:'connection-state';state:HelpConnectionSnapshot};
type Listener = (notice: HelpAccountNotice) => void;
type Account = ReturnType<typeof createAccount>;
const accounts = new Map<string, Account>();
const keyFor = (id: number) => `${API_BASE_URL}:${id}`;
function foreground() { return Platform.OS === 'web' ? typeof document !== 'undefined' && document.visibilityState === 'visible' : AppState.currentState === 'active'; }
function createAccount(userId: number) {
    const api = createHelpApi(userId), scope = helpHistoryScope(userId), listeners = new Set<Listener>(), sessionId = helpClientId();
    let alive = true, refs = 0, replay: Promise<void> | null = null, again = false, deviceId = '', pushToken: string | null = null, maintenanceAt = 0, ticketId: number | null = null, active = foreground();
    let subscribedSocket: Socket | null = null, observedSocket: Socket | null = null;
    let cancelProbe: (() => void) | null = null, recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let probeSubscription: ((quick?:boolean) => void) | null = null, lastRecoveryAt = -Infinity, lastWakeAt = -Infinity;
    let visible=foreground();
    let recoveryReplayRequested=false;
    let connectionState:HelpConnectionSnapshot={transport:visible?'connecting':'paused',sync:'idle'};
    const liveEvents = new Set<number>();
    const jobs = new Map<number, Promise<HelpHistoryChange[]>>();
    const emit = (notice: HelpAccountNotice) => { if (alive)
        for (const listener of listeners) {
            try {
                listener(notice);
            }
            catch { /* One observer cannot break persistence. */ }
        } };
    const updateConnection=(next:Partial<HelpConnectionSnapshot>)=>{
        if(!alive)return;
        const value={...connectionState,...next};
        if(value.transport===connectionState.transport&&value.sync===connectionState.sync)return;
        connectionState=value;emit({type:'connection-state',state:value});
    };
    const valid = () => alive;
    let presenceTail:Promise<boolean>=Promise.resolve(false);
    const persistPresence=()=>{
        const work=presenceTail.catch(()=>false).then(async()=>{
            try{pushToken=await withDeadline(AsyncStorage.getItem('pushToken'),5000);}catch{}
            const socket=connection.getSocket();if(!alive||!socket?.connected)return false;
            return new Promise<boolean>(resolve=>{
                const timer=setTimeout(()=>resolve(false),1000);
                socket.emit('help:presence',{sessionId,deviceId:deviceId||sessionId,pushToken:pushToken??undefined,active:active&&foreground(),ticketId:active&&foreground()?ticketId:null},(reply:{ok?:boolean})=>{clearTimeout(timer);resolve(Boolean(alive && connection.getSocket() === socket && socket.connected && reply?.ok));});
            });
        });presenceTail=work;return work;
    };
    async function syncTicket(id: number, requiredCursor = 0): Promise<HelpHistoryChange[]> {
        const pending = jobs.get(id);
        if (pending) {
            const changes = await pending;
            // A request started before this account event may have an older
            // RepeatableRead snapshot. Joining it alone cannot acknowledge the
            // newer event; its owner removes the job before this continuation.
            if (valid() && changes.length && (changes.at(-1)?.sync?.nextCursor ?? 0) < requiredCursor)
                return [...changes, ...await syncTicket(id, requiredCursor)];
            return changes;
        }
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
                    if (cursor < requiredCursor)
                        throw new Error('Синхронизация обращения не достигла курсора события');
                    const changedMessageIds = [...new Set(changes.flatMap(change => [
                        ...(change.sync?.messages ?? []).map(message => message.id),
                        ...(change.sync?.deletedMessageIds ?? []),
                    ]))];
                    emit({ type: 'ticket', ticketId: id, ...(changedMessageIds.length <= 600 ? { changedMessageIds } : {}) });
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
        updateConnection({sync:'syncing'});
        recoveryReplayRequested=false;
        let failed=false;
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
                        for (const id of await listHistoryTicketIds(scope))
                            if (!visible.has(id)) {
                                await removeHistoryTicket(scope, id);
                                emit({ type: 'revoked', ticketId: id });
                            }
                    }
                    const required = new Map<number, number>();
                    for (const event of result.events)
                        required.set(event.ticketId, Math.max(required.get(event.ticketId) ?? 0, event.id));
                    for (const [id, through] of required)
                        await syncTicket(id, through);
                    if (!valid())
                        return;
                    const next = result.resyncRequired ? (result.snapshotCursor ?? result.nextCursor) : result.nextCursor;
                    if (!result.resyncRequired && next < cursor || result.hasMore && next === cursor)
                        throw new Error('Некорректный курсор списка обращений');
                    // syncTicket already durably commits every page (and awaits
                    // revoked-ticket removal). Advance only after all succeed;
                    // a crash before this commit replays idempotently. Rewriting
                    // those pages here doubled SQLite work for every event batch.
                    await writeAccountChanges(scope, [], next, undefined, Boolean(result.resyncRequired));
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
            updateConnection({sync:'idle'});
        }
        catch(error) {
            failed=true;
            updateConnection({sync:'error'});
            throw error;
        }
        finally {
            if (replay === work)
                replay = null;
            // A foreground wake may have joined a request started before sleep.
            // If that request fails, service the wake only after all previous
            // work settled; never overlap persistence or reset durable cursors.
            const retry=failed&&recoveryReplayRequested;
            recoveryReplayRequested=false;
            if(retry&&alive&&foreground())safelyRefresh();
        }
    }
    const safelyRefresh = () => { void refresh().catch(error => emit({ type: 'error', error })); };
    const setSubscribed = (socket: Socket | null, phase:HelpTransportPhase=foreground()?'connecting':'paused') => {
        const wasConnected = subscribedSocket !== null;
        subscribedSocket = socket;
        if (wasConnected !== (socket !== null)) emit({ type: 'connected', connected: socket !== null });
        updateConnection({transport:socket?'ready':phase});
    };
    // This requests recovery from the socket owner; it does not create a second
    // reconnect loop. Throttle rejected ACKs and repeated user taps alike.
    const replaceUnresponsiveSocket = () => {
        if (!alive || !foreground() || recoveryTimer) return;
        cancelProbe?.(); setSubscribed(null,'offline');
        const delay = Math.max(0, 5000 - (Date.now() - lastRecoveryAt));
        recoveryTimer = setTimeout(() => {
            recoveryTimer = null;
            if (!alive || !foreground()) return;
            lastRecoveryAt = Date.now();
            connection.recover?.({reason:'subscription',replaceConnected:true});
            safelyRefresh();
        }, delay);
    };
    const wake=(reason:'manual'|'foreground'|'online')=>{
        if(!alive||!foreground()||Date.now()-lastWakeAt<500)return;
        lastWakeAt=Date.now();
        // This accelerates a disconnected transport/auth retry. Only a failed
        // application ACK below may replace an already connected transport.
        connection.recover?.({reason});
        if(connection.getSocket()?.connected)probeSubscription?.(true);
        else updateConnection({transport:'connecting'});
        if(replay)recoveryReplayRequested=true;
        safelyRefresh();
    };
    const recover=()=>wake('manual');
    const connection = createHelpSocket(userId, socket => {
        cancelProbe?.();
        observedSocket = socket;
        setSubscribed(null);
        const current = () => alive && observedSocket === socket && connection.getSocket() === socket;
        probeSubscription = (quick=false) => {
            if (!current() || !socket.connected || !foreground() || cancelProbe) return;
            if(quick)updateConnection({transport:'checking'});
            let pending = true;
            const cancel = () => {
                pending = false; clearTimeout(timer);
                if (cancelProbe === cancel) cancelProbe = null;
            };
            const finish = (ok: boolean) => {
                if (!pending) return;
                cancel();
                if (!current() || !socket.connected) return;
                if (!ok) { replaceUnresponsiveSocket(); return; }
                const first = subscribedSocket !== socket;
                if (recoveryTimer) clearTimeout(recoveryTimer);
                recoveryTimer = null;
                setSubscribed(socket);
                if (first) { void persistPresence(); safelyRefresh(); }
            };
            const timer = setTimeout(() => finish(false), quick?3000:5000);
            cancelProbe = cancel;
            try { socket.emit('help:subscribe', {}, (ack: { ok?: boolean }) => finish(ack?.ok === true)); }
            catch { finish(false); }
        };
        socket.on('connect', () => { if (current()) probeSubscription?.(); });
        socket.on('disconnect', () => {
            // The token owner may detach its old connection before disconnect().
            // Observed identity still distinguishes it from a replaced socket.
            if (!alive || observedSocket !== socket) return;
            cancelProbe?.(); setSubscribed(null);
        });
        socket.on('help:event', (event: HelpEvent) => { if (!current() || !Number.isSafeInteger(event?.id) || !Number.isSafeInteger(event?.ticketId))
            return; liveEvents.add(event.id); if (liveEvents.size > 1000)
            liveEvents.delete(liveEvents.values().next().value!); safelyRefresh(); });
    });
    void AsyncStorage.getItem('help:device-id:v1').then(async (saved) => { if (!alive)
        return; deviceId = saved || helpClientId(); if (!saved)
        await AsyncStorage.setItem('help:device-id:v1', deviceId); persistPresence(); }).catch(error => emit({ type: 'error', error }));
    const stopPushRegistrationObserver=subscribePushRegistrationChanges(()=>{void persistPresence().catch(error=>emit({type:'error',error}));});
    void persistPresence();
    const visibilityChanged=()=>{
        const next=foreground();
        if(next===visible)return;
        visible=next;
        void persistPresence();
        if (visible) wake('foreground');
        else {
            lastWakeAt=-Infinity;cancelProbe?.(); setSubscribed(null,'paused');
            if (recoveryTimer) clearTimeout(recoveryTimer);
            recoveryTimer = null;
        }
    };
    const state = AppState.addEventListener('change', visibilityChanged);
    const online=()=>wake('online'),focus=()=>{visibilityChanged();wake('foreground');};
    if(Platform.OS==='web'&&typeof document!=='undefined'&&typeof window!=='undefined'){
        document.addEventListener('visibilitychange',visibilityChanged);
        window.addEventListener('online',online);window.addEventListener('focus',focus);
    }
    const heartbeat = setInterval(() => { if (foreground()) { void persistPresence(); probeSubscription?.(); safelyRefresh(); } }, 15000);
    const outboxTimer = setInterval(() => { if (foreground())
        void flushOutbox().catch(error => emit({ type: 'error', error })); }, 5000);
    safelyRefresh();
    return { sessionId, listeners, getConnectionState:()=>connectionState, getSocket: () => connection.getSocket(), isConnected: () => Boolean(alive && subscribedSocket && subscribedSocket === connection.getSocket() && subscribedSocket.connected), recover, refresh, syncTicket: async (id: number) => { await syncTicket(id); }, presence: (value: {
            active: boolean;
            ticketId: number | null;
        }) => { active = value.active; ticketId = value.ticketId; persistPresence(); },
        acknowledge: (eventId: number, kind: 'chat' | 'banner') => { void persistPresence().then(ok=>{if(ok&&alive)connection.getSocket()?.emit('help:notification-ack',{eventId,sessionId,kind});}); },
        retain: () => { refs++; }, release: () => { if (--refs > 0)
            return; alive = false; cancelProbe?.(); if (recoveryTimer) clearTimeout(recoveryTimer); subscribedSocket = null; observedSocket = null; stopPushRegistrationObserver(); connection.disconnect(); state.remove();
            if(Platform.OS==='web'&&typeof document!=='undefined'&&typeof window!=='undefined'){
                document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('online',online);window.removeEventListener('focus',focus);
            }
            clearInterval(heartbeat); clearInterval(outboxTimer); accounts.delete(keyFor(userId)); } };
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
        try{listener({type:'connected',connected:current.isConnected()});}catch{/* Isolate observers like live delivery does. */}
        if(!released&&current.listeners.has(listener))try{listener({type:'connection-state',state:current.getConnectionState()});}catch{/* Isolate observers. */}
    });
    return {sessionId:current.sessionId,getSocket:current.getSocket,isConnected:current.isConnected,getConnectionState:current.getConnectionState,recover:current.recover,refresh:current.refresh,syncTicket:current.syncTicket,release:()=>{
        if(released)return;released=true;current.listeners.delete(listener);current.release();
    }};
}
export function updateHelpPresence(userId: number, value: {
    active: boolean;
    ticketId: number | null;
}) { accounts.get(keyFor(userId))?.presence(value); }
export function acknowledgeHelpEvent(userId: number, eventId: number, kind: 'chat' | 'banner') { accounts.get(keyFor(userId))?.acknowledge(eventId, kind); }
