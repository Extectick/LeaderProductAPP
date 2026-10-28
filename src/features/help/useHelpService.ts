import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { AuthContext } from '@/context/AuthContext';
import { API_BASE_URL } from '@/utils/config';
import { type ManagedSocketConnection } from '@/src/shared/socket/managedSocket';
import { createHelpSocket } from './helpSocket';
import { useServerStatus } from '@/src/shared/network/useServerStatus';
import { HelpApiError, createHelpApi, loadHelpMedia, uploadHelpFiles, type HelpTicket, type HelpMessage, type HelpDetail, type HelpCreateInput, type HelpMessageInput, type HelpCloseInput, type HelpAttachment, type HelpMediaSource, type HelpFile } from './helpApi';
import { getHelpDraft, setHelpDraft, helpClientId, readHelpPending, saveHelpPending, removeHelpPending, sameHelpPayload } from './helpStorage';
import { cacheHelpPage, cacheHelpSync, cacheHelpTickets, findCachedHelpDate, forgetHelpTicket, readCachedHelpMessage, readCachedHelpRange, readCachedHelpTicket, readCachedHelpTickets, saveHelpViewport } from './helpHistory';
import { initialHelpPosition, reconcileHelpWindow, trimHelpWindow, validHelpAnchor } from './helpHistoryModel';
import type { HelpHistoryPage, HelpNavigationTarget, HelpViewportAnchor } from './helpHistoryTypes';
import { helpLocalDayBounds } from './helpDateNavigation';
const isAccessRevoked=(error:unknown)=>error instanceof HelpApiError&&([401,403].includes(error.status)||(error.status===404&&!['HELP_MESSAGE_NOT_FOUND','HELP_DATE_MESSAGE_NOT_FOUND'].includes(error.code??'')));

function detailPage(detail:HelpDetail):HelpHistoryPage {
  const first=detail.messages[0]?.sequence,last=detail.messages.at(-1)?.sequence;
  return {messages:detail.messages,nextCursor:detail.nextCursor??null,olderCursor:detail.olderCursor??first??null,newerCursor:detail.newerCursor??last??null,
    hasOlder:detail.hasOlder??detail.messages.length>=100,hasNewer:detail.hasNewer??false,lastReadSequence:detail.lastReadSequence??detail.ticket.lastReadSequence??0,
    firstUnreadSequence:detail.firstUnreadSequence??null,lastSequence:detail.lastSequence??detail.ticket.lastSequence??last??0,eventCursor:detail.eventCursor??0,snapshotCursor:detail.snapshotCursor??detail.eventCursor??0};
}

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
  const messagesRef=useRef<HelpMessage[]>([]);messagesRef.current=messages;
  const selectedRef=useRef<HelpTicket|null>(null);selectedRef.current=selectedTicket;
  const [hasOlder,setHasOlder]=useState(false),[hasNewer,setHasNewer]=useState(false);
  const [loadingOlder,setLoadingOlder]=useState(false),[loadingNewer,setLoadingNewer]=useState(false);
  const [navigationTarget,setNavigationTarget]=useState<HelpNavigationTarget|null>(null);
  const [firstUnreadSequence,setFirstUnreadSequence]=useState<number|null>(null);
  const viewport=useRef<HelpViewportAnchor|null>(null),pageRef=useRef<HelpHistoryPage|null>(null),navigationKey=useRef(0);
  const viewportRevision=useRef(0),interactionRevision=useRef(0);
  const cancelNavigation=useCallback(()=>{++interactionRevision.current;},[]);
  const pendingTrim=useRef<'older'|'newer'|null>(null);
  const paging=useRef({older:false,newer:false}),readSequence=useRef(0),pendingRead=useRef(0),reading=useRef<string|null>(null);
  const replaying=useRef<Promise<void>|null>(null),queuedReplay=useRef(false);
  const navigateLatest=useRef<()=>Promise<void>>(async()=>{});
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
  const updateMessages=useCallback((next:HelpMessage[])=>{messagesRef.current=next;setMessages(next);},[]);
  const issueNavigation=useCallback((target:Omit<HelpNavigationTarget,'key'>)=>setNavigationTarget({...target,key:++navigationKey.current}),[]);
  const applyPage=useCallback((page:HelpHistoryPage,mode:'replace'|'older'|'newer'='replace')=>{
    const old=pageRef.current,merged=mode==='replace'?page.messages:mergeHelpMessages(messagesRef.current,page.messages);
    // Equal-length prepend+trim can defeat FlashList's visible-position maintenance.
    // Keep this response intact; a fresh settled viewport trims and explicitly restores its anchor.
    pendingTrim.current=merged.length>600?(mode==='older'?'older':'newer'):null;
    updateMessages(merged);
    pageRef.current={...page,messages:[],hasOlder:mode==='newer'?(old?.hasOlder??false):page.hasOlder,hasNewer:mode==='older'?(old?.hasNewer??false):page.hasNewer};
    setHasOlder(pageRef.current.hasOlder);setHasNewer(pageRef.current.hasNewer);readSequence.current=Math.max(readSequence.current,page.lastReadSequence);
  },[updateMessages]);
  const persistPage=useCallback(async(ticket:HelpTicket,page:HelpHistoryPage)=>{
    try{
      await cacheHelpPage(userId,ticket,page);
      // A newer replay may already have edited/deleted these IDs while this page was in flight.
      if(page.messages.length)page.messages=await readCachedHelpRange(userId,ticket.id,page.messages[0].sequence,page.messages.at(-1)!.sequence,page.messages.length);
    }catch(e){report(e);}
  },[userId,report]);

  const applyDetail = useCallback((detail: HelpDetail, merge = false) => {
    setTickets((old) => {
      const list = old.filter((t) => t.id !== detail.ticket.id);
      if (detail.ticket.status === listFilter.current.status && (!listFilter.current.query || old.some(t=>t.id===detail.ticket.id))) list.push(detail.ticket);
      return list;
    });
    if (activeId.current === detail.ticket.id) {
      selectedRef.current=detail.ticket;setSelectedTicket(detail.ticket);
      if(merge)updateMessages(reconcileHelpWindow(messagesRef.current,detail.messages,[],false));
      else applyPage(detailPage(detail));
    }
  }, [applyPage,updateMessages]);
  const loadTickets = useCallback(async (status = 'OPEN', scope = 'mine', append = false, query?: string, background = false) => {
    if (!userId || !auth?.isAuthenticated) return;
    const generation = ++listGeneration.current, account = identity, mutation = mutationGeneration.current;
    const cursor = append ? listFilter.current.cursor : null;
    const search = query ?? (append || background ? listFilter.current.query : '');
    const previous = ticketsRef.current;
    listFilter.current = { status, scope, cursor, query: search };
    if (!background) { setLoading(true); setError(null); }
    try {
      if(!append&&!background&&!previous.length){
        const cached=await readCachedHelpTickets(userId).catch(()=>[]);
        if(current(account)&&generation===listGeneration.current)setTickets(cached.filter(ticket=>ticket.status===status&&(scope==='queue'||ticket.members.some(member=>member.userId===userId))&&(!search||ticket.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))));
      }
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
          try { return (await helpApi.detail(t.id)).ticket; } catch(e) { if(isAccessRevoked(e))await forgetHelpTicket(userId,t.id).catch(()=>{}); return null; }
        }));
        result.tickets.push(...displaced.filter((t):t is HelpTicket=>!!t && t.status===status && (scope==='queue'||t.members.some(m=>m.userId===userId))));
      }
      if (!current(account) || generation !== listGeneration.current || mutation !== mutationGeneration.current) return;
      listFilter.current.cursor = result.nextCursor; setHasMore(!!result.nextCursor);
      setTickets((old) => append ? [...new Map([...old, ...result.tickets].map((t) => [t.id, t])).values()] : result.tickets);
      await cacheHelpTickets(userId,result.tickets).catch(report);
    } catch (e) { if (current(account) && generation === listGeneration.current) { report(e); if (e instanceof HelpApiError && [401,403].includes(e.status)) setTickets([]); } }
    finally { if (current(account) && generation === listGeneration.current) setLoading(false); }
  }, [userId, auth?.isAuthenticated, identity, current, report]);
  const clearSelection=useCallback(()=>{
    ++detailGeneration.current;activeId.current=null;selectedRef.current=null;setSelectedTicket(null);updateMessages([]);
    viewport.current=null;pageRef.current=null;pendingTrim.current=null;readSequence.current=0;pendingRead.current=0;paging.current={older:false,newer:false};
    setHasOlder(false);setHasNewer(false);setLoadingOlder(false);setLoadingNewer(false);setNavigationTarget(null);setFirstUnreadSequence(null);setLoading(false);
  },[updateMessages]);
  const revokeTicket=useCallback(async(id:number)=>{
    await forgetHelpTicket(userId,id).catch(report);setTickets(old=>old.filter(ticket=>ticket.id!==id));if(activeId.current===id)clearSelection();
  },[userId,clearSelection,report]);
  const openTicket=useCallback(async(id:number,explicit?:{messageId?:number;sequence?:number})=>{
    const account=identity,generation=++detailGeneration.current;
    activeId.current=id;selectedRef.current=null;setSelectedTicket(null);updateMessages([]);pageRef.current=null;viewport.current=null;
    readSequence.current=0;pendingRead.current=0;setLoading(true);setError(null);setNavigationTarget(null);setFirstUnreadSequence(null);
    setHasOlder(false);setHasNewer(false);setLoadingOlder(false);setLoadingNewer(false);paging.current={older:false,newer:false};
    let fallbackDetail:HelpDetail|undefined;
    let cachedShown=false,shownRevision=viewportRevision.current,emittedPosition:Omit<HelpNavigationTarget,'key'>|null=null;
    const valid=()=>current(account)&&generation===detailGeneration.current&&activeId.current===id;
    try{
      let cached=await readCachedHelpTicket(userId,id).catch(()=>null);if(!valid())return;
      const anchor=cached?.record.anchor??null;viewport.current=anchor;
      const cachedPosition=initialHelpPosition(anchor,cached?.record.firstUnreadSequence??null,explicit);
      if(cachedPosition.sequence)cached=await readCachedHelpTicket(userId,id,cachedPosition.sequence).catch(()=>cached);
      if(!valid())return;
      if(cached){selectedRef.current=cached.record.ticket;setSelectedTicket(cached.record.ticket);
        if(cached.page&&(!explicit?.messageId||cached.page.messages.some(message=>message.id===explicit.messageId))){
          applyPage(cached.page);setFirstUnreadSequence(cached.record.firstUnreadSequence);issueNavigation(cachedPosition);emittedPosition=cachedPosition;cachedShown=true;shownRevision=viewportRevision.current;setLoading(false);
        }}
      const detail=await helpApi.detail(id);if(!valid())return;fallbackDetail=detail;
      const tail=detailPage(detail);await persistPage(detail.ticket,tail);if(!valid())return;
      const position=initialHelpPosition(anchor,tail.firstUnreadSequence,explicit);let page=tail;
      if(position.kind!=='latest'){
        const target=position.sequence;
        const found=target?tail.messages.some(message=>message.sequence===target):tail.messages.some(message=>message.id===position.messageId);
        if(!found)page=await helpApi.messages(id,position.messageId&&!target?{aroundMessageId:position.messageId}:{around:target});
      }
      if(!valid())return;await persistPage(detail.ticket,page);if(!valid())return;
      if(cachedShown&&viewportRevision.current!==shownRevision){
        // A cache-first screen is already interactive. A late initial response must not undo its newer reading position.
        applyDetail({ticket:detail.ticket,messages:[]},true);
        updateMessages(reconcileHelpWindow(messagesRef.current,page.messages,[],false));
        const livePage=pageRef.current as HelpHistoryPage|null;
        if(livePage){livePage.lastSequence=Math.max(livePage.lastSequence,tail.lastSequence);
          if(!viewport.current?.atLatest&&tail.lastSequence>(messagesRef.current.at(-1)?.sequence??0)){livePage.hasNewer=true;setHasNewer(true);}}
      }else{
        applyDetail({...detail,...page});setFirstUnreadSequence(tail.firstUnreadSequence);
        if(!emittedPosition||emittedPosition.kind!==position.kind||emittedPosition.sequence!==position.sequence||emittedPosition.messageId!==position.messageId)issueNavigation(position);
      }
      socketRef.current?.getSocket()?.emit('help:subscribe',{ticketId:id});
      void liveRefresh.current();
      return {...detail,messages:page.messages};
    }catch(e){if(valid()){report(e);if(isAccessRevoked(e)){await revokeTicket(id);throw e;}if(e instanceof HelpApiError&&e.code==='HELP_MESSAGE_NOT_FOUND'&&fallbackDetail){if(!cachedShown){applyDetail(fallbackDetail);issueNavigation({kind:'latest',animate:false});}return fallbackDetail;}if(!cachedShown){clearSelection();throw e;}}return undefined;}
    finally{if(valid())setLoading(false);}
  },[identity,userId,current,helpApi,updateMessages,applyDetail,applyPage,issueNavigation,persistPage,report,revokeTicket,clearSelection]);
  const loadPage=useCallback(async(direction:'older'|'newer')=>{
    const id=activeId.current,account=identity,generation=detailGeneration.current,old=messagesRef.current;
    if(!id||!old.length||paging.current[direction]||!(direction==='older'?pageRef.current?.hasOlder:pageRef.current?.hasNewer))return;
    paging.current[direction]=true;(direction==='older'?setLoadingOlder:setLoadingNewer)(true);
    try{
      const boundary=direction==='older'?old[0].sequence:old.at(-1)!.sequence;
      const cached=await readCachedHelpTicket(userId,id,direction==='older'?boundary-1:boundary+1).catch(()=>null);
      if(!current(account)||generation!==detailGeneration.current)return;
      if(cached?.page){
        const available=cached.page.messages.filter(message=>direction==='older'?message.sequence<boundary:message.sequence>boundary);
        if(available.length){applyPage({...cached.page,messages:available},direction);if(!server.isReachable)return;}
      }
      const page=await helpApi.messages(id,direction==='older'?{before:old[0].sequence}:{after:old.at(-1)!.sequence});
      if(!current(account)||generation!==detailGeneration.current||activeId.current!==id)return;
      if(selectedRef.current)await persistPage(selectedRef.current,page);
      if(!current(account)||generation!==detailGeneration.current)return;applyPage(page,direction);
    }catch(e){if(current(account)&&generation===detailGeneration.current){report(e);if(isAccessRevoked(e))await revokeTicket(id);}}
    finally{if(current(account)&&generation===detailGeneration.current){paging.current[direction]=false;(direction==='older'?setLoadingOlder:setLoadingNewer)(false);}}
  },[identity,userId,current,helpApi,persistPage,applyPage,report,revokeTicket,server.isReachable]);
  const syncTicket=useCallback(async(id:number)=>{
    if(!pageRef.current)return;
    const account=identity,generation=detailGeneration.current;
    const following=viewport.current?.atLatest===true&&!pageRef.current?.hasNewer;
    const valid=()=>current(account)&&activeId.current===id&&generation===detailGeneration.current;
    try{
      const cached=await readCachedHelpTicket(userId,id);let cursor=cached?.record.syncCursor??0;if(!valid())return;
      let more=true;
      while(more&&valid()){
        const result=await helpApi.sync(id,cursor);if(!valid())return;
        await cacheHelpSync(userId,id,result);if(!valid())return;
        cursor=result.nextCursor;more=result.hasMore;
        // Only update visible IDs here. Replay must never join two disjoint history windows.
        const committed=await readCachedHelpTicket(userId,id);if(!valid())return;
        applyDetail({ticket:committed?.record.ticket??result.ticket,messages:[]},true);
        const shown=messagesRef.current;
        const refreshed=shown.length?await readCachedHelpRange(userId,id,shown[0].sequence,shown.at(-1)!.sequence,shown.length):[];
        if(!valid())return;updateMessages(reconcileHelpWindow(messagesRef.current,refreshed,result.deletedMessageIds.filter(id=>!refreshed.some(message=>message.id===id)),false));
        readSequence.current=Math.max(readSequence.current,result.lastReadSequence);
        if(pageRef.current){pageRef.current={...pageRef.current,lastSequence:Math.max(pageRef.current.lastSequence,result.lastSequence),lastReadSequence:Math.max(pageRef.current.lastReadSequence,result.lastReadSequence)};
          if(result.lastSequence>(messagesRef.current.at(-1)?.sequence??0)&&!following){pageRef.current.hasNewer=true;setHasNewer(true);}}
      }
      if(valid()&&following&&(pageRef.current?.lastSequence??0)>(messagesRef.current.at(-1)?.sequence??0)){
        let after=messagesRef.current.at(-1)?.sequence??0,collected:HelpMessage[]=[];
        let page:HelpHistoryPage|undefined;
        for(let pages=0;pages<10&&valid();pages++){
          page=await helpApi.messages(id,{after});if(!valid())return;
          if(selectedRef.current)await persistPage(selectedRef.current,page);if(!valid())return;
          collected=mergeHelpMessages(collected,page.messages);const next=page.messages.at(-1)?.sequence;
          if(!page.hasNewer||!next||next<=after)break;after=next;
        }
        if(page&&valid()){
          if(page.hasNewer){
            // A very long reconnect should open a bounded latest window rather than mount every missed row.
            const latest=await helpApi.messages(id);if(!valid())return;
            if(selectedRef.current)await persistPage(selectedRef.current,latest);if(!valid())return;
            if(viewport.current?.atLatest){applyPage(latest);issueNavigation({kind:'latest',animate:false});}
            else{pageRef.current!.hasNewer=true;setHasNewer(true);}
          }else if(viewport.current?.atLatest)applyPage({...page,messages:collected},'newer');
          else if(pageRef.current){pageRef.current.hasNewer=true;setHasNewer(true);}
        }
      }
    }catch(e){if(valid()){report(e);if(isAccessRevoked(e))await revokeTicket(id);}}
  },[identity,userId,current,helpApi,applyDetail,updateMessages,persistPage,applyPage,issueNavigation,report,revokeTicket]);
  const refresh=useCallback(async()=>{
    if(replaying.current){queuedReplay.current=true;return replaying.current;}
    const account=identity;const work=(async()=>{
      do{queuedReplay.current=false;const id=activeId.current;
        // Active messages are repaired before list metadata so incoming delivery is not held up by list pagination.
        if(id&&current(account))await syncTicket(id);
        if(current(account))await loadTickets(listFilter.current.status,listFilter.current.scope,false,listFilter.current.query,true);
      }while(queuedReplay.current&&current(account));
    })();replaying.current=work;try{await work;}finally{if(replaying.current===work)replaying.current=null;}
  },[identity,current,loadTickets,syncTicket]);
  const liveRefresh = useRef(refresh); liveRefresh.current = refresh;
  useEffect(() => {
    const returned = isFocused && !previousFocus.current;
    previousFocus.current = isFocused;
    if (returned) void liveRefresh.current();
  }, [isFocused]);

  useEffect(() => {
    mounted.current = true; setTickets([]); clearSelection(); setCanManage(false); setBusy(false); setPendingCount(0); setError(null);
    replaying.current=null;queuedReplay.current=false;
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
        socket.on('help:event', () => { if(current(account))void liveRefresh.current(); });
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
      const mutationPage=detailPage(detail);await persistPage(detail.ticket,mutationPage);
      if (!current(account)) throw new Error('Учётная запись изменилась');
      if (select && navigation === detailGeneration.current) activeId.current = detail.ticket.id;
      applyDetail({...detail,...mutationPage}, !select);
      if(select&&navigation===detailGeneration.current){setFirstUnreadSequence(null);issueNavigation({kind:'latest',animate:false});}
      else if(activeId.current===detail.ticket.id&&navigation===detailGeneration.current){
        const last=detail.lastSequence??detail.ticket.lastSequence??detail.messages.at(-1)?.sequence??0;
        if(pageRef.current&&last>(messagesRef.current.at(-1)?.sequence??0)){pageRef.current.hasNewer=true;setHasNewer(true);}
        void liveRefresh.current();
      }
      return detail;
    } catch (e) { if (current(account)) report(e); throw e; }
    finally { if (operation.current === account) operation.current = null; if (current(account)) setBusy(false); }
  }, [identity, current, report, applyDetail,persistPage,issueNavigation]);

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
  const sendMessage = useCallback(async(id:number,input:HelpMessageInput)=>{
    const detail=await mutate(()=>durableSend(input,id));if(activeId.current===id)await navigateLatest.current();return detail;
  },[mutate,durableSend]);
  const editMessage = useCallback((id:number,input:{text:string;rating?:number;attachmentIds?:string[]})=>mutate(()=>helpApi.edit(id,input)),[mutate]);
  const closeTicket = useCallback((id:number,input:HelpCloseInput)=>mutate(()=>durableSend(input,id,'close')),[mutate,durableSend]);
  const reopenTicket = useCallback((id:number,input:HelpMessageInput)=>mutate(()=>durableSend(input,id,'reopen')),[mutate,durableSend]);
  const requestIt = useCallback((id:number)=>mutate(()=>helpApi.requestIt(id)),[mutate]);
  const claimTicket = useCallback((id:number)=>mutate(()=>helpApi.claim(id)),[mutate]);
  const toggleReaction = useCallback((message:HelpMessage,emoji:string)=>mutate(()=>helpApi.react(message.id,emoji,!!message.reactions.find((r)=>r.emoji===emoji)?.mine)),[mutate]);
  const markAllRead = useCallback(async()=>{await helpApi.readAll(); await refresh();},[refresh]);
  const loadOlder=useCallback(()=>loadPage('older'),[loadPage]);
  const loadNewer=useCallback(()=>loadPage('newer'),[loadPage]);
  const jump=useCallback(async(messageId?:number,sequence?:number,kind:'message'|'date'='message')=>{
    const id=activeId.current,interaction=interactionRevision.current;if(!id)return;
    const target=messageId?messagesRef.current.find(message=>message.id===messageId):null;
    if(target){issueNavigation({kind,messageId,sequence:target.sequence,animate:true});return;}
    const generation=++detailGeneration.current,account=identity;setError(null);paging.current={older:false,newer:false};setLoadingOlder(false);setLoadingNewer(false);
    try{
      const cachedMessage=messageId&&!sequence?await readCachedHelpMessage(userId,id,messageId).catch(()=>null):null;
      const targetSequence=sequence??cachedMessage?.sequence;
      const cached=await readCachedHelpTicket(userId,id,targetSequence).catch(()=>null);
      if(!current(account)||(generation!==detailGeneration.current||interaction!==interactionRevision.current))return;
      let cacheShown=false;
      if(cached?.page&&(!messageId||cached.page.messages.some(message=>message.id===messageId))){
        applyPage(cached.page);issueNavigation(messageId?{kind,messageId,sequence:targetSequence,animate:true}:{kind:'latest',animate:true});cacheShown=true;
        if(!server.isReachable)return;
      }
      const page=await helpApi.messages(id,messageId?(targetSequence?{around:targetSequence}:{aroundMessageId:messageId}):{});
      if(!current(account)||(generation!==detailGeneration.current||interaction!==interactionRevision.current)||id!==activeId.current)return;
      if(selectedRef.current)await persistPage(selectedRef.current,page);
      if(!current(account)||(generation!==detailGeneration.current||interaction!==interactionRevision.current))return;
      applyPage(page);if(!cacheShown)issueNavigation(messageId?{kind,messageId,sequence:targetSequence??page.messages.find(message=>message.id===messageId)?.sequence,animate:true}:{kind:'latest',animate:true});
    }catch(e){if(current(account)&&generation===detailGeneration.current&&interaction===interactionRevision.current){report(e);if(isAccessRevoked(e))await revokeTicket(id);}throw e;}
  },[identity,userId,current,helpApi,persistPage,applyPage,issueNavigation,report,revokeTicket,server.isReachable]);
  const jumpToMessage=useCallback((id:number,sequence?:number)=>jump(id,sequence),[jump]);
  const jumpToLatest=useCallback(()=>jump(),[jump]);
  const dateLookupGeneration=useRef(0);
  const jumpToDate=useCallback(async(date:string)=>{
    const id=activeId.current,account=identity,generation=detailGeneration.current,lookup=++dateLookupGeneration.current,interaction=interactionRevision.current;
    if(!id)return;
    const valid=()=>current(account)&&activeId.current===id&&generation===detailGeneration.current&&lookup===dateLookupGeneration.current&&interaction===interactionRevision.current;
    setError(null);
    try{
      const bounds=helpLocalDayBounds(date);
      let target:{messageId:number;sequence:number};
      if(server.isReachable)target=await helpApi.date(id,bounds.from,bounds.to);
      else{
        const cached=await findCachedHelpDate(userId,id,bounds.from,bounds.to);
        if(!valid())return;
        if(!cached.complete)throw new Error('Для перехода к дате нужно подключение: история этого дня сохранена не полностью.');
        if(cached.messageId===null||cached.sequence===null)throw new Error('За выбранный день сообщений нет.');
        target={messageId:cached.messageId,sequence:cached.sequence};
      }
      if(!valid())return;await jump(target.messageId,target.sequence,'date');
    }catch(e){if(valid()){report(e);if(isAccessRevoked(e))await revokeTicket(id);}throw e;}
  },[identity,userId,current,server.isReachable,helpApi,jump,report,revokeTicket]);
  navigateLatest.current=jumpToLatest;
  const saveViewport=useCallback(async(anchor:HelpViewportAnchor,ticketId?:number,options?:{deferTrim?:boolean})=>{
    const id=ticketId??activeId.current;if(!validHelpAnchor(anchor)||!id)return;
    if(id===activeId.current){
      viewport.current=anchor;++viewportRevision.current;
      const trimmed=pendingTrim.current&&!options?.deferTrim?trimHelpWindow(messagesRef.current,anchor,pendingTrim.current):null;
      if(trimmed&&pageRef.current){
        pendingTrim.current=null;updateMessages(trimmed.messages);
        pageRef.current={...pageRef.current,hasOlder:pageRef.current.hasOlder||trimmed.removedOlder,hasNewer:pageRef.current.hasNewer||trimmed.removedNewer};
        setHasOlder(pageRef.current.hasOlder);setHasNewer(pageRef.current.hasNewer);
        issueNavigation(anchor.atLatest&&!pageRef.current.hasNewer?{kind:'latest',animate:false}:{kind:'anchor',messageId:anchor.messageId,sequence:anchor.sequence,offset:anchor.offset,animate:false});
      }
    }
    const message=await readCachedHelpMessage(userId,id,anchor.messageId).catch(()=>null);
    if(!message||message.ticketId!==id||message.sequence!==anchor.sequence)return;
    await saveHelpViewport(userId,id,anchor).catch(report);
  },[userId,report,updateMessages,issueNavigation]);
  const markVisibleRead=useCallback(async(sequence:number)=>{
    const id=activeId.current,account=identity,generation=detailGeneration.current;
    if(!id||!canRead()||!Number.isSafeInteger(sequence)||sequence<=readSequence.current||!messagesRef.current.some(message=>message.sequence===sequence))return;
    const readOwner=`${account}:${id}:${generation}`;
    pendingRead.current=Math.max(pendingRead.current,sequence);if(reading.current===readOwner)return;reading.current=readOwner;
    try{
      while(pendingRead.current>readSequence.current&&current(account)&&generation===detailGeneration.current&&canRead()){
        const value=pendingRead.current;await helpApi.read(id,value);if(!current(account)||generation!==detailGeneration.current)return;
        readSequence.current=Math.max(readSequence.current,value);const ticket=selectedRef.current;
        if(ticket){const unread=messagesRef.current.filter(message=>message.sequence>value&&message.authorId!==userId).length;
          applyDetail({ticket:{...ticket,lastReadSequence:value,unreadCount:pageRef.current?.hasNewer?ticket.unreadCount:unread},messages:[]},true);}
      }
    }catch(e){if(current(account)&&generation===detailGeneration.current)report(e);}finally{if(reading.current===readOwner)reading.current=null;}
  },[identity,userId,canRead,current,helpApi,applyDetail,report]);
  const searchMessages=useCallback(async(query:string,cursor?:number)=>{
    const id=activeId.current,account=identity,generation=detailGeneration.current;
    if(!id||!query.trim())return {messages:[],total:0,nextCursor:null};
    const result=await helpApi.search(id,query.trim(),cursor);
    if(!current(account)||generation!==detailGeneration.current||activeId.current!==id)return {messages:[],total:0,nextCursor:null};return result;
  },[identity,current,helpApi]);
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
    hasOlder,hasNewer,loadingOlder,loadingNewer,navigationTarget,firstUnreadSequence,loadNewer,jumpToMessage,jumpToLatest,jumpToDate,cancelNavigation,saveViewport,markVisibleRead,searchMessages,
    loadTickets,openTicket,clearSelection,createTicket,sendMessage,editMessage,closeTicket,reopenTicket,requestIt,claimTicket,markAllRead,toggleReaction,
    uploadAttachments,mediaSource,loadOlder,emitTyping,getDraft,setDraft,retryPending,refresh};
}
