import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect, useIsFocused } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { BlurTargetView } from 'expo-blur';
import { useHelpService } from './useHelpService';
import type { HelpAttachment, HelpMessage, HelpTicket } from './helpApi';
import { useHelpTheme } from './helpTheme';
import { canEditHelpMessage, canReopenHelpTicket, helpCreated, helpDate, helpTime, stableHelpOrder } from './helpUiUtils';
import { HelpAvatar, HelpDock, HelpIcon, HelpNotice, HelpPrimaryButton, HelpSheet, HelpTyping } from './components/HelpPrimitives';
import { HelpComposer, type HelpComposeMode, type HelpLocalFile } from './components/HelpComposer';
import { HelpMessageBubble } from './components/HelpMessageBubble';
import { downloadHelpAttachment, HelpGallery, type HelpImageOrigin } from './components/HelpMedia';

type SourceTicket = { id: number; number: number; title: string };
type Overlay = { kind: 'menu' | 'it' | 'read-all' } | { kind: 'row'; ticket: HelpTicket } | { kind: 'forward'; message: HelpMessage };
type ReturnContext = { active: number | 'new'; filter: 'OPEN' | 'CLOSED'; source: SourceTicket | null; draft: string; files: HelpLocalFile[]; mode: HelpComposeMode; reply: HelpMessage | null; edit: HelpMessage | null; editAttachments: HelpAttachment[]; rating: number };

export default function HelpScreen() {
  const isFocused = useIsFocused();
  const service = useHelpService(isFocused); const c = useHelpTheme(); const insets = useSafeAreaInsets(); const router = useRouter(); const params = useLocalSearchParams<{ ticketId?: string }>();
  const currentAccount = useRef(service.userId); currentAccount.current = service.userId;
  const draftRevisions = useRef(new Map<string,number>());
  const [active, setActive] = useState<number | 'new' | null>(null); const [filter, setFilter] = useState<'OPEN' | 'CLOSED'>('OPEN'); const [scope, setScope] = useState<'mine' | 'queue'>('mine');
  const [search, setSearch] = useState(''); const [order, setOrder] = useState<number[]>([]); const [draft, setDraft] = useState(''); const [files, setFiles] = useState<HelpLocalFile[]>([]); const [source, setSource] = useState<SourceTicket | null>(null);
  const [mode, setMode] = useState<HelpComposeMode>('message'); const [rating, setRating] = useState(0); const [reply, setReply] = useState<HelpMessage | null>(null); const [editing, setEditing] = useState<HelpMessage | null>(null); const [editAttachments, setEditAttachments] = useState<HelpAttachment[]>([]); const [focusKey, setFocusKey] = useState(0); const [pendingJump, setPendingJump] = useState<number | null>(null); const jumpAttempt = useRef<number | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null); const [selectedMessage, setSelectedMessage] = useState<number | null>(null); const [notice, setNotice] = useState(''); const [gallery, setGallery] = useState<{ images: HelpAttachment[]; index: number; origin?:HelpImageOrigin } | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null); const [dockHeight, setDockHeight] = useState(64); const [sending, setSending] = useState(false); const [currentDate, setCurrentDate] = useState(''); const [sheetOffset, setSheetOffset] = useState(0);
  const scroll = useRef<ScrollView>(null); const followBottom = useRef(true); const positions = useRef(new Map<number, { y: number; date: string }>()); const stack = useRef<ReturnContext[]>([]); const regularDraft = useRef({ text: '', files: [] as HelpLocalFile[], reply: null as HelpMessage | null });
  const draftGeneration = useRef(0); const navigationGeneration = useRef(0); const draftLoaded = useRef(false); const fileDrafts = useRef(new Map<string,HelpLocalFile[]>()); const restoredDraft = useRef<{key: string; text: string} | null>(null); const uploadCache = useRef(new Map<string, HelpAttachment>()); const submitLock = useRef(false); const typingAt = useRef(0); const deepLink = useRef<string | undefined>(undefined); const blurTarget = useRef<View>(null);
  const ticket = active && active !== 'new' && service.selectedTicket?.id === active ? service.selectedTicket : null;
  const isOwner = ticket?.ownerId === service.userId;
  const isParticipant = Boolean(isOwner || ticket?.members.some(member => member.userId === service.userId));
  const messages = ticket ? service.messages : []; const busy = sending || service.busy; const draftKey = active === 'new' ? `new:${source?.id ?? 'plain'}` : `ticket:${active}`;
  const tell = useCallback((message: string) => setNotice(message), []);
  const run = async (work: () => Promise<unknown>) => { try { await work(); } catch (e) { tell(e instanceof Error ? e.message : 'Не удалось выполнить действие.'); } };
  const scrollBottom = (animated = true) => { if (followBottom.current) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated })); };
  useEffect(() => { ++draftGeneration.current; draftLoaded.current = false; restoredDraft.current = null; setActive(null); setDraft(''); setFiles([]); setSource(null); setMode('message'); setReply(null); setEditing(null); setEditAttachments([]); setGallery(null); setOverlay(null); setNotice(''); setSelectedMessage(null); setPendingJump(null); setOrder([]); setFilter('OPEN'); setScope('mine'); setSending(false); submitLock.current=false; stack.current = []; uploadCache.current.clear(); fileDrafts.current.clear(); regularDraft.current = {text:'',files:[],reply:null}; deepLink.current = undefined; }, [service.userId]);
  useEffect(() => { if (!active) return; const generation = ++draftGeneration.current; setFiles(fileDrafts.current.get(draftKey)??[]); if (restoredDraft.current?.key === draftKey) { setDraft(restoredDraft.current.text); restoredDraft.current = null; draftLoaded.current = true; return; } draftLoaded.current = false; setDraft(''); void service.getDraft(draftKey).then(value => { if (generation === draftGeneration.current) { setDraft(value); draftLoaded.current = true; } }).catch(() => { if (generation === draftGeneration.current) draftLoaded.current = true; }); return () => { ++draftGeneration.current; }; }, [draftKey, service.userId]);
  useEffect(() => { if (!active || mode !== 'message' || !draftLoaded.current) return; const timer = setTimeout(() => { void service.setDraft(draftKey, draft); }, 250); return () => clearTimeout(timer); }, [draft, active, mode, draftKey, service.setDraft]);
  useEffect(() => { if (active) scrollBottom(); }, [messages.length, dockHeight]);
  useEffect(() => { if (active === null && service.tickets.length && !order.length) setOrder(stableHelpOrder(service.tickets, []).map(t => t.id)); }, [service.tickets, active, order.length]);
  useEffect(() => {const timer=setTimeout(()=>{setOrder([]);void service.loadTickets(filter,scope,false,search.trim());},250);return()=>clearTimeout(timer);},[search,filter,scope,service.loadTickets]);
  useEffect(() => { const id = Number(params.ticketId); if (service.userId && params.ticketId && deepLink.current !== params.ticketId && Number.isSafeInteger(id) && id > 0) { deepLink.current = params.ticketId; void open(id); } }, [params.ticketId, service.userId]);
  useEffect(() => {
    if (!pendingJump) return;
    if (messages.some(message => message.id === pendingJump)) { const frame = requestAnimationFrame(() => { const pos = positions.current.get(pendingJump); if (pos) { followBottom.current = false; scroll.current?.scrollTo({y:Math.max(0,pos.y-40),animated:true}); setHighlighted(pendingJump); setTimeout(() => setHighlighted(null),1600); } setPendingJump(null); }); return () => cancelAnimationFrame(frame); }
    const oldest = messages[0]?.sequence;
    if (!oldest || oldest <= 1 || jumpAttempt.current === oldest) { tell('Исходное сообщение недоступно.'); setPendingJump(null); return; }
    jumpAttempt.current = oldest;
    void service.loadOlder().catch(() => { tell('Не удалось загрузить исходное сообщение.'); setPendingJump(null); });
  }, [pendingJump, messages, service.loadOlder, tell]);
  useFocusEffect(useCallback(() => { return () => { if (typeof active === 'number') service.emitTyping(active, false); }; }, [active, service.emitTyping]));

  async function open(id: number) {
    ++navigationGeneration.current; Keyboard.dismiss(); setOverlay(null); setSelectedMessage(null); setMode('message'); setReply(null); setEditing(null); setFiles([]); setSource(null); setActive(id); followBottom.current = true; positions.current.clear();
    try { await service.openTicket(id); } catch (e) { tell(e instanceof Error ? e.message : 'Не удалось открыть обращение'); }
  }
  function saveDraftNow() { if (active && mode === 'message') { fileDrafts.current.set(draftKey,files); void service.setDraft(draftKey, draft); } }
  function list(next: 'OPEN' | 'CLOSED' = filter) { ++navigationGeneration.current; saveDraftNow(); Keyboard.dismiss(); setActive(null); service.clearSelection(); setMode('message'); setFiles([]); setReply(null); setEditing(null); setSource(null); setOrder([]); setFilter(next); stack.current = []; void service.loadTickets(next, scope,false,search.trim()); }
  function newTicket(linked: SourceTicket | null = null) { ++navigationGeneration.current; saveDraftNow(); Keyboard.dismiss(); stack.current = []; service.clearSelection(); setActive('new'); setSource(linked); setDraft(''); setFiles([]); setMode('message'); setReply(null); setEditing(null); setSelectedMessage(null); followBottom.current = true; setFocusKey(n => n + 1); }
  function cancelMode() { ++navigationGeneration.current; setMode('message'); setDraft(regularDraft.current.text); setFiles(regularDraft.current.files); setReply(regularDraft.current.reply); setEditing(null); Keyboard.dismiss(); }
  async function back() {
    if (gallery) { setGallery(null); return; } if (overlay) { setOverlay(null); return; } if (selectedMessage !== null) { setSelectedMessage(null); return; }
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
  function jump(id: number) { followBottom.current = false; jumpAttempt.current = null; setPendingJump(id); }
  async function submit(voice?: HelpLocalFile) {
    const account = service.userId;
    const navigation = navigationGeneration.current;
    const draftRevision = draftRevisions.current.get(draftKey)??0;
    if (submitLock.current || !active) return;
    if (mode === 'reopen' && !draft.trim()) { tell('Напишите, что случилось снова.'); return; }
    if (mode === 'message' && !draft.trim() && !files.length && !voice) return;
    if (mode === 'edit' && editing && !canEditHelpMessage(editing, service.userId)) { tell('Редактировать сообщение можно только в течение часа.'); return; }
    submitLock.current = true; setSending(true);
    try {
      const selectedFiles = voice ? [voice] : files;
      const uploads: HelpAttachment[] = [];
      for (const file of selectedFiles) { let upload = uploadCache.current.get(file.uri); if (!upload) { [upload] = await service.uploadAttachments([file]); if(currentAccount.current!==account) return; uploadCache.current.set(file.uri, upload); } uploads.push(upload); }
      if(currentAccount.current!==account) return;
      const text = voice ? '' : draft.trim(); let detail;
      if (mode === 'edit' && editing) detail = await service.editMessage(editing.id, { text, ...(editing.kind === 'CLOSURE' ? { rating } : {}), attachmentIds: [...editAttachments.map(a => a.id), ...uploads.map(a => a.id)] });
      else if (mode === 'close' && ticket) detail = await service.closeTicket(ticket.id, { text, rating, attachmentIds: uploads.map(a => a.id) });
      else if (mode === 'reopen' && ticket) { if (!canReopenHelpTicket(ticket)) throw new Error('Прошло больше 3 дней. Создайте новое обращение.'); detail = await service.reopenTicket(ticket.id, { text, attachmentIds: uploads.map(a => a.id) }); }
      else if (active === 'new') detail = await service.createTicket({ text, attachmentIds: uploads.map(a => a.id), sourceTicketId: source?.id });
      else detail = await service.sendMessage(active, { text, attachmentIds: uploads.map(a => a.id), replyToId: reply?.id });
      if (!detail || currentAccount.current!==account) return;
      if(navigationGeneration.current!==navigation) { if(mode==='message'&&!voice&&(draftRevisions.current.get(draftKey)??0)===draftRevision){await service.setDraft(draftKey,'');if((draftRevisions.current.get(draftKey)??0)===draftRevision)fileDrafts.current.delete(draftKey);} return; }
      if (mode === 'message' && !voice) { await service.setDraft(draftKey, ''); fileDrafts.current.delete(draftKey); if(currentAccount.current!==account||navigationGeneration.current!==navigation)return; setDraft(''); setFiles([]); setReply(null); }
      if (mode === 'message' && voice) setReply(null);
      if (active === 'new') { restoredDraft.current = {key:`ticket:${detail.ticket.id}`,text:voice ? draft : ''}; setActive(detail.ticket.id); setSource(null); await service.setDraft(`ticket:${detail.ticket.id}`, voice ? draft : ''); }
      if(currentAccount.current!==account||navigationGeneration.current!==navigation)return;
      if (mode !== 'message') { setMode('message'); setDraft(regularDraft.current.text); setFiles(regularDraft.current.files); setReply(regularDraft.current.reply); setEditing(null); Keyboard.dismiss(); }
      followBottom.current = true; scrollBottom();
    } catch (e) { if(currentAccount.current!==account)return; if(navigationGeneration.current!==navigation){if(voice){const old=fileDrafts.current.get(draftKey)??[];fileDrafts.current.set(draftKey,old.some(f=>f.uri===voice.uri)?old:[...old,voice]);}return;} if (voice) setFiles(previous => previous.some(f => f.uri === voice.uri) ? previous : [...previous, voice]); tell(e instanceof Error ? e.message : 'Сообщение не отправлено. Черновик сохранён.'); }
    finally { if(currentAccount.current===account){submitLock.current = false; setSending(false);} }
  }
  function changeDraft(text: string) { if(mode==='message')draftRevisions.current.set(draftKey,(draftRevisions.current.get(draftKey)??0)+1); draftLoaded.current = true; ++draftGeneration.current; setDraft(text); if (typeof active === 'number' && Date.now() - typingAt.current > 1800) { typingAt.current = Date.now(); service.emitTyping(active, Boolean(text.trim())); } }
  function changeFiles(value: HelpLocalFile[]) { if(mode==='message')draftRevisions.current.set(draftKey,(draftRevisions.current.get(draftKey)??0)+1); setFiles(value); }
  const lastIncoming = [...messages].reverse().find(m => m.authorRole === 'IT' && m.kind === 'TEXT');
  const groups = useMemo(() => { const result: { date: string; items: HelpMessage[] }[] = []; for (const message of messages) { const date = helpDate(message.createdAt); const group = result.at(-1); if (group?.date === date) group.items.push(message); else result.push({ date, items: [message] }); } return result; }, [messages]);
  const header = <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line, gap: 10 }}><HelpIcon name="arrow-back" label="Назад" onPress={() => void back()} color={c.text} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{active ? ticket?.title || (active === 'new' ? 'Новое обращение' : 'Обращение') : filter === 'CLOSED' ? 'Закрытые обращения' : 'Мои обращения'}</Text>{ticket ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}><Ionicons accessibilityLabel={ticket.status === 'CLOSED' ? 'Закрыто' : 'Открыто'} name={ticket.status === 'CLOSED' ? 'lock-closed-outline' : 'chatbubble-ellipses-outline'} color={c.accentText} size={15} /><Text style={{ color: c.muted, fontSize: 10 }}>#{ticket.number} · {helpCreated(ticket.createdAt)}</Text></View> : null}</View>{active === null ? <><HelpIcon name="checkmark-done-outline" label="Прочитать все сообщения" onPress={() => setOverlay({ kind: 'read-all' })} /><HelpIcon name="archive-outline" label={filter === 'CLOSED' ? 'Открытые обращения' : 'Закрытые обращения'} active={filter === 'CLOSED'} onPress={() => list(filter === 'OPEN' ? 'CLOSED' : 'OPEN')} /></> : ticket ? <HelpIcon name="ellipsis-horizontal" label="Действия с обращением" onPress={() => { Keyboard.dismiss(); setOverlay({ kind: 'menu' }); }} /> : null}</View>;

  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center' }}>{header}
      {!service.online ? <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', padding: 7 }}>Нет соединения. Черновик сохраняется на устройстве.</Text> : null}
      {service.pendingCount > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Восстановить отправку" disabled={busy} onPress={() => void run(() => service.retryPending())} style={{padding:10,backgroundColor:c.elevated}}><Text style={{color:c.accentText,fontSize:13,textAlign:'center'}}>Восстановить отправку ({service.pendingCount})</Text></Pressable> : null}
      {service.error ? <Pressable accessibilityRole="button" onPress={() => void run(() => service.retryPending())} style={{ paddingVertical: 7, paddingHorizontal: 14, backgroundColor: c.danger + '15' }}><Text style={{ color: c.danger, fontSize: 12 }} numberOfLines={2}>{service.error} · Повторить</Text></Pressable> : null}
      {active === null ? <View style={{ flex: 1 }}><View style={{ marginHorizontal: 14, marginTop: 12, marginBottom: 8, borderRadius: 19, backgroundColor: c.surface, height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}><Ionicons name="search-outline" size={20} color={c.muted} /><TextInput accessibilityLabel="Поиск обращений" value={search} onChangeText={setSearch} placeholder="Поиск" placeholderTextColor={c.muted} style={{ flex: 1, paddingLeft: 10, color: c.text, fontSize: 15, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />{search ? <HelpIcon name="close" label="Очистить поиск" size={17} style={{ width: 26 }} onPress={() => setSearch('')} /> : null}</View>
        {service.canManage ? <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 8 }}>{(['mine', 'queue'] as const).map(item => <Pressable key={item} accessibilityRole="button" onPress={() => { setScope(item); setOrder([]); void service.loadTickets(filter, item); }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: scope === item ? c.outgoing : c.surface }}><Text style={{ color: scope === item ? c.accentText : c.muted, fontSize: 12 }}>{item === 'mine' ? 'Мои обращения' : 'Очередь IT'}</Text></Pressable>)}</View> : null}
        <BlurTargetView ref={blurTarget} style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }} onScroll={e => { const s = e.nativeEvent; if (service.hasMore && !service.loading && s.contentOffset.y + s.layoutMeasurement.height > s.contentSize.height - 200) void service.loadTickets(filter, scope, true,search.trim()); }} scrollEventThrottle={160}>
          {!visible.length ? <View style={{ alignItems: 'center', padding: 35, gap: 10 }}>{service.loading ? <ActivityIndicator color={c.accent} /> : <><Ionicons name={filter === 'CLOSED' ? 'archive-outline' : 'chatbubbles-outline'} color={c.muted} size={38} /><Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{search ? 'Ничего не найдено' : filter === 'CLOSED' ? 'Закрытых обращений пока нет' : 'Расскажите, чем помочь'}</Text><Text style={{ color: c.muted, textAlign: 'center', fontSize: 13 }}>{search ? 'Попробуйте другой запрос' : 'Ваши сообщения и вложения увидят специалисты IT.'}</Text></>}</View> : null}
          {visible.map(item => <TicketRow key={item.id} ticket={item} typing={service.typingByTicket[item.id]?.map(p => p.name).join(', ')} onPress={() => { saveDraftNow(); void open(item.id); }} onMenu={() => { Keyboard.dismiss(); setOverlay({ kind: 'row', ticket: item }); }} />)}
          {service.loading && visible.length ? <ActivityIndicator color={c.accent} style={{ margin: 15 }} /> : null}
        </ScrollView></BlurTargetView><View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}><HelpDock target={blurTarget}><HelpPrimaryButton text="Новое обращение" onPress={() => newTicket()} /></HelpDock></View>
      </View> : <View style={{ flex: 1 }}>
        {currentDate && messages.length ? <View pointerEvents="none" style={{ position: 'absolute', top: 6, alignSelf: 'center', zIndex: 4, borderRadius: 12, backgroundColor: c.elevated, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: c.text, fontSize: 11 }}>{currentDate}</Text></View> : null}
        <BlurTargetView ref={blurTarget} style={{ flex: 1 }}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" scrollEventThrottle={16} contentContainerStyle={{ paddingTop: 12, paddingBottom: dockHeight + 12 }} onContentSizeChange={() => scrollBottom()} onScroll={e => { const s = e.nativeEvent; followBottom.current = s.contentSize.height - s.contentOffset.y - s.layoutMeasurement.height < 65; const nearest = [...positions.current.values()].filter(p => p.y <= s.contentOffset.y + 60).at(-1); setCurrentDate(nearest?.date ?? ''); }}>
          {sourceLink ? <Pressable accessibilityRole="button" onPress={() => void openSource()} style={{ margin: 12, borderRadius: 14, padding: 10, backgroundColor: c.surface, flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name="return-up-back" size={22} color={c.accentText} /><View style={{ flex: 1 }}><Text style={{ color: c.accentText, fontSize: 12 }}>По обращению #{sourceLink.number}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{sourceLink.title}</Text></View><Ionicons name="chevron-forward" color={c.muted} size={17} /></Pressable> : null}
          {service.loading && !messages.length ? <ActivityIndicator color={c.accent} style={{ margin: 25 }} /> : null}
          {active === 'new' ? <Text style={{ color: c.muted, textAlign: 'center', fontSize: 13, lineHeight: 19, margin: 30 }}>Опишите, что случилось. Обращение будет создано после первого сообщения.{ '\n' }Пока отвечает только служба IT — ИИ ещё не подключён.</Text> : null}
          {messages.length >= 100 ? <Pressable accessibilityRole="button" onPress={() => void run(service.loadOlder)} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: c.accentText }}>Предыдущие сообщения</Text></Pressable> : null}
          {groups.map(group => <React.Fragment key={group.date}><View style={{ alignItems: 'center', marginVertical: 10 }}><Text style={{ color: c.text, backgroundColor: c.elevated, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 12, fontSize: 11 }}>{group.date}</Text></View>{group.items.map(message => <View key={message.id} onLayout={event => { positions.current.set(message.id, { y: event.nativeEvent.layout.y, date: group.date }); }}><HelpMessageBubble message={message} userId={service.userId} open={mode === 'message' && ticket?.status === 'OPEN' && isParticipant} canInteract={isParticipant} selected={selectedMessage === message.id} highlighted={highlighted === message.id} solution={isOwner && ticket?.status === 'OPEN' && message.id === lastIncoming?.id} resolve={service.mediaSource} onMenu={() => { Keyboard.dismiss(); setSelectedMessage(selectedMessage === message.id ? null : message.id); }} onReply={() => replyTo(message)} onCopy={() => void run(async () => { await Clipboard.setStringAsync(message.text || message.attachments.map(a => a.name).join('\n')); setSelectedMessage(null); tell('Скопировано'); })} onEdit={() => startMode('edit', message)} onForward={() => { Keyboard.dismiss(); setSelectedMessage(null); setOverlay({ kind: 'forward', message }); void service.loadTickets('OPEN', scope); }} onReaction={emoji => {if(isParticipant)void run(() => service.toggleReaction(message, emoji));}} onQuote={jump} onImage={(images, index, origin) => { Keyboard.dismiss(); setGallery({ images, index, origin }); }} onFile={file => void run(() => downloadHelpAttachment(file, service.mediaSource))} onCloseTicket={() => startMode('close')} onRequestIt={() => { Keyboard.dismiss(); setOverlay({ kind: 'it' }); }} onError={tell} /></View>)}</React.Fragment>)}
          {ticket && service.typingByTicket[ticket.id]?.length ? <View style={{ paddingLeft: 44, paddingVertical: 8 }}><HelpTyping text={`${service.typingByTicket[ticket.id].map(p => p.name).join(', ')} печатает`} /></View> : null}
        </ScrollView></BlurTargetView>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>{notice ? <HelpNotice key={notice} text={notice} onDone={() => setNotice('')} /> : null}<HelpDock target={blurTarget} onHeight={setDockHeight}>
          {ticket?.status === 'CLOSED' && mode === 'message' ? !isOwner ? <HelpPrimaryButton text="Обращение закрыто" icon="lock-closed-outline" disabled onPress={() => {}} /> : <View>{canReopenHelpTicket(ticket) ? <HelpPrimaryButton text="Открыть обращение снова" icon="refresh-outline" onPress={() => startMode('reopen')} /> : <><Text style={{ textAlign: 'center', color: c.muted, fontSize: 12, marginBottom: 8 }}>🔒 Закрыт{ticket.closedAt ? ' · прошло больше 3 дней' : ''}</Text><HelpPrimaryButton text="Создать новое обращение" onPress={() => newTicket({ id: ticket.id, number: ticket.number, title: ticket.title })} /></>}</View> : ticket && !isParticipant ? <HelpPrimaryButton text="Взять обращение" icon="headset-outline" disabled={busy || !service.canManage} onPress={() => void run(() => service.claimTicket(ticket.id))} /> : <HelpComposer key={`${service.userId}:${active}:${mode}`} value={draft} onChange={changeDraft} files={files} onFiles={changeFiles} onSend={submit} busy={busy} mode={mode} rating={rating} onRating={setRating} onCancelMode={cancelMode} quote={reply ? { name: reply.author?.name || 'Сообщение', text: reply.text || 'Вложение', onPress: () => jump(reply.id) } : undefined} onCancelQuote={() => setReply(null)} error={tell} focusKey={focusKey} onResize={() => scrollBottom()} disabled={active !== 'new' && !ticket} editClosure={editing?.kind === 'CLOSURE'} existingFiles={mode === 'edit' ? editAttachments : undefined} onRemoveExisting={id => setEditAttachments(values => values.filter(a => a.id !== id))} />}
        </HelpDock></View>
      </View>}
    </View>
    {active === null && notice ? <View style={{ position: 'absolute', bottom: 85 + insets.bottom, left: 0, right: 0 }}><HelpNotice key={notice} text={notice} onDone={() => setNotice('')} /></View> : null}
    {gallery ? <HelpGallery attachments={gallery.images} initialIndex={gallery.index} origin={gallery.origin} resolve={service.mediaSource} onClose={() => setGallery(null)} onError={tell} /> : null}
    {overlay ? <HelpSheet scrollOffset={overlay.kind === 'forward' ? sheetOffset : 0} title={overlay.kind === 'read-all' ? 'Прочитать все сообщения?' : overlay.kind === 'it' ? 'Подключить IT?' : overlay.kind === 'forward' ? 'Переслать в обращение' : 'Действия с обращением'} onClose={() => { setOverlay(null); setSheetOffset(0); }}>
      {overlay.kind === 'read-all' ? <><Text style={{ color: c.muted, lineHeight: 20, marginBottom: 18 }}>Все непрочитанные сообщения в ваших обращениях будут отмечены прочитанными.</Text><HelpPrimaryButton text="Прочитать все" icon="checkmark-done-outline" onPress={() => void run(async () => { await service.markAllRead(); setOverlay(null); tell('Все сообщения прочитаны'); })} /></> : null}
      {overlay.kind === 'it' && ticket ? <><Text style={{ color: c.muted, lineHeight: 20, marginBottom: 18 }}>Специалисты увидят всю переписку и вложения.</Text><HelpPrimaryButton text="Подключить IT" icon="headset-outline" disabled={busy} onPress={() => void run(async () => { await service.requestIt(ticket.id); setOverlay(null); })} /></> : null}
      {overlay.kind === 'menu' && ticket ? <View style={{ gap: 10 }}>{ticket.status === 'OPEN' && isOwner ? <><SheetAction label="Закрыть обращение" icon="checkmark-circle-outline" onPress={() => startMode('close')} /><SheetAction label="Подключить IT" icon="headset-outline" onPress={() => setOverlay({ kind: 'it' })} /></> : <Text style={{ color: c.muted }}>{ticket.status === 'CLOSED' ? 'Обращение закрыто. Доступные действия находятся внизу чата.' : 'Закрыть обращение может его автор.'}</Text>}</View> : null}
      {overlay.kind === 'row' ? <View style={{ gap: 10 }}><SheetAction label="Открыть переписку" icon="chatbubble-outline" onPress={() => void open(overlay.ticket.id)} />{overlay.ticket.status === 'OPEN' && overlay.ticket.ownerId === service.userId ? <SheetAction label="Закрыть обращение" icon="checkmark-circle-outline" onPress={() => void run(async () => { await open(overlay.ticket.id); startMode('close'); })} /> : null}</View> : null}
      {overlay.kind === 'forward' ? <ScrollView style={{ maxHeight: 330 }} scrollEventThrottle={16} onScroll={e => setSheetOffset(Math.max(0, e.nativeEvent.contentOffset.y))}>{service.tickets.filter(t => t.status === 'OPEN' && t.id !== ticket?.id && (t.ownerId === service.userId || t.members.some(m => m.userId === service.userId))).map(destination => <SheetAction key={destination.id} label={`#${destination.number} · ${destination.title}`} icon="arrow-redo-outline" onPress={() => void run(async () => { await service.sendMessage(destination.id, { text: overlay.message.text, forwardedFromId: overlay.message.id }); setOverlay(null); tell('Сообщение переслано'); })} />)}{!service.tickets.some(t => t.status === 'OPEN' && t.id !== ticket?.id && (t.ownerId === service.userId || t.members.some(m => m.userId === service.userId))) ? <Text style={{ color: c.muted, paddingVertical: 12 }}>Нет других открытых обращений для пересылки.</Text> : null}</ScrollView> : null}
    </HelpSheet> : null}
  </KeyboardAvoidingView>;
}

function SheetAction({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const c = useHelpTheme(); return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? .6 : 1 })}><Ionicons name={icon} color={c.accentText} size={24} /><Text style={{ color: c.text, flex: 1, fontSize: 15 }}>{label}</Text></Pressable>;
}
function TicketRow({ ticket, typing, onPress, onMenu }: { ticket: HelpTicket; typing?: string; onPress: () => void; onMenu: () => void }) {
  const c = useHelpTheme(); const members = ticket.members.filter(m => m.role === 'IT'); const preview = ticket.lastMessage;
  return <Pressable {...(Platform.OS === 'web' ? { onContextMenu: (event: any) => { event.preventDefault(); onMenu(); } } : {})} accessibilityRole="button" accessibilityLabel={`Обращение ${ticket.number}, ${ticket.title}${ticket.status === 'CLOSED' ? ', закрыто' : ''}${ticket.unreadCount ? `, непрочитанных: ${ticket.unreadCount}` : ''}`} onPress={onPress} onLongPress={onMenu} delayLongPress={500} style={({ pressed }) => ({ minHeight: 78, paddingHorizontal: 14, paddingVertical: 13, gap: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? c.elevated : 'transparent', transform: [{ scale: pressed ? .993 : 1 }] })}>
    <View style={{ width: 52, height: 50 }}>{members.length ? members.slice(0, 2).map((member, index) => <View key={member.userId} style={{ position: 'absolute', top: index * 12, left: index * 15, borderRadius: 24, borderWidth: 2, borderColor: c.background, zIndex: index }}><HelpAvatar id={member.userId} name={member.user.name} uri={member.user.avatarUrl} size={members.length > 1 ? 35 : 46} /></View>) : <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.elevated, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="headset-outline" size={25} color={c.accentText} /></View>}<View style={{ position: 'absolute', right: -3, top: -7, borderRadius: 5, backgroundColor: c.surface, paddingHorizontal: 4, paddingVertical: 2, zIndex: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}><Text style={{ color: c.text, fontSize: 9 }}>#{ticket.number}</Text></View>{members.length > 2 ? <View style={{ position: 'absolute', bottom: -3, right: -5, backgroundColor: c.elevated, borderRadius: 8, paddingHorizontal: 4, zIndex: 5 }}><Text style={{ color: c.text, fontSize: 10 }}>+{members.length - 2}</Text></View> : null}</View>
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 15, fontWeight: '600' }}>{ticket.title}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{helpDate(ticket.updatedAt) === 'Сегодня' ? helpTime(ticket.updatedAt) : new Date(ticket.updatedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</Text>{ticket.status === 'CLOSED' ? <Ionicons name="lock-closed" accessibilityLabel="Закрыто" size={12} color={c.muted} /> : null}</View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ flex: 1 }}>{typing ? <HelpTyping text={`${typing} печатает`} /> : <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>{preview?.text || (preview?.attachments.length ? preview.attachments[0].kind === 'AUDIO' ? 'Голосовое сообщение' : preview.attachments.length > 1 ? `Вложения (${preview.attachments.length})` : preview.attachments[0].name : 'Обращение создано')}</Text>}</View>{ticket.unreadCount > 0 ? <View style={{ backgroundColor: c.accent, borderRadius: 12, minWidth: 21, height: 21, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{ticket.unreadCount}</Text></View> : null}</View></View>
  </Pressable>;
}
