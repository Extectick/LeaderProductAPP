import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { AuthContext } from '@/context/AuthContext';
import { API_BASE_URL } from '@/utils/config';
import { type ManagedSocketConnection } from '@/src/shared/socket/managedSocket';
import { createHelpSocket } from './helpSocket';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { HelpApiError, createHelpApi, loadHelpMedia, uploadHelpFiles, type HelpTicket, type HelpMessage, type HelpDetail, type HelpCreateInput, type HelpMessageInput, type HelpCloseInput, type HelpAttachment, type HelpMediaSource, type HelpFile } from './helpApi';
import { getHelpDraft, setHelpDraft, helpClientId, readHelpPending, saveHelpPending, removeHelpPending, sameHelpPayload } from './helpStorage';

export function mergeHelpMessages(older: HelpMessage[], incoming: HelpMessage[]) {
  const byId = new Map(older.map((m) => [m.id, m]));
  incoming.forEach((m) => byId.set(m.id, m));
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}
export function useHelpService(isFocused = true) {
  const auth = useContext(AuthContext);
  const userId = Number(auth?.profile?.id || 0);
  const helpApi = useMemo(()=>createHelpApi(userId),[userId]);
  const server = useServerStatus();
  const [tickets, setTickets] = useState<HelpTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<HelpTicket | null>(null);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [typingByTicket, setTyping] = useState<Record<number, { userId: number; name: string }[]>>({});
  const identity = `${API_BASE_URL}:${userId}:${auth?.isAuthenticated}`;
  const identityRef = useRef(identity); identityRef.current = identity;
  const mounted = useRef(true);
  const focusedRef = useRef(isFocused); focusedRef.current = isFocused;
  const previousFocus = useRef(isFocused);
  const canRead = useCallback(() => focusedRef.current && (Platform.OS === 'web'
    ? typeof document !== 'undefined' && document.visibilityState === 'visible'
    : AppState.currentState === 'active'), []);
  const socketRef = useRef<ManagedSocketConnection | null>(null);
  const activeId = useRef<number | null>(null);
  const listFilter = useRef({ status: 'OPEN', scope: 'mine', query: '', cursor: null as string | number | null });
  const ticketsRef = useRef(tickets); ticketsRef.current = tickets;
  const listGeneration = useRef(0), detailGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const operation = useRef<string | null>(null);
  const media = useRef(new Map<string, Promise<HelpMediaSource>>());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const current = useCallback((scope: string) => mounted.current && identityRef.current === scope, []);
  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось выполнить действие'), []);

  const applyDetail = useCallback((detail: HelpDetail, merge = false) => {
    setTickets((old) => {
      const list = old.filter((t) => t.id !== detail.ticket.id);
      if (detail.ticket.status === listFilter.current.status && (!listFilter.current.query || old.some(t=>t.id===detail.ticket.id))) list.push(detail.ticket);
      return list;
    });
    if (activeId.current === detail.ticket.id) {
      setSelectedTicket(detail.ticket);
      setMessages((old) => merge ? mergeHelpMessages(old, detail.messages) : detail.messages);
    }
  }, []);
  const loadTickets = useCallback(async (status = 'OPEN', scope = 'mine', append = false, query?: string, background = false) => {
    if (!userId || !auth?.isAuthenticated) return;
    const generation = ++listGeneration.current, account = identity, mutation = mutationGeneration.current;
    const cursor = append ? listFilter.current.cursor : null;
    const search = query ?? (append || background ? listFilter.current.query : '');
    const previous = ticketsRef.current;
    listFilter.current = { status, scope, cursor, query: search };
    if (!background) { setLoading(true); setError(null); }
    try {
      const result = await helpApi.list(status, scope, cursor ?? undefined, search);
      // Refresh the whole loaded window, not just page one. Keep rows in the UI's frozen order.
      while (background && result.nextCursor && result.tickets.length < previous.length) {
        const page = await helpApi.list(status, scope, result.nextCursor, search);
        result.tickets.push(...page.tickets); result.nextCursor = page.nextCursor;
      }
      if (background && !search) {
        const known = new Set(result.tickets.map(t=>t.id));
        // A recently active older ticket can displace the window's last row. Recheck that
        // row's ACL/status before retaining it; never keep stale data after revoked access.
        const displaced = await Promise.all(previous.filter(t=>!known.has(t.id)).map(async t=> {
          try { return (await helpApi.detail(t.id)).ticket; } catch { return null; }
        }));
        result.tickets.push(...displaced.filter((t):t is HelpTicket=>!!t && t.status===status && (scope==='queue'||t.members.some(m=>m.userId===userId))));
      }
      if (!current(account) || generation !== listGeneration.current || mutation !== mutationGeneration.current) return;
      listFilter.current.cursor = result.nextCursor; setHasMore(!!result.nextCursor);
      setTickets((old) => append ? [...new Map([...old, ...result.tickets].map((t) => [t.id, t])).values()] : result.tickets);
    } catch (e) { if (current(account) && generation === listGeneration.current) { report(e); if (e instanceof HelpApiError && [401,403].includes(e.status)) setTickets([]); } }
    finally { if (current(account) && generation === listGeneration.current) setLoading(false); }
  }, [userId, auth?.isAuthenticated, identity, current, report]);
  const openTicket = useCallback(async (id: number) => {
    const account = identity, generation = ++detailGeneration.current;
    if (activeId.current !== id) { setSelectedTicket(null); setMessages([]); }
    activeId.current = id; setLoading(true); setError(null);
    try {
      const detail = await helpApi.detail(id);
      if (!current(account) || generation !== detailGeneration.current) return;
      applyDetail(detail); socketRef.current?.getSocket()?.emit('help:subscribe', { ticketId: id });
      if (canRead()) void helpApi.read(id, detail.messages.at(-1)?.sequence).catch(() => {});
      return detail;
    } catch (e) { if (current(account) && generation === detailGeneration.current) { report(e); setSelectedTicket(null); setMessages([]); } throw e; }
    finally { if (current(account) && generation === detailGeneration.current) setLoading(false); }
  }, [identity, current, report, applyDetail, canRead]);
  const clearSelection = useCallback(() => { ++detailGeneration.current; activeId.current = null; setSelectedTicket(null); setMessages([]); }, []);
  const refresh = useCallback(async () => {
    const navigation = detailGeneration.current, mutation = mutationGeneration.current;
    await loadTickets(listFilter.current.status, listFilter.current.scope, false, listFilter.current.query, true);
    if (navigation !== detailGeneration.current || mutation !== mutationGeneration.current) return;
    const id = activeId.current;
    if (id) {
      const account = identity;
      try { const detail = await helpApi.detail(id); if (current(account) && activeId.current === id && navigation === detailGeneration.current && mutation === mutationGeneration.current) {
        applyDetail(detail, true);
        if (canRead()) {
          void helpApi.read(id, detail.messages.at(-1)?.sequence).then(()=>{if(current(account))setTickets(old=>old.map(t=>t.id===id?{...t,unreadCount:0}:t));}).catch(()=>{});
        }
      } }
      catch (e) { if (current(account) && activeId.current === id && navigation === detailGeneration.current && mutation === mutationGeneration.current) { report(e); if (e instanceof HelpApiError && [401,403,404].includes(e.status)) clearSelection(); } }
    }
  }, [identity, loadTickets, applyDetail, current, report, clearSelection, canRead]);
  const liveRefresh = useRef(refresh); liveRefresh.current = refresh;
  useEffect(() => {
    const returned = isFocused && !previousFocus.current;
    previousFocus.current = isFocused;
    if (returned) void liveRefresh.current();
  }, [isFocused]);

  useEffect(() => {
    mounted.current = true; setTickets([]); clearSelection(); setCanManage(false); setBusy(false); setPendingCount(0); setError(null);
    const account = identity;
    if (!userId || !auth?.isAuthenticated) return;
    void readHelpPending(userId).then(items=>{if(current(account))setPendingCount(items.length);}).catch(e=>{if(current(account))report(e);});
    void helpApi.config().then((config) => { if (current(account)) setCanManage(config.canManage); }).catch((e) => { if (current(account)) report(e); });
    void loadTickets();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (current(account)) void liveRefresh.current(); }, 120); };
    const connection = createHelpSocket(userId, (socket) => {
        socket.on('connect', () => { if (!current(account)) return; setConnected(true); socket.emit('help:subscribe', activeId.current ? {ticketId: activeId.current} : {}); scheduleRefresh(); });
        socket.on('disconnect', () => { if (current(account)) setConnected(false); });
        socket.on('help:event', scheduleRefresh);
        socket.on('help:typing', (event: {ticketId:number;userId:number;name?:string;typing?:boolean;isTyping?:boolean}) => {
          if (!current(account) || event.userId === userId || !Number.isSafeInteger(event.ticketId)) return;
          const key = `${event.ticketId}:${event.userId}`;
          clearTimeout(typingTimers.current.get(key));
          const remove = () => setTyping((old) => ({...old,[event.ticketId]:(old[event.ticketId]||[]).filter((p)=>p.userId!==event.userId)}));
          if (event.typing === false || event.isTyping === false) { remove(); return; }
          setTyping((old) => ({...old,[event.ticketId]:[...(old[event.ticketId]||[]).filter((p)=>p.userId!==event.userId),{userId:event.userId,name:event.name||'Участник'}]}));
          typingTimers.current.set(key,setTimeout(remove,5000));
        });
    });
    socketRef.current = connection;
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') scheduleRefresh(); });
    const onVisibility = () => { if (canRead()) scheduleRefresh(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    // REST repair also covers an event lost during disconnect or a socket authorization failure.
    const repair = setInterval(() => { if (AppState.currentState === 'active' || Platform.OS === 'web') scheduleRefresh(); }, 30000);
    return () => {
      mounted.current = false; clearTimeout(refreshTimer); clearInterval(repair); appState.remove(); connection.disconnect();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      socketRef.current = null; setConnected(false); typingTimers.current.forEach(clearTimeout); typingTimers.current.clear(); setTyping({});
      for (const value of media.current.values()) void value.then((s) => { if (s.uri.startsWith('blob:')) URL.revokeObjectURL(s.uri); }).catch(()=>{});
      media.current.clear();
    };
  }, [identity]); // The account identity, not ticket navigation, owns the connection.

  const mutate = useCallback(async (work: () => Promise<HelpDetail>, select = false) => {
    if (operation.current === identity) throw new Error('Дождитесь завершения предыдущего действия');
    const account = identity, navigation = detailGeneration.current; operation.current = account; setBusy(true); setError(null);
    ++mutationGeneration.current;
    try {
      const detail = await work();
      if (!current(account)) throw new Error('Учётная запись изменилась');
      ++mutationGeneration.current;
      if (select && navigation === detailGeneration.current) activeId.current = detail.ticket.id;
      applyDetail(detail, !select); return detail;
    } catch (e) { if (current(account)) report(e); throw e; }
    finally { if (operation.current === account) operation.current = null; if (current(account)) setBusy(false); }
  }, [identity, current, report, applyDetail]);

  const durableSend = useCallback(async (input: HelpCreateInput & {rating?:number}, ticketId?: number, action?: 'close' | 'reopen'): Promise<HelpDetail> => {
    const account = identity;
    const saved = await readHelpPending(userId);
    const previous = saved.find((p) => p.ticketId === ticketId && p.action === action && p.input.rating === input.rating && p.create === !ticketId && p.input.sourceTicketId === input.sourceTicketId && sameHelpPayload(p.input,input));
    const item = previous || { key: input.clientMessageId || helpClientId(), ticketId, action, create: !ticketId, createdAt: Date.now(), input: {...input, clientMessageId: input.clientMessageId || helpClientId(), ...(!ticketId ? { clientTicketId: input.clientTicketId || helpClientId() } : {})} };
    await saveHelpPending(userId,item);
    if (!current(account)) throw new Error('Учётная запись изменилась');
    const queued = await readHelpPending(userId);
    if (!current(account)) throw new Error('Учётная запись изменилась');
    setPendingCount(queued.length);
    try {
      const detail = action === 'close' && ticketId ? await helpApi.close(ticketId,{...item.input,rating:item.input.rating ?? 0})
        : action === 'reopen' && ticketId ? await helpApi.reopen(ticketId,item.input)
        : ticketId ? await helpApi.send(ticketId,item.input) : await helpApi.create(item.input);
      await removeHelpPending(userId,item.key);
      const remaining = await readHelpPending(userId);
      if(current(account))setPendingCount(remaining.length);
      return detail;
    } catch (e) {
      // Unknown network outcome keeps the exact immutable request for a safe retry.
      if (e instanceof HelpApiError && e.status >=400 && e.status <500 && e.status !==408 && e.status !==429) {
        await removeHelpPending(userId,item.key);
        const remaining = await readHelpPending(userId);
        if(current(account))setPendingCount(remaining.length);
      }
      throw e;
    }
  }, [identity,userId,current]);
  const createTicket = useCallback((input: HelpCreateInput) => mutate(()=>durableSend(input),true),[mutate,durableSend]);
  const sendMessage = useCallback((id:number,input:HelpMessageInput)=>mutate(()=>durableSend(input,id)),[mutate,durableSend]);
  const editMessage = useCallback((id:number,input:{text:string;rating?:number;attachmentIds?:string[]})=>mutate(()=>helpApi.edit(id,input)),[mutate]);
  const closeTicket = useCallback((id:number,input:HelpCloseInput)=>mutate(()=>durableSend(input,id,'close')),[mutate,durableSend]);
  const reopenTicket = useCallback((id:number,input:HelpMessageInput)=>mutate(()=>durableSend(input,id,'reopen')),[mutate,durableSend]);
  const requestIt = useCallback((id:number)=>mutate(()=>helpApi.requestIt(id)),[mutate]);
  const claimTicket = useCallback((id:number)=>mutate(()=>helpApi.claim(id)),[mutate]);
  const toggleReaction = useCallback((message:HelpMessage,emoji:string)=>mutate(()=>helpApi.react(message.id,emoji,!!message.reactions.find((r)=>r.emoji===emoji)?.mine)),[mutate]);
  const markAllRead = useCallback(async()=>{await helpApi.readAll(); await refresh();},[refresh]);
  const loadOlder = useCallback(async()=>{
    const id=activeId.current,account=identity; if(!id||!messages.length)return;
    const result=await helpApi.messages(id,messages[0].sequence);
    if(current(account)&&activeId.current===id)setMessages((old)=>mergeHelpMessages(result.messages,old));
  },[identity,messages,current]);
  const mediaSource=useCallback((attachment:HelpAttachment)=>{
    if(Platform.OS!=='web')return loadHelpMedia(attachment,userId);
    const key=`${identity}:${attachment.id}`;
    let promise=media.current.get(key);
    if(!promise){promise=loadHelpMedia(attachment,userId);media.current.set(key,promise);promise.catch(()=>media.current.delete(key));}
    return promise;
  },[identity]);
  const emitTyping=useCallback((ticketId:number,isTyping:boolean)=>socketRef.current?.getSocket()?.emit('help:typing',{ticketId,typing:isTyping}),[]);
  const retryPending=useCallback(async()=>{
    const account=identity;
    for(const item of await readHelpPending(userId)) {
      if(!current(account))return;
      await mutate(()=>durableSend(item.input,item.ticketId,item.action));
    }
    await refresh();
  },[identity,userId,current,mutate,durableSend,refresh]);
  const getDraft=useCallback((key:string)=>getHelpDraft(userId,key),[userId]);
  const setDraft=useCallback((key:string,text:string)=>setHelpDraft(userId,key,text),[userId]);
  const uploadAttachments=useCallback((files:HelpFile[])=>uploadHelpFiles(files,userId),[userId]);
  return {tickets,selectedTicket,messages,loading,busy,error,pendingCount,connected:connected&&server.isReachable,online:server.isReachable,canManage,userId,typingByTicket,hasMore,
    loadTickets,openTicket,clearSelection,createTicket,sendMessage,editMessage,closeTicket,reopenTicket,requestIt,claimTicket,markAllRead,toggleReaction,
    uploadAttachments,mediaSource,loadOlder,emitTyping,getDraft,setDraft,retryPending,refresh};
}
