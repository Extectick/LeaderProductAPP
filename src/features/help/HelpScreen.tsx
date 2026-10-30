import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect, useIsFocused } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { BlurTargetView } from 'expo-blur';
import { useHelpService } from './useHelpService';
import {publishHelpActivity} from './helpActivity';
import {isHelpConnectionIssue} from './helpConnectionState';
import {matchingPendingCreate} from './helpPendingCreate';
import type { HelpAttachment, HelpMessage, HelpTicket } from './helpApi';
import { useHelpTheme, useHelpReducedMotion } from './helpTheme';
import { canEditHelpMessage, canReopenHelpTicket, helpCreated, helpTime, stableHelpOrder } from './helpUiUtils';
import type {HelpTypingUser} from './helpTypingModel';
import { HelpAvatar, HelpBlurSurface, HelpDock, HelpIcon, HelpNotice, HelpPrimaryButton, HelpSheet, HelpTyping } from './components/HelpPrimitives';
import { HelpComposer, type HelpComposeMode, type HelpLocalFile } from './components/HelpComposer';
import { HelpNativeChatLayout, hasNativeChatLayout } from './components/HelpNativeChatLayout';
import { HelpMessageBubble } from './components/HelpMessageBubble';
import {HelpPendingMessage} from './components/HelpPendingMessage';
import type {HelpPending} from './helpDurableTypes';
import { HelpAssistantMessage, HelpAssistantPreviewMenu } from './components/HelpAssistantMessage';
import type { HelpAssistantPreview } from './helpAssistant';
import { helpHasAssistantAvatar } from './helpAssistant';
import { HelpAssistantAvatar } from './components/HelpAssistantAvatar';
import { HelpListHeader } from './components/HelpListHeader';
import { HelpChatHeader } from './components/HelpChatHeader';
import { HelpPlaybackScope, HelpChatPlayback } from './components/HelpPlaybackScope';
import { HelpDateSeparator } from './components/HelpTimelineIndicators';
import { HelpChatEntry, type HelpChatEntryHandle } from './components/HelpChatEntry';
import { createHelpImageCache, HelpImageCacheContext } from './helpMediaLoading';
import { createHelpMessageLayoutCache, HelpMessageLayoutCacheContext } from './helpMessageLayoutCache';
import { HelpTimeline, type HelpTimelineHandle } from './components/HelpTimeline';
import { HelpChatSearchDock, HelpChatSearchArrows, HelpChatSearchResults } from './components/HelpChatSearch';
import { helpMessageGroups } from './helpTimelineModel';
import { HELP_LIST_INSET, HELP_LIST_META_WIDTH } from './helpLayout';
import { helpDevActions, helpDevEvent, helpDevRef, helpDevState } from './helpDiagnostics';
import { downloadHelpAttachment, HelpGallery, type HelpImageOrigin } from './components/HelpMedia';
import { HelpPhotoPortalProvider } from './components/HelpPhotoPortal';
import { clearHelpAttachmentDraft, holdHelpAttachmentFiles, loadHelpAttachmentDraft, saveHelpAttachmentDraft } from './helpAttachmentDrafts';

type SourceTicket = { id: number; number: number; title: string };
type Overlay = { kind: 'menu' | 'it' } | { kind: 'row'; ticket: HelpTicket } | { kind: 'forward'; message: HelpMessage };
type ReturnContext = { active: number | 'new'; filter: 'OPEN' | 'CLOSED'; source: SourceTicket | null; draft: string; files: HelpLocalFile[]; mode: HelpComposeMode; reply: HelpMessage | null; edit: HelpMessage | null; editAttachments: HelpAttachment[]; rating: number };

export default function HelpScreen() {
  const nativeLayoutId = useId();
  const nativeScrollId = `help-chat-scroll-${nativeLayoutId}`, nativeDockId = `help-chat-dock-${nativeLayoutId}`;
  const isFocused = useIsFocused();
  const service = useHelpService(isFocused); const c = useHelpTheme(); const insets = useSafeAreaInsets(); const router = useRouter(); const params = useLocalSearchParams<{ ticketId?: string;messageId?:string;eventId?:string }>();
  const imageCache=useMemo(()=>createHelpImageCache(),[service.userId]);
  const messageLayoutCache=useMemo(()=>createHelpMessageLayoutCache(),[service.userId]);
  // Optional capability supplied only by the isolated QA service alias.
  const assistantPreview = (service as typeof service & { assistantPreview?: HelpAssistantPreview }).assistantPreview;
  const renderAccount=service.userId;
  const currentAccount = useRef(service.userId); currentAccount.current = service.userId;
  const screenMounted=useRef(true);useEffect(()=>{screenMounted.current=true;return()=>{screenMounted.current=false;};},[]);
  const draftRevisions = useRef(new Map<string,number>());
  const sentDraftRevisions = useRef(new Map<string,number>());
  const [retainList, setRetainList] = useState(false);
  const [entrySettled,setEntrySettled]=useState(false);
  const chatEntry = useRef<HelpChatEntryHandle>(null);
  const listBlurTarget = useRef<View>(null), retainedListHeight = useRef(0);
  const [active, setActive] = useState<number | 'new' | null>(null); const [filter, setFilter] = useState<'OPEN' | 'CLOSED'>('OPEN'); const [scope, setScope] = useState<'mine' | 'queue'>('mine');
  const [search, setSearch] = useState(''); const [order, setOrder] = useState<number[]>([]); const [draft, setDraft] = useState(''); const [files, setFiles] = useState<HelpLocalFile[]>([]); const [source, setSource] = useState<SourceTicket | null>(null);
  const [listDrafts,setListDrafts]=useState<Record<number,string>>({});
  const [mode, setMode] = useState<HelpComposeMode>('message'); const [rating, setRating] = useState(0); const [reply, setReply] = useState<HelpMessage | null>(null); const [editing, setEditing] = useState<HelpMessage | null>(null); const [editAttachments, setEditAttachments] = useState<HelpAttachment[]>([]); const [focusKey, setFocusKey] = useState(0);
  const [overlay, setOverlay] = useState<Overlay | null>(null); const [selectedMessage, setSelectedMessage] = useState<number | null>(null); const [notice, setNotice] = useState(''); const [gallery, setGallery] = useState<{ images: HelpAttachment[]; index: number; origin?:HelpImageOrigin } | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null); const [dockHeight, setDockHeight] = useState(64); const [sending, setSending] = useState(false); const [sheetOffset, setSheetOffset] = useState(0);
  const [chatViewportHeight,setChatViewportHeight]=useState(0);
  const [nativeFollow,setNativeFollow]=useState(false);
  const [chatSearchOpen,setChatSearchOpen]=useState(false),[chatSearchQuery,setChatSearchQuery]=useState('');
  const [chatResults,setChatResults]=useState<HelpMessage[]>([]),[chatSearchTotal,setChatSearchTotal]=useState(0),[chatSearchCursor,setChatSearchCursor]=useState<number|null>(null);
  const [chatResultIndex,setChatResultIndex]=useState(-1),[chatSearchLoading,setChatSearchLoading]=useState(false),[chatSearchList,setChatSearchList]=useState(false),[chatSearchError,setChatSearchError]=useState<string|null>(null);
  const chatSearchGeneration=useRef(0),highlightTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const [listHeaderHeight,setListHeaderHeight]=useState(100);
  const [stickyDate,setStickyDate]=useState<string|null>(null);
  const listScroll=useRef<ScrollView>(null);
  const scroll = useRef<HelpTimelineHandle>(null); const followBottom = useRef(true); const stack = useRef<ReturnContext[]>([]); const regularDraft = useRef({ text: '', files: [] as HelpLocalFile[], reply: null as HelpMessage | null });
  const draftGeneration = useRef(0); const navigationGeneration = useRef(0); const draftLoaded = useRef(false); const fileDrafts = useRef(new Map<string,HelpLocalFile[]>()); const restoredDraft = useRef<{key: string; text: string} | null>(null); const uploadCache = useRef(new Map<string, HelpAttachment>()); const submitLock = useRef(false); const typingAt = useRef(0); const deepLink = useRef<string | undefined>(undefined); const blurTarget = useRef<View>(null);
  const ticket = active && active !== 'new' && service.selectedTicket?.id === active ? service.selectedTicket : null;
  const isOwner = ticket?.ownerId === service.userId;
  const isParticipant = Boolean(isOwner || ticket?.members.some(member => member.userId === service.userId));
  const messages = useMemo(() => {
    if (!ticket) return [];
    const lastInput = [...service.messages].reverse().find(message => message.authorId === service.userId)?.sequence ?? 0;
    return service.messages.filter(message => message.text || !message.assistantRun || !(message.assistantRun.stopReason === 'superseded' || message.sequence < lastInput && ['thinking','streaming'].includes(message.assistantRun.status)));
  }, [ticket?.id, service.messages, service.userId]);
  const lastAssistant = [...messages].reverse().find(message => message.assistantRun);
  const assistantActions=service as unknown as {lastCreatedOperation?:{key:string;ticketId:number;text:string;sourceTicketId?:number};pendingMessages?:HelpPending[];retryPendingOperation?:(key:string)=>Promise<unknown>;stopAssistant?:(ticketId:number,runId:string)=>Promise<unknown>;retryAssistant?:(ticketId:number,runId:string)=>Promise<unknown>;aiEnabled?:boolean};
  const pendingCreate=active==='new'?matchingPendingCreate(assistantActions.pendingMessages??[],draft,source?.id):undefined;
  const seenPendingCreates=useRef(new Set<string>()),consumedCreations=useRef(new Set<string>());
  for(const item of assistantActions.pendingMessages??[])if(item.create)seenPendingCreates.current.add(item.key);
  const activeAssistant = (assistantPreview||assistantActions.stopAssistant) && mode === 'message' && lastAssistant?.assistantRun && ['thinking','streaming'].includes(lastAssistant.assistantRun.status) ? lastAssistant : undefined;
  const busy = sending || service.busy; const draftKey = active === 'new' ? `new:${source?.id ?? 'plain'}` : `ticket:${active}`;
  useEffect(()=>{const created=assistantActions.lastCreatedOperation;if(!created||busy||consumedCreations.current.has(created.key))return;consumedCreations.current.add(created.key);if(!seenPendingCreates.current.has(created.key)||active!=='new'||created.text.trim()!==draft.trim()||(created.sourceTicketId??null)!==(source?.id??null))return;sentDraftRevisions.current.set(draftKey,draftRevisions.current.get(draftKey)??0);fileDrafts.current.set(draftKey,[]);void clearHelpAttachmentDraft(service.userId,draftKey).catch(()=>tell('Не удалось очистить вложения черновика.'));setDraft('');setFiles([]);restoredDraft.current={key:`ticket:${created.ticketId}`,text:''};void open(created.ticketId);},[assistantActions.lastCreatedOperation,busy,active,draft,source?.id,draftKey,service.userId]);
  const draftScope = useRef({account:service.userId,key:draftKey,mode}); draftScope.current={account:service.userId,key:draftKey,mode};
  const filePersistence = useRef(new Map<string,{revision:number;promise:Promise<HelpLocalFile[]>}>());
  const messageGroups=useMemo(()=>helpMessageGroups(messages,service.firstUnreadSequence),[messages,service.firstUnreadSequence]);
  const tell = useCallback((message: string) => setNotice(message), []);
  const run = async (work: () => Promise<unknown>) => { try { await work(); } catch (e) { tell(e instanceof Error ? e.message : 'Не удалось выполнить действие.'); } };
  const composerResizingUntil = useRef(0);
  const scrollBottom = (animated = true) => { if (!hasNativeChatLayout && followBottom.current) requestAnimationFrame(() => { if (followBottom.current) scroll.current?.scrollToEnd({ animated }); }); };
  const draftTicketIds=service.tickets.map(item=>item.id).join(',');
  useEffect(()=>{setListDrafts({});},[service.userId]);
  useEffect(()=>{if(active!==null)return;let alive=true;const account=service.userId;void Promise.all(service.tickets.map(async item=>[item.id,await service.getDraft(`ticket:${item.id}`)] as const)).then(values=>{if(alive&&currentAccount.current===account)setListDrafts(Object.fromEntries(values));}).catch(()=>{});return()=>{alive=false;};},[active,service.userId,draftTicketIds,service.getDraft]);
  useEffect(() => { ++draftGeneration.current; draftLoaded.current = false; restoredDraft.current = null; setActive(null); setDraft(''); setFiles([]); setSource(null); setMode('message'); setReply(null); setEditing(null); setEditAttachments([]); setGallery(null); setOverlay(null); setNotice(''); setSelectedMessage(null); setOrder([]); setFilter('OPEN'); setScope('mine'); setSending(false); submitLock.current=false; stack.current = []; uploadCache.current.clear(); fileDrafts.current.clear(); filePersistence.current.clear(); draftRevisions.current.clear(); sentDraftRevisions.current.clear(); regularDraft.current = {text:'',files:[],reply:null}; deepLink.current = undefined; }, [service.userId]);
  useEffect(() => { if (!active) return; const generation = ++draftGeneration.current; setFiles(fileDrafts.current.get(draftKey)??[]); if (restoredDraft.current?.key === draftKey) { setDraft(restoredDraft.current.text); restoredDraft.current = null; draftLoaded.current = true; return; } draftLoaded.current = false; setDraft(''); void Promise.all([service.getDraft(draftKey),fileDrafts.current.has(draftKey)?Promise.resolve(fileDrafts.current.get(draftKey)!):loadHelpAttachmentDraft(service.userId,draftKey)]).then(([value,attachments]) => { if (generation === draftGeneration.current) { setDraft(value); setFiles(attachments); fileDrafts.current.set(draftKey,attachments); draftLoaded.current = true; } }).catch(() => { if (generation === draftGeneration.current) draftLoaded.current = true; }); return () => { ++draftGeneration.current; }; }, [draftKey, service.userId]);
  useEffect(() => { if (!active || mode !== 'message' || !draftLoaded.current) return; const revision=draftRevisions.current.get(draftKey)??0;const timer = setTimeout(() => { if((draftRevisions.current.get(draftKey)??0)===revision&&sentDraftRevisions.current.get(draftKey)!==revision)void service.setDraft(draftKey, draft); }, 250); return () => clearTimeout(timer); }, [draft, active, mode, draftKey, service.setDraft]);
  useEffect(() => { if (active === null && service.tickets.length && !order.length) setOrder(stableHelpOrder(service.tickets, []).map(t => t.id)); }, [service.tickets, active, order.length]);
  useEffect(() => {const timer=setTimeout(()=>{setOrder([]);void service.loadTickets(filter,scope,false,search.trim());},250);return()=>clearTimeout(timer);},[search,filter,scope,service.loadTickets]);
  useEffect(() => {const id=Number(params.ticketId),messageId=Number(params.messageId),key=`${params.ticketId}:${params.messageId??''}:${params.eventId??''}`;if(service.userId&&params.ticketId&&deepLink.current!==key&&Number.isSafeInteger(id)&&id>0){deepLink.current=key;void open(id,Number.isSafeInteger(messageId)&&messageId>0?messageId:undefined);}},[params.ticketId,params.messageId,params.eventId,service.userId]);
  useEffect(()=>{
    const generation=++chatSearchGeneration.current;
    if(!chatSearchOpen || !chatSearchQuery.trim() || typeof active!=='number') {setChatResults([]);setChatSearchTotal(0);setChatSearchCursor(null);setChatResultIndex(-1);setChatSearchLoading(false);return;}
    setChatSearchLoading(true);setChatSearchError(null);
    const timer=setTimeout(()=>{void service.searchMessages(chatSearchQuery.trim()).then(result=>{
      if(generation!==chatSearchGeneration.current)return;
      setChatResults(result.messages);setChatSearchTotal(result.total);setChatSearchCursor(result.nextCursor);setChatResultIndex(result.messages.length?0:-1);
      if(result.messages[0])void showSearchResult(result.messages[0],0,false);
    }).catch(e=>{if(generation===chatSearchGeneration.current)setChatSearchError(e instanceof Error?e.message:'Поиск недоступен');})
      .finally(()=>{if(generation===chatSearchGeneration.current)setChatSearchLoading(false);});},300);
    return()=>{clearTimeout(timer);++chatSearchGeneration.current;};
  },[chatSearchOpen,chatSearchQuery,active,service.userId]);
  useEffect(()=>{setChatSearchOpen(false);setChatSearchQuery('');setChatSearchList(false);setNativeFollow(false);},[active,service.userId]);
  useEffect(()=>()=>{if(highlightTimer.current)clearTimeout(highlightTimer.current);},[]);
  function highlight(id:number){setHighlighted(id);if(highlightTimer.current)clearTimeout(highlightTimer.current);highlightTimer.current=setTimeout(()=>setHighlighted(null),1600);}
  async function showSearchResult(message:HelpMessage,index:number,dismissKeyboard=true){
    setChatResultIndex(index);setChatSearchList(false);if(dismissKeyboard)Keyboard.dismiss();scroll.current?.prepareJump(message.sequence);
    try {if(!await(scroll.current?.waitForJumpReady?.()??true))return;await service.jumpToMessage(message.id,message.sequence);}catch(e){scroll.current?.cancelJump();tell(e instanceof Error?e.message:'Не удалось открыть сообщение');}
  }
  async function moreSearch(selectNext=false){
    if(chatSearchCursor===null || chatSearchLoading)return;
    const generation=chatSearchGeneration.current;setChatSearchLoading(true);
    try {const page=await service.searchMessages(chatSearchQuery.trim(),chatSearchCursor);
      if(generation!==chatSearchGeneration.current)return;
      const existing=new Set(chatResults.map(message=>message.id)),next=page.messages.filter(message=>!existing.has(message.id));
      setChatResults(old=>[...old,...next]);setChatSearchCursor(page.nextCursor);setChatSearchTotal(page.total);
      if(selectNext && next[0])await showSearchResult(next[0],chatResults.length);
    }catch(e){if(generation===chatSearchGeneration.current)setChatSearchError(e instanceof Error?e.message:'Не удалось загрузить результаты');}
    finally{if(generation===chatSearchGeneration.current)setChatSearchLoading(false);}
  }
  function nextSearch(){const index=chatResultIndex+1;if(chatResults[index])void showSearchResult(chatResults[index],index);else void moreSearch(true);}
  function closeSearch(){++chatSearchGeneration.current;setChatSearchOpen(false);setChatSearchList(false);Keyboard.dismiss();}
  const activityOwner=useRef({});
  useEffect(()=>publishHelpActivity(activityOwner.current,{userId:service.userId,ticketId:isFocused&&typeof active==='number'?active:null}),[service.userId,isFocused,active]);
  useFocusEffect(useCallback(() => { return () => { if (typeof active === 'number') service.emitTyping(active, false); }; }, [active, service.emitTyping]));

  useEffect(() => helpDevActions('screen', {
    'screen.back': () => back(), 'screen.list': () => list(), 'screen.new': () => newTicket(),
    'screen.open': value => { const id=Number(value); if(Number.isSafeInteger(id)&&id>0)return open(id); },
    'screen.search': value => { if(typeof value==='string')setSearch(value); },
    'screen.chatSearch': value => {if(typeof value==='string'){setChatSearchOpen(true);setChatSearchQuery(value);}},
    'screen.searchNext': ()=>nextSearch(), 'screen.searchClose':()=>closeSearch(), 'screen.dismissKeyboard':()=>Keyboard.dismiss(),
    'screen.jump': value=>{const id=Number(value);if(Number.isSafeInteger(id))jump(id);},
    'screen.scroll': value => { const y=Number(value); if(Number.isFinite(y))(active===null ? listScroll : scroll).current?.scrollTo({y:Math.max(0,y),animated:false}); },
  }));
  useEffect(() => helpDevState({ screen:active===null ? 'list' : active==='new' ? 'new' : 'chat', filter, scope, canManage:service.canManage, searchLength:search.length, dockHeight, listHeaderHeight, theme:c.dark ? 'dark' : 'light' }), [active,filter,scope,service.canManage,search.length,dockHeight,listHeaderHeight,c.dark]);

  async function open(id: number,messageId?:number) {
    setEntrySettled(false);
    if (active === null) { retainedListHeight.current = listHeaderHeight; setRetainList(true); }
    // Reply/edit focus belongs to that composer, not every subsequently opened chat.
    if (active !== 'new') setFocusKey(0);
    const openedAt = Date.now();
    helpDevEvent('chat.open.request', { ticketId: id, openedAt });
    saveDraftNow();
    ++navigationGeneration.current; Keyboard.dismiss(); setOverlay(null); setSelectedMessage(null); setMode('message'); setReply(null); setEditing(null); setFiles([]); setSource(null); setActive(id); followBottom.current = true;
    try {
      await service.openTicket(id,messageId?{messageId}:undefined);
      helpDevEvent('chat.open.data', { ticketId: id, openedAt, elapsedMs: Date.now() - openedAt });
    } catch (e) { tell(e instanceof Error ? e.message : 'Не удалось открыть обращение'); }
  }
  function persistFiles(value:HelpLocalFile[],key=draftKey,account=renderAccount,revision=draftRevisions.current.get(key)??0):Promise<HelpLocalFile[]> {
    const existing=filePersistence.current.get(key);if(account===currentAccount.current&&existing?.revision===revision)return existing.promise;
    if(account===currentAccount.current)fileDrafts.current.set(key,value);
    const promise=saveHelpAttachmentDraft(account,key,value).then(durable=>{
      if(currentAccount.current===account&&(draftRevisions.current.get(key)??0)===revision){fileDrafts.current.set(key,durable);if(screenMounted.current&&draftScope.current.key===key&&draftScope.current.mode==='message')setFiles(durable);}
      return durable;
    });
    filePersistence.current.set(key,{revision,promise});
    void promise.catch(()=>{if(filePersistence.current.get(key)?.promise===promise)filePersistence.current.delete(key);});
    return promise;
  }
  function saveDraftNow() { scroll.current?.save(); if (active && mode === 'message') { const sent=sentDraftRevisions.current.get(draftKey)===(draftRevisions.current.get(draftKey)??0);void persistFiles(sent?[]:files).catch(()=>tell('Не удалось сохранить вложения черновика.')); void service.setDraft(draftKey, sent?'':draft).catch(()=>tell('Не удалось сохранить черновик.')); } }
  function list(next: 'OPEN' | 'CLOSED' = filter) { setRetainList(false); setEntrySettled(false); setFocusKey(0); ++navigationGeneration.current; saveDraftNow(); Keyboard.dismiss(); setActive(null); service.clearSelection(); setMode('message'); setFiles([]); setReply(null); setEditing(null); setSource(null); setOrder([]); setFilter(next); stack.current = []; void service.loadTickets(next, scope,false,search.trim()); }
  function newTicket(linked: SourceTicket | null = null) { setEntrySettled(false); setRetainList(false); ++navigationGeneration.current; saveDraftNow(); Keyboard.dismiss(); stack.current = []; service.clearSelection(); setActive('new'); setSource(linked); setDraft(''); setFiles([]); setMode('message'); setReply(null); setEditing(null); setSelectedMessage(null); followBottom.current = true; setFocusKey(n => n + 1); }
  function cancelMode() { ++navigationGeneration.current; setMode('message'); setDraft(regularDraft.current.text); setFiles(regularDraft.current.files); setReply(regularDraft.current.reply); setEditing(null); Keyboard.dismiss(); }
  async function back() {
    if (gallery) { setGallery(null); return; } if (overlay) { setOverlay(null); return; } if (selectedMessage !== null) { setSelectedMessage(null); return; }
    if(chatSearchOpen){closeSearch();return;}
    if (mode !== 'message') { cancelMode(); return; }
    const previous = stack.current.pop();
    if (previous) {
      const restoreNavigation = ++navigationGeneration.current, restoreAccount = service.userId;
      restoredDraft.current = {key: previous.active === 'new' ? `new:${previous.source?.id ?? 'plain'}` : `ticket:${previous.active}`, text: previous.draft};
      saveDraftNow(); Keyboard.dismiss(); setActive(previous.active); setSource(previous.source); setFilter(previous.filter); setMode(previous.mode); setReply(previous.reply); setEditing(previous.edit); setEditAttachments(previous.editAttachments); setRating(previous.rating); setFiles(previous.files); draftLoaded.current = false;
      if (previous.active === 'new') service.clearSelection(); else await run(() => service.openTicket(previous.active as number));
      if (currentAccount.current !== restoreAccount || navigationGeneration.current !== restoreNavigation) return;
      // Restoring an existing draft is intentional; prevent the async storage read from replacing it.
      ++draftGeneration.current; setDraft(previous.draft); draftLoaded.current = true; return;
    }
    if (active !== null) { list(); return; } if (filter === 'CLOSED') { list('OPEN'); return; } router.replace('/services' as any);
  }
  const latestBack = useRef(back); latestBack.current = back;
  useFocusEffect(useCallback(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { void latestBack.current(); return true; }); return () => subscription.remove(); }, []));
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'web') return;
    // Keep one local history guard: Back uses the same overlay/chat/archive hierarchy as Android.
    const url = window.location.href; const previousState = window.history.state;
    window.history.pushState({...previousState,helpLocalBack:true},'',url);
    const onPop = (event: PopStateEvent) => { event.stopImmediatePropagation(); window.history.pushState({...previousState,helpLocalBack:true},'',url); void latestBack.current(); };
    window.addEventListener('popstate',onPop,true);
    return () => window.removeEventListener('popstate',onPop,true);
  }, []));
  const visible = useMemo(() => stableHelpOrder(service.tickets.filter(t => t.status === filter), order), [service.tickets, filter, order]);
  const sourceLink = ticket ? ticket.sourceTicket : source;
  async function openSource() {
    if (!sourceLink || !active) return;
    stack.current.push({ active, filter, source, draft, files, mode, reply, edit: editing, editAttachments, rating }); saveDraftNow(); await open(sourceLink.id);
  }
  function startMode(next: HelpComposeMode, message?: HelpMessage) {
    ++navigationGeneration.current;
    if (mode === 'message') regularDraft.current = { text: draft, files, reply };
    setMode(next); setDraft(message?.text ?? ''); setFiles([]); setReply(null); setRating(message?.rating ?? 0); setEditing(message ?? null); setEditAttachments(message?.attachments ?? []); setOverlay(null); setSelectedMessage(null); setFocusKey(n => n + 1); followBottom.current = true;
  }
  function replyTo(message: HelpMessage) { if (mode !== 'message' || ticket?.status !== 'OPEN' || !isParticipant) return; setReply(message); setSelectedMessage(null); setFocusKey(n => n + 1); }
  function jump(id: number) { followBottom.current=false;scroll.current?.prepareJump(messages.find(message=>message.id===id)?.sequence);void (async()=>{if(await(scroll.current?.waitForJumpReady?.()??true))await service.jumpToMessage(id);})().catch(e=>{scroll.current?.cancelJump();tell(e instanceof Error?e.message:'Исходное сообщение недоступно');}); }
  async function submit(voice?: HelpLocalFile, selectedFiles?: HelpLocalFile[]):Promise<boolean> {
    if(pendingCreate){tell('Это обращение уже ожидает отправки. Повтор доступен у сохранённого сообщения.');return false;}
    const account = renderAccount;
    const navigation = navigationGeneration.current;
    if (submitLock.current || !active || !screenMounted.current || currentAccount.current!==account || draftScope.current.key!==draftKey || draftScope.current.mode!==mode) return false;
    let chosenFiles=voice?[voice]:[...(selectedFiles??files)];
    if (mode === 'reopen' && !draft.trim()) { tell('Напишите, что случилось снова.'); return false; }
    if (mode === 'message' && !draft.trim() && !chosenFiles.length) return false;
    if (chosenFiles.length+(mode==='edit'?editAttachments.length:0)>10){tell('В одном сообщении можно прикрепить до 10 файлов.');return false;}
    if (mode === 'edit' && editing && !canEditHelpMessage(editing, service.userId)) { tell('Редактировать сообщение можно только в течение часа.'); return false; }
    if(selectedFiles&&!voice)changeFiles(chosenFiles);
    const draftRevision = draftRevisions.current.get(draftKey)??0;
    submitLock.current = true; setSending(true);
    const releaseFiles=[holdHelpAttachmentFiles(chosenFiles)];let committed=false;
    try {
      if(mode==='message'&&!voice){chosenFiles=await persistFiles(chosenFiles,draftKey,account,draftRevision);releaseFiles.push(holdHelpAttachmentFiles(chosenFiles));}
      if(currentAccount.current!==account)return false;
      const uploads: HelpAttachment[] = [];
      for (const file of chosenFiles) { let upload = uploadCache.current.get(file.uri); if (!upload) { [upload] = await service.uploadAttachments([file]); if(currentAccount.current!==account) return false; uploadCache.current.set(file.uri, upload); } uploads.push(upload); }
      if(currentAccount.current!==account) return false;
      const text = voice ? '' : draft.trim(); let detail;
      if (mode === 'edit' && editing) detail = await service.editMessage(editing.id, { text, ...(editing.kind === 'CLOSURE' ? { rating } : {}), attachmentIds: [...editAttachments.map(a => a.id), ...uploads.map(a => a.id)] });
      else if (mode === 'close' && ticket) detail = await service.closeTicket(ticket.id, { text, rating, attachmentIds: uploads.map(a => a.id) });
      else if (mode === 'reopen' && ticket) { if (!canReopenHelpTicket(ticket)) throw new Error('Прошло больше 3 дней. Создайте новое обращение.'); detail = await service.reopenTicket(ticket.id, { text, attachmentIds: uploads.map(a => a.id) }); }
      else if (active === 'new') detail = await service.createTicket({ text, attachmentIds: uploads.map(a => a.id), sourceTicketId: source?.id });
      else detail = await service.sendMessage(active, { text, attachmentIds: uploads.map(a => a.id), replyToId: reply?.id });
      if (!detail) return false;committed=true;chosenFiles.forEach(file=>uploadCache.current.delete(file.uri));
      if(currentAccount.current!==account)return true;
      const unchanged=()=>currentAccount.current===account&&(draftRevisions.current.get(draftKey)??0)===draftRevision;
      if (mode === 'message' && !voice && unchanged()) {
        sentDraftRevisions.current.set(draftKey,draftRevision);
        const filesClearing=clearHelpAttachmentDraft(account,draftKey).then(()=>[] as HelpLocalFile[]);
        const clearing=Promise.all([service.setDraft(draftKey,''),filesClearing]);
        fileDrafts.current.set(draftKey,[]);filePersistence.current.set(draftKey,{revision:draftRevision,promise:filesClearing});
        await clearing;
        if(screenMounted.current&&unchanged()&&navigationGeneration.current===navigation){setDraft('');setFiles([]);setReply(null);}
      }
      if(!screenMounted.current||navigationGeneration.current!==navigation||!unchanged())return true;
      if (mode === 'message' && voice) setReply(null);
      if (active === 'new') { restoredDraft.current = {key:`ticket:${detail.ticket.id}`,text:voice ? draft : ''}; setActive(detail.ticket.id); setSource(null); await service.setDraft(`ticket:${detail.ticket.id}`, voice ? draft : ''); }
      if(currentAccount.current!==account||navigationGeneration.current!==navigation)return true;
      if (mode !== 'message') { setMode('message'); setDraft(regularDraft.current.text); setFiles(regularDraft.current.files); setReply(regularDraft.current.reply); setEditing(null); Keyboard.dismiss(); }
      followBottom.current = true;
      if(mode === 'message') {
        if(active!=='new')scroll.current?.scrollToEnd({animated:false});else scrollBottom(false);
      } else if(active!=='new')await service.jumpToLatest();else scrollBottom();
      return true;
    } catch (e) {
      if(currentAccount.current!==account)return committed;
      if(voice&&!committed){const old=fileDrafts.current.get(draftKey)??files;const retained=old.some(file=>file.uri===voice.uri)?old:[...old,voice];const revision=(draftRevisions.current.get(draftKey)??0)+1;draftRevisions.current.set(draftKey,revision);void persistFiles(retained,draftKey,account,revision).catch(()=>{});if(navigationGeneration.current===navigation)setFiles(retained);}
      if(screenMounted.current&&navigationGeneration.current===navigation)tell(committed?'Сообщение отправлено, но не удалось обновить черновик.':e instanceof Error ? e.message : 'Сообщение не отправлено. Черновик сохранён.');
      return committed;
    } finally { releaseFiles.forEach(release=>release());if(currentAccount.current===account){submitLock.current = false;if(screenMounted.current)setSending(false);} }
  }
  function changeDraft(text: string) { if(mode==='message')draftRevisions.current.set(draftKey,(draftRevisions.current.get(draftKey)??0)+1); draftLoaded.current = true; ++draftGeneration.current; setDraft(text); if (typeof active === 'number' && Date.now() - typingAt.current > 1800) { typingAt.current = Date.now(); service.emitTyping(active, Boolean(text.trim())); } }
  function changeFiles(value: HelpLocalFile[]) { if(mode==='message'){draftRevisions.current.set(draftKey,(draftRevisions.current.get(draftKey)??0)+1);++draftGeneration.current;draftLoaded.current=true;void persistFiles(value).catch(()=>{if(currentAccount.current===service.userId)tell('Не удалось сохранить вложения черновика.');});} setFiles(value); }
  const lastIncoming = [...messages].reverse().find(m => m.authorRole === 'IT' && m.kind === 'TEXT');
  const listHeader = <HelpListHeader connecting={!service.connected} search={search} onSearch={setSearch} archived={filter === 'CLOSED'} onArchive={() => list(filter === 'OPEN' ? 'CLOSED' : 'OPEN')} onBack={() => void back()} canManage={service.canManage} scope={scope} onScope={()=>{const next=scope==='mine' ? 'queue' : 'mine';setScope(next);setOrder([]);void service.loadTickets(filter,next,false,search.trim());}} />; const header = active === null ? listHeader : <HelpChatHeader connecting={!service.connected} search={chatSearchOpen && ticket ? {query:chatSearchQuery,onQueryChange:setChatSearchQuery,onClose:closeSearch,onSubmit:()=>Keyboard.dismiss(),autoFocus:true} : undefined} menuActive={overlay?.kind==='menu'} onSearch={ticket?()=>{saveDraftNow();Keyboard.dismiss();setChatSearchOpen(true);}:undefined} title={ticket?.title || (active==='new' ? 'Новое обращение' : 'Обращение')} meta={ticket ? `${ticket.status==='CLOSED' ? 'Закрыто' : 'Открыто'} · #${ticket.number} · ${helpCreated(ticket.createdAt)}` : ''} onBack={()=>void back()} onMenu={ticket || assistantPreview ? ()=>{Keyboard.dismiss();setOverlay(previous=>previous?.kind==='menu'?null:{kind:'menu'});} : undefined}/>;

  return <HelpImageCacheContext.Provider value={imageCache}><HelpMessageLayoutCacheContext.Provider value={messageLayoutCache}><HelpPhotoPortalProvider><HelpPlaybackScope userId={service.userId} ticketId={typeof active === 'number' ? active : null} onError={tell}><KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center' }}>
      {service.pendingCount > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Восстановить отправку" disabled={busy} onPress={() => void run(() => service.retryPending())} style={{padding:10,backgroundColor:c.elevated}}><Text style={{color:c.accentText,fontSize:13,textAlign:'center'}}>Восстановить отправку ({service.pendingCount})</Text></Pressable> : null}
      {service.error&&!isHelpConnectionIssue(service.error) ? <Pressable accessibilityRole="button" onPress={() => void run(() => service.retryPending())} style={{ paddingVertical: 7, paddingHorizontal: 14, backgroundColor: c.danger + '15' }}><Text style={{ color: c.danger, fontSize: 12 }} numberOfLines={2}>{service.error} · Повторить</Text></Pressable> : null}
      {active === null || retainList ? <View key="help-list-scene" renderToHardwareTextureAndroid={active!==null} pointerEvents={active===null?'auto':'none'} accessibilityElementsHidden={active!==null} importantForAccessibility={active===null?'auto':'no-hide-descendants'} style={active===null?{flex:1}:StyleSheet.absoluteFill}>

        <BlurTargetView ref={listBlurTarget} style={{ flex: 1 }}><ScrollView ref={listScroll} testID="help-ticket-list" style={{backgroundColor:c.background}} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop:active===null?listHeaderHeight:retainedListHeight.current, paddingBottom: 100 }} onScroll={e => { const s = e.nativeEvent; helpDevState({listScrollY:s.contentOffset.y}); if (service.hasMore && !service.loading && s.contentOffset.y + s.layoutMeasurement.height > s.contentSize.height - 200) void service.loadTickets(filter, scope, true,search.trim()); }} scrollEventThrottle={160}>
          {!visible.length ? <View style={{ alignItems: 'center', padding: 35, gap: 10 }}>{service.loading ? <ActivityIndicator color={c.accent} /> : <><Ionicons name={filter === 'CLOSED' ? 'archive-outline' : 'chatbubbles-outline'} color={c.muted} size={38} /><Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{search ? 'Ничего не найдено' : filter === 'CLOSED' ? 'Закрытых обращений пока нет' : 'Расскажите, чем помочь'}</Text><Text style={{ color: c.muted, textAlign: 'center', fontSize: 13 }}>{search ? 'Попробуйте другой запрос' : 'Ваши сообщения и вложения увидят специалисты IT.'}</Text></>}</View> : null}
          {visible.map(item => <TicketRow key={item.id} ticket={item} draft={listDrafts[item.id]} typing={service.typingByTicket[item.id]} onPress={() => { saveDraftNow(); void open(item.id); }} onMenu={() => { Keyboard.dismiss(); setOverlay({ kind: 'row', ticket: item }); }} />)}
          {service.loading && visible.length ? <ActivityIndicator color={c.accent} style={{ margin: 15 }} /> : null}
        </ScrollView></BlurTargetView><View testID="help-list-header-overlay" onLayout={event=>{if(active===null)setListHeaderHeight(event.nativeEvent.layout.height);}} style={{position:'absolute',top:0,left:0,right:0,zIndex:2}}><View pointerEvents="none" style={StyleSheet.absoluteFill}><HelpBlurSurface target={active===null?listBlurTarget:undefined} edge="bottom"/></View>{listHeader}</View><View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}><HelpDock target={active===null?listBlurTarget:undefined}><View style={{ paddingHorizontal: HELP_LIST_INSET - 8 }}><HelpPrimaryButton text="Новое обращение" onPress={() => newTicket()} /></View></HelpDock></View>
      </View> : null}
      {active !== null ? <HelpChatEntry key={`${service.userId}:${active}`} ref={chatEntry} ready={active==='new'} backgroundColor={c.background} onEntered={()=>{setEntrySettled(true);setRetainList(false);helpDevEvent('chat.open.transitionFinished',{ticketId:typeof active==='number'?active:null,finishedAt:Date.now()});}} onLayout={event=>setChatViewportHeight(event.nativeEvent.layout.height)}>
        <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
          <HelpTimeline key={`${service.userId}:${active}`} onReady={()=>chatEntry.current?.reveal()} ref={scroll} messages={messages} nativeID={nativeScrollId} headerHeight={listHeaderHeight} dockHeight={dockHeight}
            navigationTarget={service.navigationTarget} firstUnreadSequence={service.firstUnreadSequence} hasOlder={service.hasOlder} hasNewer={service.hasNewer}
            loadingOlder={service.loadingOlder} loadingNewer={service.loadingNewer} loading={service.loading} online={service.online}
            hideStickyDate onStickyDateChange={setStickyDate} hideLatestButton={chatSearchOpen} active={isFocused && !chatSearchList && !overlay && !gallery} unreadCount={ticket?.unreadCount}
            loadOlder={service.loadOlder} loadNewer={service.loadNewer} onLatest={async()=>{if(await(scroll.current?.waitForJumpReady?.()??true))return service.jumpToLatest();}} onDate={async date=>{if(await(scroll.current?.waitForJumpReady?.()??true))return service.jumpToDate(date);}} onUserScroll={service.cancelNavigation} onSave={(anchor,options)=>service.saveViewport(anchor,typeof active==='number'?active:undefined,options)} onRead={service.markVisibleRead}
            onFollow={value=>{followBottom.current=value;setNativeFollow(value);}} onHighlight={highlight} onError={tell}
            header={<>{sourceLink ? <Pressable accessibilityRole="button" onPress={() => void openSource()} style={{ margin: 12, borderRadius: 14, padding: 10, backgroundColor: c.surface, flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name="return-up-back" size={22} color={c.accentText} /><View style={{ flex: 1 }}><Text style={{ color: c.accentText, fontSize: 12 }}>По обращению #{sourceLink.number}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{sourceLink.title}</Text></View><Ionicons name="chevron-forward" color={c.muted} size={17} /></Pressable> : null}{active === 'new' ? <Text style={{ color: c.muted, textAlign: 'center', fontSize: 13, lineHeight: 19, margin: 30 }}>Опишите, что случилось. Обращение будет создано после первого сообщения.{ '\n' }{assistantPreview||assistantActions.aiEnabled ? 'Помощник подготовит ответ. Можно закрыть приложение — сообщим, когда ответ будет готов.' : 'Ваше сообщение получат специалисты IT.'}</Text> : null}</>} footer={<>{assistantActions.pendingMessages?.filter(item=>active==='new'?item.create:item.ticketId===active).map(item=><HelpPendingMessage key={item.key} item={item} onRetry={()=>void run(()=>assistantActions.retryPendingOperation!(item.key))}/>)}{ticket && service.typingByTicket[ticket.id]?.length ? <View style={{ paddingHorizontal:16,paddingVertical:8 }}><HelpTyping users={service.typingByTicket[ticket.id]} /></View> : null}</>} renderMessage={message=>message.assistantRun ? <HelpAssistantMessage message={message} onRetry={assistantPreview ? ()=>assistantPreview.retry(message.ticketId,message.assistantRun!.runId) : assistantActions.retryAssistant?()=>void run(()=>assistantActions.retryAssistant!(message.ticketId,message.assistantRun!.runId)):undefined}/> : <HelpMessageBubble {...messageGroups.get(message.id)} message={message} readByOthers={message.authorId===service.userId && Boolean(ticket?.members.some(member=>member.userId!==service.userId && (member.lastReadSequence??0)>=message.sequence))} searchQuery={chatSearchOpen?chatSearchQuery:undefined} userId={service.userId} open={mode === 'message' && ticket?.status === 'OPEN' && isParticipant} canInteract={isParticipant} selected={selectedMessage === message.id} highlighted={highlighted === message.id} solution={isOwner && ticket?.status === 'OPEN' && message.id === lastIncoming?.id} resolve={service.mediaSource} onDismissMenu={() => setSelectedMessage(null)} onMenu={() => { Keyboard.dismiss(); setSelectedMessage(selectedMessage === message.id ? null : message.id); }} onReply={() => replyTo(message)} onCopy={() => void run(async () => { await Clipboard.setStringAsync(message.text || message.attachments.map(a => a.name).join('\n')); setSelectedMessage(null); tell('Скопировано'); })} onEdit={() => startMode('edit', message)} onForward={() => { Keyboard.dismiss(); setSelectedMessage(null); setOverlay({ kind: 'forward', message }); void service.loadTickets('OPEN', scope); }} onReaction={emoji => {if(isParticipant)void run(() => service.toggleReaction(message, emoji));}} onQuote={jump} onImage={(images, index, origin) => { Keyboard.dismiss(); setGallery({ images, index, origin }); }} onFile={file => void run(() => downloadHelpAttachment(file, service.mediaSource))} onCloseTicket={() => startMode('close')} onRequestIt={() => { Keyboard.dismiss(); setOverlay({ kind: 'it' }); }} onError={tell} />}/>
        </BlurTargetView>
        {chatSearchOpen && chatSearchList ? <View testID="help-chat-search-results-overlay" style={{position:'absolute',top:listHeaderHeight,left:0,right:0,bottom:dockHeight,backgroundColor:c.background,zIndex:1}}><HelpChatSearchResults messages={chatResults} query={chatSearchQuery} selectedId={chatResults[chatResultIndex]?.id} loading={chatSearchLoading} hasMore={chatSearchCursor!==null} onLoadMore={()=>void moreSearch()} onSelect={message=>void showSearchResult(message,chatResults.findIndex(item=>item.id===message.id))} error={chatSearchError}/></View> : null}
        <View testID="help-chat-header-overlay" onLayout={event=>setListHeaderHeight(event.nativeEvent.layout.height)} style={{position:'absolute',top:0,left:0,right:0,zIndex:2}}><View pointerEvents="none" style={StyleSheet.absoluteFill}><HelpBlurSurface target={blurTarget} edge="bottom"/></View>{header}<HelpChatPlayback onJump={jump}/></View>
        {stickyDate ? <View testID="help-sticky-date-overlay" style={{position:'absolute',top:Math.max(0,listHeaderHeight-12),alignSelf:'center',zIndex:3}}><HelpDateSeparator compact date={stickyDate} onPress={()=>scroll.current?.jumpToDate(stickyDate)}/></View> : null}
        {chatSearchOpen && !chatSearchList ? <HelpChatSearchArrows total={chatSearchTotal} selectedIndex={chatResultIndex} loading={chatSearchLoading} canPrevious={chatResultIndex>0} canNext={chatResultIndex+1<chatResults.length || chatSearchCursor!==null} onPrevious={()=>{if(chatResultIndex>0)void showSearchResult(chatResults[chatResultIndex-1],chatResultIndex-1);}} onNext={nextSearch} style={{position:'absolute',right:8,bottom:dockHeight+12}}/> : null}
        <View nativeID={nativeDockId} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>{notice ? <HelpNotice key={notice} text={notice} onDone={() => setNotice('')} /> : null}<HelpDock target={blurTarget} onHeight={setDockHeight}>
          {chatSearchOpen ? <HelpChatSearchDock query={chatSearchQuery} total={chatSearchTotal} selectedIndex={chatResultIndex} loading={chatSearchLoading} showList={chatSearchList} onToggleList={()=>setChatSearchList(value=>!value)} error={chatSearchError}/> : ticket?.status === 'CLOSED' && mode === 'message' ? !isOwner ? <HelpPrimaryButton text="Закрыт" icon="lock-closed-outline" disabled onPress={()=>{}}/> : <View>{canReopenHelpTicket(ticket) ? <HelpPrimaryButton text="Открыть повторно" icon="sync-outline" onPress={()=>startMode('reopen')}/> : <><View style={{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:6,paddingHorizontal:8,paddingBottom:9}}><Ionicons name="lock-closed-outline" size={15} color={c.muted}/><Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Закрыт{ticket.closedAt ? ' · прошло больше 3 дней' : ''}</Text></View><HelpPrimaryButton text="Создать новое обращение" onPress={()=>newTicket({id:ticket.id,number:ticket.number,title:ticket.title})}/></>}</View> : ticket&&!isParticipant ? <HelpPrimaryButton text="Взять обращение" icon="headset-outline" disabled={busy||!service.canManage} onPress={()=>void run(()=>service.claimTicket(ticket.id))}/> : <HelpComposer key={`${service.userId}:${active}:${mode}`} value={draft} onChange={changeDraft} files={files} onFiles={changeFiles} onSend={submit} sendBlocked={Boolean(pendingCreate)} onStopAssistant={activeAssistant?.assistantRun ? ()=>{if(assistantPreview)assistantPreview.stop(activeAssistant.ticketId,activeAssistant.assistantRun!.runId);else void run(()=>assistantActions.stopAssistant!(activeAssistant.ticketId,activeAssistant.assistantRun!.runId));} : undefined} busy={busy} mode={mode} rating={rating} onRating={setRating} onCancelMode={cancelMode} quote={reply ? {name:reply.author?.name||'Сообщение',text:reply.text||'Вложение',thumbnail:reply.attachments.find(item=>item.kind==='IMAGE'),onPress:()=>jump(reply.id)} : undefined} resolve={service.mediaSource} recordingAreaHeight={Math.max(0,chatViewportHeight-listHeaderHeight-dockHeight+8)} onCancelQuote={()=>setReply(null)} error={tell} focusKey={focusKey} onResize={()=>{ composerResizingUntil.current=Date.now()+320; scrollBottom(false); }} disabled={active!=='new'&&!ticket} editClosure={editing?.kind==='CLOSURE'} existingFiles={mode==='edit' ? editAttachments : undefined} onRemoveExisting={id=>setEditAttachments(values=>values.filter(a=>a.id!==id))}/>}
        </HelpDock></View>{hasNativeChatLayout ? <HelpNativeChatLayout key={`${service.userId}:${active}`} scrollId={nativeScrollId} dockId={nativeDockId} allowFollow={nativeFollow && !service.hasNewer} animateTail={entrySettled}/> : null}
      </HelpChatEntry> : null}
    </View>
    {active === null && notice ? <View style={{ position: 'absolute', bottom: 85 + insets.bottom, left: 0, right: 0 }}><HelpNotice key={notice} text={notice} onDone={() => setNotice('')} /></View> : null}
    {gallery ? <HelpGallery attachments={gallery.images} initialIndex={gallery.index} origin={gallery.origin} resolve={service.mediaSource} onClose={() => setGallery(null)} onError={tell} /> : null}
    {overlay ? <HelpSheet scrollOffset={overlay.kind === 'forward' ? sheetOffset : 0} title={overlay.kind === 'it' ? 'Подключить IT?' : overlay.kind === 'forward' ? 'Переслать в обращение' : 'Действия с обращением'} onClose={() => { setOverlay(null); setSheetOffset(0); }}>
      {overlay.kind === 'menu' && assistantPreview ? <HelpAssistantPreviewMenu preview={assistantPreview} ticketId={ticket?.id} onClose={() => setOverlay(null)}/> : null}
      {overlay.kind === 'it' && ticket ? <><Text style={{color:c.muted,fontSize:14,lineHeight:21,marginBottom:18}}>Специалисты увидят всю переписку и вложения.</Text><HelpPrimaryButton variant="sheet" text="Подключить IT" icon="headset-outline" disabled={busy} onPress={() => void run(async () => { await service.requestIt(ticket.id); setOverlay(null); })} /></> : null}
      {overlay.kind === 'menu' && ticket ? <View style={{ gap: 10 }}>{ticket.status === 'OPEN' && isOwner ? <><SheetAction label="Закрыть обращение" icon="checkmark-circle-outline" onPress={() => startMode('close')} /><SheetAction label="Подключить IT" icon="headset-outline" onPress={() => setOverlay({ kind: 'it' })} /></> : <Text style={{ color: c.muted }}>{ticket.status === 'CLOSED' ? 'Обращение закрыто. Доступные действия находятся внизу чата.' : 'Закрыть обращение может его автор.'}</Text>}</View> : null}
      {overlay.kind === 'row' ? <View style={{ gap: 10 }}><SheetAction label="Открыть переписку" icon="chatbubble-outline" onPress={() => void open(overlay.ticket.id)} />{overlay.ticket.status === 'OPEN' && overlay.ticket.ownerId === service.userId ? <SheetAction label="Закрыть обращение" icon="checkmark-circle-outline" onPress={() => void run(async () => { await open(overlay.ticket.id); startMode('close'); })} /> : null}</View> : null}
      {overlay.kind === 'forward' ? <ScrollView style={{ maxHeight: 330 }} scrollEventThrottle={16} onScroll={e => setSheetOffset(Math.max(0, e.nativeEvent.contentOffset.y))}>{service.tickets.filter(t => t.status === 'OPEN' && t.id !== ticket?.id && (t.ownerId === service.userId || t.members.some(m => m.userId === service.userId))).map(destination => <SheetAction key={destination.id} label={`#${destination.number} · ${destination.title}`} icon="arrow-redo-outline" onPress={() => void run(async () => { await service.sendMessage(destination.id, { text: overlay.message.text, forwardedFromId: overlay.message.id }); setOverlay(null); tell('Сообщение переслано'); })} />)}{!service.tickets.some(t => t.status === 'OPEN' && t.id !== ticket?.id && (t.ownerId === service.userId || t.members.some(m => m.userId === service.userId))) ? <Text style={{ color: c.muted, paddingVertical: 12 }}>Нет других открытых обращений для пересылки.</Text> : null}</ScrollView> : null}
    </HelpSheet> : null}
  </KeyboardAvoidingView></HelpPlaybackScope></HelpPhotoPortalProvider></HelpMessageLayoutCacheContext.Provider></HelpImageCacheContext.Provider>;
}

function SheetAction({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const c = useHelpTheme(); const reduced=useHelpReducedMotion(); return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({minHeight:51,paddingVertical:8,borderBottomWidth:1,borderBottomColor:c.line,flexDirection:'row',alignItems:'center',gap:7,opacity:pressed ? .6 : 1,transform:[{scale:pressed&&!reduced ? .96 : 1}]})}><Ionicons name={icon} color={c.accentText} size={22}/><Text style={{color:c.text,flex:1,fontSize:14}}>{label}</Text></Pressable>;
}
type TicketRowProps = { ticket: HelpTicket; typing?: HelpTypingUser[]; draft?:string; onPress: () => void; onMenu: () => void };
function TicketRow(props: TicketRowProps) {
  const latest=useRef(props);latest.current=props;
  const actions=useMemo(()=>({onPress:()=>latest.current.onPress(),onMenu:()=>latest.current.onMenu()}),[]);
  return <MemoTicketRow {...props} {...actions}/>;
}
const MemoTicketRow = React.memo(function TicketRowBody({ ticket, typing, draft, onPress, onMenu }: TicketRowProps) {
  const c=useHelpTheme(); const reduced=useHelpReducedMotion(); const members=ticket.members.filter(m=>m.role==='IT'); const preview=ticket.lastMessage; const closed=ticket.status==='CLOSED';
  return <Pressable testID={`help-ticket-row-${ticket.id}`} {...(Platform.OS==='web' ? {onContextMenu:(event:any)=>{event.preventDefault();onMenu();},onKeyDown:(event:any)=>{if((event.shiftKey&&event.key==='F10')||event.key==='ContextMenu'){event.preventDefault();onMenu();}}} : {})} accessibilityRole="button" accessibilityLabel={`Обращение ${ticket.number}, ${ticket.title}${closed ? ', закрыто' : ''}${ticket.unreadCount ? `, непрочитанных: ${ticket.unreadCount}` : ''}`} onPress={onPress} onLongPress={onMenu} delayLongPress={500} style={({pressed})=>({minHeight:76,paddingHorizontal:HELP_LIST_INSET,paddingVertical:12,gap:12,flexDirection:'row',alignItems:'center',backgroundColor:closed ? c.closedBackground : pressed ? c.soft : 'transparent',transform:[{scale:pressed&&!reduced ? .988 : 1}]})}>
    <View style={{width:52,height:48,justifyContent:'center'}}>
      {members.length>1 ? members.slice(0,2).map((member,index)=><View key={member.userId} style={{position:'absolute',top:index===0 ? 2 : 16,left:index===0 ? 0 : 18,width:34,height:34,borderRadius:17,borderWidth:2,borderColor:c.background,zIndex:index}}><HelpAvatar id={member.userId} name={member.user.name} uri={member.user.avatarUrl} size={30} muted={closed}/></View>) : members.length===1 ? <HelpAvatar id={members[0].userId} name={members[0].user.name} uri={members[0].user.avatarUrl} size={46} muted={closed}/> : helpHasAssistantAvatar(ticket) ? <HelpAssistantAvatar ticketId={ticket.id} size={46} muted={closed}/> : <View style={{width:46,height:46,borderRadius:23,backgroundColor:c.soft,justifyContent:'center',alignItems:'center',opacity:closed ? .7 : 1}}><Ionicons name="headset-outline" size={25} color={closed ? c.muted : c.accentText}/></View>}
      <View style={{position:'absolute',right:-4,top:-7,borderRadius:5,backgroundColor:c.incoming,paddingHorizontal:4,paddingVertical:1,zIndex:5,borderWidth:1,borderColor:c.line}}><Text style={{color:c.text,fontSize:9,lineHeight:13,fontWeight:'600'}}>#{ticket.number}</Text></View>
      {members.length>2 ? <View style={{position:'absolute',bottom:-5,right:-5,minWidth:21,backgroundColor:c.panel,borderRadius:9,paddingHorizontal:3,borderWidth:2,borderColor:c.background,zIndex:5}}><Text style={{color:c.text,fontSize:10,lineHeight:15,fontWeight:'600'}}>+{members.length-2}</Text></View> : null}
    </View>
    <View style={{flex:1,minWidth:0}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:4}}><Text numberOfLines={1} style={{flex:1,color:closed ? c.closedText : c.text,fontSize:15,lineHeight:22,fontWeight:'600'}}>{ticket.title}</Text>{closed ? <Ionicons name="lock-closed-outline" accessibilityLabel="Закрыто" size={15} color={c.muted}/> : null}</View>
      <View style={{marginTop:3,minHeight:20,justifyContent:'center'}}>{typing?.length&&!closed ? <HelpTyping users={typing} compact/> : <Text numberOfLines={1} style={{color:c.muted,fontSize:13,lineHeight:20}}>{draft?.trim() ? <><Text style={{color:c.draftText}}>Черновик: </Text>{draft}</> : preview?.text || (preview?.attachments.length ? preview.attachments[0].kind==='AUDIO' ? 'Голосовое сообщение' : preview.attachments.length>1 ? `Вложения (${preview.attachments.length})` : preview.attachments[0].name : 'Обращение создано')}</Text>}</View>
    </View>
    <View ref={node=>helpDevRef(`list.meta.${ticket.id}`,node)} testID={`help-ticket-meta-${ticket.id}`} style={{width:HELP_LIST_META_WIDTH,alignItems:'center',alignSelf:'center',height:45}}>
      <Text style={{color:c.muted,fontSize:11,lineHeight:22,fontVariant:['tabular-nums'],textAlign:'center'}}>{helpTime(preview?.createdAt||ticket.createdAt)}</Text>
      {ticket.unreadCount>0 ? <View ref={node=>helpDevRef(`list.unread.${ticket.id}`,node)} testID={`help-ticket-unread-${ticket.id}`} style={{marginTop:3,backgroundColor:c.accentText,borderRadius:12,minWidth:20,height:20,paddingHorizontal:5,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#FFF',fontSize:11,fontWeight:'600'}}>{ticket.unreadCount}</Text></View> : null}
    </View>
  </Pressable>;
});
