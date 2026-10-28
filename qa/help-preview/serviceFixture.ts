/** Metro alias applies ONLY to HelpScreen inside this standalone QA project. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { HelpLocalFile } from '../../src/features/help/components/HelpComposer';
import { helpDevActions, helpDevState } from '../../src/features/help/helpDiagnostics';
import type { HelpAttachment, HelpDetail, HelpMessage, HelpMessageInput, HelpTicket } from '../../src/features/help/helpApi';
import type { HelpNavigationTarget, HelpViewportAnchor } from '../../src/features/help/helpHistoryTypes';
import { fixtures, message, OWNER, IT, resolve } from './HelpPreview';
import { createFixtureHistory, findFixtureDateMessage, fixtureHistoryPage, searchFixtureHistory } from './historyFixture';
import { trimHelpWindow } from '../../src/features/help/helpHistoryModel';
import { createFixtureAlbum } from './albumFixture';

let fixtureUploadSequence = 0;
/** Simulate server ownership locally: sent media must outlive draft cleanup. */
export async function uploadFixtureAttachment(file: HelpLocalFile): Promise<HelpAttachment> {
  const id = `local-${Date.now()}-${++fixtureUploadSequence}`;
  let url = file.uri;
  if (Platform.OS !== 'web') {
    if (!FileSystem.cacheDirectory) throw new Error('QA media cache is unavailable');
    const directory = `${FileSystem.cacheDirectory}help-qa-uploads/`;
    const extension = file.name.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase() ?? 'bin';
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    url = `${directory}${id}.${extension}`;
    await FileSystem.copyAsync({ from: file.uri, to: url });
  }
  return { id, name: file.name, mimeType: file.mimeType || 'application/octet-stream', kind: file.mimeType?.startsWith('image/') ? 'IMAGE' : file.mimeType?.startsWith('audio/') ? 'AUDIO' : 'FILE', size: file.size ?? 0, url, width: file.width, height: file.height };
}

export function useHelpService() {
  const [all, setAll] = useState<HelpTicket[]>(() => [
    { id: 1042, number: 1042, title: 'Не открывается заказ', status: 'OPEN', ownerId: OWNER.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), closedAt: null, sourceTicketId: null, sourceTicket: null, itRequested: true, members: [{ userId: IT.id, role: 'IT', user: IT }], unreadCount: 3, lastMessage: fixtures[7], canReopen: false, aiEnabled: false },
    ...[1041, 1040, 1039, 1038, 1037, 1036].map((id, i): HelpTicket => ({ id, number: id, title: ['Не печатает принтер', 'Ошибка при входе в 1С', 'Как выгрузить отчёт в Excel', 'Проверить обмен', 'Заказ не найден', 'Старая заявка'][i], status: i > 3 ? 'CLOSED' : 'OPEN', ownerId: OWNER.id, createdAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(), updatedAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(), closedAt: i > 3 ? new Date(Date.now() - (i === 4 ? 1 : 5) * 86400000).toISOString() : null, sourceTicketId: null, sourceTicket: null, itRequested: i % 2 === 0, members: i % 2 === 0 ? [{ userId: IT.id, role: 'IT', user: IT }, { userId: 203, role: 'IT', user: { id: 203, name: 'Алексей · IT', avatarUrl: null } }] : [], unreadCount: i % 3, lastMessage: message(20 + i, i > 3 ? 'Обращение завершено' : 'Проверяю, скоро вернусь с ответом'), canReopen: i === 4, aiEnabled: false })),
  ]);
  const [selection, setSelection] = useState<number | null>(null), [messages, setMessages] = useState(fixtures), [query, setQuery] = useState('');
  const [canManage, setCanManage] = useState(false), [extraRows, setExtraRows] = useState(0), [online, setOnline] = useState(true);
  const [hasOlder, setHasOlder] = useState(false), [hasNewer, setHasNewer] = useState(false), [loadingOlder, setLoadingOlder] = useState(false), [loadingNewer, setLoadingNewer] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<HelpNavigationTarget | null>(null), [firstUnreadSequence, setFirstUnreadSequence] = useState<number | null>(null), [lastReadSequence, setLastReadSequence] = useState(0), [error, setError] = useState<string | null>(null);
  const allRef = useRef(all), selectionRef = useRef(selection), visible = useRef(messages), onlineRef = useRef(online);
  allRef.current = all; selectionRef.current = selection; visible.current = messages; onlineRef.current = online;
  const histories = useRef(new Map<number, HelpMessage[]>()), anchors = useRef(new Map<number, HelpViewportAnchor>()), readCursors = useRef(new Map<number, number>()), offlineTails = useRef(new Map<number, number>());
  const historySize = useRef(0), navKey = useRef(0), latency = useRef(80), epoch = useRef(0), loadingPage = useRef(false);
  const pendingTrim = useRef<'older' | 'newer' | null>(null);
  const mediaLatency = useRef(0), mediaResolves = useRef(0), mediaCompleted = useRef(0);
  const resolveFixtureMedia = useCallback(async (attachment: HelpAttachment) => {
    if (attachment.id.startsWith('qa-voice-')) return resolve({ ...attachment, id: 'qa-voice' });
    if (attachment.id.startsWith('qa-album-')) {
      helpDevState({ fixtureMediaStarted: ++mediaResolves.current, fixtureMediaCompleted: mediaCompleted.current });
      if (mediaLatency.current) await new Promise(done => setTimeout(done, mediaLatency.current));
      const source = await resolve(attachment);
      helpDevState({ fixtureMediaCompleted: ++mediaCompleted.current });
      return { ...source, cacheKey: attachment.id };
    }
    return resolve(attachment);
  }, []);
  const drafts = useRef(new Map<string, string>()), uploaded = useRef(new Map<string, HelpAttachment>());
  const commitTickets = (update: (tickets: HelpTicket[]) => HelpTicket[]) => { const next = update(allRef.current); allRef.current = next; setAll(next); };
  const historyFor = (id: number) => {
    let history = histories.current.get(id);
    if (!history) {
      history = historySize.current ? createFixtureHistory(id, historySize.current, fixtures[0], OWNER, IT) : fixtures.map(item => ({ ...item, ticketId: id }));
      histories.current.set(id, history);
      if (!readCursors.current.has(id)) readCursors.current.set(id, history.at(-1)?.sequence ?? 0);
    }
    return history;
  };
  const unreadFor = (id: number) => historyFor(id).filter(item => item.sequence > (readCursors.current.get(id) ?? 0) && item.authorId !== OWNER.id);
  const updateTicket = (id: number) => {
    const lastMessage = historyFor(id).at(-1) ?? null;
    commitTickets(tickets => tickets.map(ticket => ticket.id === id ? { ...ticket, lastMessage, unreadCount: unreadFor(id).length, updatedAt: lastMessage?.createdAt ?? ticket.updatedAt } : ticket));
  };
  const publishWindow = (id: number, next: HelpMessage[], direction: 'older' | 'newer' = 'newer') => {
    if (selectionRef.current !== id) return;
    const history = historyFor(id);
    visible.current = next; setMessages(next);
    pendingTrim.current = next.length > 600 ? direction : null;
    setHasOlder(Boolean(next.length && history[0]?.sequence < next[0].sequence));
    setHasNewer(Boolean(next.length && history.at(-1)!.sequence > next.at(-1)!.sequence));
    setLastReadSequence(readCursors.current.get(id) ?? 0);
    helpDevState({ fixtureHistoryCount: history.length, fixtureWindowCount: next.length, fixtureWindowFirst: next[0]?.sequence ?? 0, fixtureWindowLast: next.at(-1)?.sequence ?? 0, fixtureOnline: onlineRef.current });
  };
  const navigate = (target: Omit<HelpNavigationTarget, 'key'>) => setNavigationTarget({ ...target, key: ++navKey.current });
  const selectedTicket = all.find(ticket => ticket.id === selection) || null;
  const loadTickets = useCallback(async (_status?: string, _scope?: string, _append?: boolean, search = '') => { setQuery(search); }, []);
  const openTicket = async (id: number, explicit?: { messageId?: number; sequence?: number }): Promise<HelpDetail> => {
    const ticket = allRef.current.find(item => item.id === id);
    if (!ticket) throw new Error('QA fixture missing');
    ++epoch.current; selectionRef.current = id; setSelection(id); setError(null);
    const history = historyFor(id), anchor = anchors.current.get(id), firstUnread = unreadFor(id)[0]?.sequence ?? null;
    let target: Omit<HelpNavigationTarget, 'key'>;
    if (explicit?.messageId || explicit?.sequence) target = { kind: 'message', ...explicit, animate: false };
    else if (anchor && !anchor.atLatest) target = { kind: 'anchor', ...anchor, animate: false };
    else if (firstUnread) target = { kind: 'unread', sequence: firstUnread, animate: false };
    else target = { kind: 'latest', animate: false };
    const page = fixtureHistoryPage(history, target.kind === 'latest' ? {} : { around: target.sequence, aroundMessageId: target.messageId });
    setFirstUnreadSequence(firstUnread); publishWindow(id, page.messages); updateTicket(id); navigate(target);
    return { ticket: allRef.current.find(item => item.id === id)!, messages: page.messages };
  };
  const clearSelection = useCallback(() => { ++epoch.current; selectionRef.current = null; setSelection(null); setNavigationTarget(null); }, []);
  const getDraft = useCallback(async (key: string) => drafts.current.get(key) || '', []);
  const setDraft = useCallback(async (key: string, text: string) => { drafts.current.set(key, text); }, []);
  const saveViewport = async (anchor: HelpViewportAnchor, ticketId?: number, options?:{deferTrim?:boolean}) => {
    const id = ticketId ?? selectionRef.current;
    if (id !== null && Number.isFinite(anchor.offset)) {
      anchors.current.set(id, { ...anchor });
      if (id === selectionRef.current) {
        const trimmed = pendingTrim.current && !options?.deferTrim ? trimHelpWindow(visible.current, anchor, pendingTrim.current) : null;
        if (trimmed) {
          publishWindow(id, trimmed.messages);
          navigate(anchor.atLatest && trimmed.messages.at(-1)?.sequence === historyFor(id).at(-1)?.sequence
            ? { kind: 'latest', animate: false }
            : { kind: 'anchor', messageId: anchor.messageId, sequence: anchor.sequence, offset: anchor.offset, animate: false });
        }
        helpDevState({ fixtureAnchorSequence: anchor.sequence, fixtureAnchorOffset: anchor.offset, fixtureAnchorLatest: anchor.atLatest });
      }
    }
  };
  const markVisibleRead = async (sequence: number) => {
    const id = selectionRef.current;
    if (id === null || !onlineRef.current) return;
    if (sequence <= (readCursors.current.get(id) ?? 0)) return;
    readCursors.current.set(id, Math.max(readCursors.current.get(id) ?? 0, Math.min(sequence, historyFor(id).at(-1)?.sequence ?? 0)));
    setLastReadSequence(readCursors.current.get(id)!); updateTicket(id);
  };
  const loadPage = async (direction: 'older' | 'newer') => {
    const id = selectionRef.current, generation = epoch.current;
    if (id === null || loadingPage.current || !visible.current.length) return;
    if (!onlineRef.current) { setError('Нет подключения'); return; }
    loadingPage.current = true; (direction === 'older' ? setLoadingOlder : setLoadingNewer)(true);
    try {
      await new Promise(resolve => setTimeout(resolve, latency.current));
      if (selectionRef.current !== id || generation !== epoch.current || !onlineRef.current) return;
      const page = fixtureHistoryPage(historyFor(id), direction === 'older' ? { before: visible.current[0].sequence } : { after: visible.current.at(-1)!.sequence });
      const merged = [...new Map([...visible.current, ...page.messages].map(item => [item.id, item])).values()].sort((a, b) => a.sequence - b.sequence);
      publishWindow(id, merged, direction); setError(null);
    } finally { loadingPage.current = false; setLoadingOlder(false); setLoadingNewer(false); }
  };
  const jumpToMessage = async (id: number, sequence?: number, kind:'message'|'date'='message') => {
    const ticketId = selectionRef.current;
    if (ticketId === null) return;
    ++epoch.current;
    const loaded=visible.current.find(message=>message.id===id);
    if(loaded){navigate({kind,messageId:id,sequence:loaded.sequence,animate:true});return;}
    const page = fixtureHistoryPage(historyFor(ticketId), sequence === undefined ? { aroundMessageId: id } : { around: sequence });
    publishWindow(ticketId, page.messages); navigate({ kind, messageId: id, sequence: sequence ?? page.messages.find(item => item.id === id)?.sequence, animate: true });
  };
  const jumpToLatest = async () => {
    const id = selectionRef.current;
    if (id === null) return;
    ++epoch.current; publishWindow(id, fixtureHistoryPage(historyFor(id)).messages); navigate({ kind: 'latest', animate: true });
  };
  const jumpToDate=async(date:string)=>{
    const id=selectionRef.current;if(id===null)return;
    try{
      const target=findFixtureDateMessage(historyFor(id),date);
      if(!target)throw new Error('За выбранный день сообщений нет.');
      setError(null);await jumpToMessage(target.messageId,target.sequence,'date');
      helpDevState({fixtureDateFound:true,fixtureDateSequence:target.sequence});
    }catch(error){setError(error instanceof Error?error.message:'Не удалось перейти к дате');helpDevState({fixtureDateFound:false});throw error;}
  };
  const searchMessages = async (search: string, cursor?: number) => {
    const id = selectionRef.current;
    if (id === null) return { messages: [], total: 0, nextCursor: null };
    await new Promise(resolve => setTimeout(resolve, latency.current));
    return searchFixtureHistory(historyFor(id), search, cursor);
  };
  const syncCurrent = () => {
    const id = selectionRef.current;
    if (id === null) return;
    const history = historyFor(id), lastVisible = visible.current.at(-1)?.sequence ?? 0, offlineTail = offlineTails.current.get(id);
    const next = offlineTail !== undefined && lastVisible >= offlineTail ? [...visible.current, ...history.filter(item => item.sequence > lastVisible)] : visible.current;
    offlineTails.current.delete(id); publishWindow(id, next); updateTicket(id);
  };
  const setConnection = (connected: boolean) => {
    if (!connected) for (const [id, history] of histories.current) offlineTails.current.set(id, history.at(-1)?.sequence ?? 0);
    onlineRef.current = connected; setOnline(connected); setError(null);
    if (connected) syncCurrent();
    helpDevState({ fixtureOnline: connected });
  };
  const receive = (count: number) => {
    const id = selectionRef.current ?? 1042, history = historyFor(id), oldTail = history.at(-1)?.sequence ?? 0;
    const incoming = Array.from({ length: count }, (_, index) => message(oldTail + index + 1, `Новое сообщение ${oldTail + index + 1}. Проверка сохранения места чтения.`, false, { ticketId: id, sequence: oldTail + index + 1, createdAt: new Date(Date.parse(history.at(-1)?.createdAt || new Date().toISOString()) + (index + 1) * 60000).toISOString() }));
    histories.current.set(id, [...history, ...incoming]);
    if (onlineRef.current) { publishWindow(id, (visible.current.at(-1)?.sequence ?? 0) >= oldTail ? [...visible.current, ...incoming] : visible.current); updateTicket(id); }
    helpDevState({ fixtureIncomingCount: count, fixtureIncomingDeferred: !onlineRef.current });
  };
  const sendMessage = async (id: number, input: HelpMessageInput): Promise<HelpDetail> => {
    if (!onlineRef.current) throw new Error('Нет подключения');
    const history = historyFor(id), reply = history.find(item => item.id === input.replyToId), sequence = (history.at(-1)?.sequence ?? 0) + 1;
    const next = [...history, message(sequence, input.text, true, { ticketId: id, sequence, attachments: (input.attachmentIds || []).map(key => uploaded.current.get(key)!).filter(Boolean), replyToId: reply?.id || null, replyTo: reply ? { id: reply.id, text: reply.text, author: reply.author, attachments: reply.attachments } : null })];
    histories.current.set(id, next); readCursors.current.set(id, sequence); updateTicket(id);
    const page = fixtureHistoryPage(next).messages; publishWindow(id, page); navigate({ kind: 'latest', animate: true });
    return { ticket: allRef.current.find(item => item.id === id)!, messages: page };
  };
  const status = async (id: number, input: HelpMessageInput & { rating?: number }, closed: boolean) => {
    const result = await sendMessage(id, input), ticket: HelpTicket = { ...result.ticket, status: closed ? 'CLOSED' : 'OPEN', closedAt: closed ? new Date().toISOString() : null, canReopen: closed };
    commitTickets(tickets => tickets.map(item => item.id === id ? ticket : item)); return { ...result, ticket };
  };
  useEffect(() => helpDevActions('fixture.service', {
    'fixture.it': value => setCanManage(value === 'true' || value === true),
    'fixture.rows': value => setExtraRows(Math.max(0, Math.min(100, Number(value) || 0))),
    'fixture.history': async value => {
      historySize.current = value === 'reset' || Number(value) === 0 ? 0 : Math.max(1, Math.min(2000, Number(value) || 600));
      histories.current.clear(); anchors.current.clear(); readCursors.current.clear(); offlineTails.current.clear(); ++epoch.current;
      setFirstUnreadSequence(null); setConnection(true);
      if (selectionRef.current !== null) await openTicket(selectionRef.current);
      helpDevState({ fixtureHistoryCount: historySize.current || fixtures.length });
    },
    'fixture.unread': async value => {
      const id = selectionRef.current ?? 1042, history = historyFor(id), incoming = history.filter(item => item.authorId !== OWNER.id), count = Math.max(0, Math.min(incoming.length, Number(value) || 0));
      readCursors.current.set(id, count ? incoming[incoming.length - count].sequence - 1 : history.at(-1)?.sequence ?? 0);
      anchors.current.delete(id); updateTicket(id);
      if (selectionRef.current !== null) await openTicket(id);
    },
    'fixture.incoming': value => receive(Math.max(1, Math.min(50, Number(value) || 1))),
    'fixture.voice': () => {
      const id = selectionRef.current ?? 1042, history = historyFor(id), oldTail = history.at(-1)?.sequence ?? 0, sequence = oldTail + 1;
      const attachment: HelpAttachment = { id: `qa-voice-${id}-${sequence}`, name: 'Голосовое.wav', kind: 'AUDIO', mimeType: 'audio/wav', size: 128044, url: 'qa-tone:8' };
      const next = message(sequence, '', false, { ticketId: id, sequence, attachments: [attachment] });
      histories.current.set(id, [...history, next]);
      if (onlineRef.current) { publishWindow(id, (visible.current.at(-1)?.sequence ?? 0) >= oldTail ? [...visible.current, next] : visible.current); updateTicket(id); }
      helpDevState({ fixtureVoiceMessageId: next.id, fixtureVoiceAttachmentId: attachment.id, fixtureVoiceDurationSeconds: 8 });
    },
    'fixture.mediaLatency': value => { mediaLatency.current = Math.max(0, Math.min(10000, Number(value) || 0)); helpDevState({ fixtureMediaLatencyMs: mediaLatency.current }); },
    'fixture.album': value => {
      const id = selectionRef.current ?? 1042, history = historyFor(id), oldTail = history.at(-1)?.sequence ?? 0, sequence = oldTail + 1;
      const attachments = createFixtureAlbum(id, sequence, Number(value));
      const next = message(sequence, `Альбом из ${attachments.length} фотографий.\nТекст виден сразу; место изображений и подписи остаётся неизменным при загрузке.`, false, { ticketId: id, sequence, attachments });
      histories.current.set(id, [...history, next]);
      if (onlineRef.current) { publishWindow(id, (visible.current.at(-1)?.sequence ?? 0) >= oldTail ? [...visible.current, next] : visible.current); updateTicket(id); }
      helpDevState({ fixtureAlbumMessageId: next.id, fixtureAlbumCount: attachments.length, fixtureMediaLatencyMs: mediaLatency.current });
    },
    'fixture.readByOther': value => {
      const id = selectionRef.current;
      if (id === null) return;
      const sequence = Math.max(0, Math.min(historyFor(id).at(-1)?.sequence ?? 0, Math.floor(Number(value) || 0)));
      commitTickets(tickets => tickets.map(ticket => ticket.id === id ? { ...ticket, members: ticket.members.map(member => member.userId === IT.id ? { ...member, lastReadSequence: Math.max(member.lastReadSequence ?? 0, sequence) } : member) } : ticket));
      helpDevState({ fixtureOtherReadSequence: sequence });
    },
    'fixture.offline': value => setConnection(!(value === true || value === 'true' || value === '1')),
    'fixture.online': value => setConnection(value !== false && value !== 'false' && value !== '0'),
    'fixture.latency': value => { latency.current = Math.max(0, Math.min(3000, Number(value) || 0)); },
    'fixture.history.jump': value => jumpToMessage(Number(value), Number(value)),
    'fixture.history.latest': () => jumpToLatest(),
    'fixture.history.date': value => jumpToDate(String(value)),
    'fixture.history.reopen': async () => { if (selectionRef.current !== null) await openTicket(selectionRef.current); },
  }));
  const noop = useCallback(async () => {}, []);
  const list = [...all, ...Array.from({ length: extraRows }, (_, index) => ({ ...all[index % 5], id: 2000 + index, number: 2000 + index }))];
  return { tickets: list.filter(ticket => !query || ticket.title.includes(query)), selectedTicket, messages, loading: false, busy: false, error, pendingCount: 0, connected: online, online, canManage, userId: OWNER.id, typingByTicket: { 1041: [{ userId: IT.id, name: IT.name }] }, hasMore: false,
    hasOlder, hasNewer, loadingOlder, loadingNewer, navigationTarget, firstUnreadSequence, lastReadSequence, lastSequence: selectedTicket?.lastMessage?.sequence ?? 0,
    loadTickets, openTicket, clearSelection, sendMessage, getDraft, setDraft, saveViewport, markVisibleRead, searchMessages, jumpToMessage, jumpToLatest, jumpToDate,
    loadOlder: () => loadPage('older'), loadNewer: () => loadPage('newer'),
    closeTicket: (id: number, input: HelpMessageInput & { rating: number }) => status(id, input, true), reopenTicket: (id: number, input: HelpMessageInput) => status(id, input, false),
    createTicket: async (input: HelpMessageInput) => { const id = Date.now(), ticket = { ...allRef.current[0], id, number: id, title: input.text || 'QA новое обращение' }; commitTickets(tickets => [ticket, ...tickets]); selectionRef.current = id; setSelection(id); const next = [message(1, input.text, true, { ticketId: id, attachments: (input.attachmentIds || []).map(key => uploaded.current.get(key)!).filter(Boolean) })]; histories.current.set(id, next); readCursors.current.set(id, 1); publishWindow(id, next); updateTicket(id); navigate({ kind: 'latest', animate: false }); return { ticket, messages: next }; },
    editMessage: async (id: number, input: { text: string; rating?: number }) => { const ticketId = selectionRef.current!; histories.current.set(ticketId, historyFor(ticketId).map(item => item.id === id ? { ...item, ...input, editedAt: new Date().toISOString() } : item)); const next = visible.current.map(item => historyFor(ticketId).find(value => value.id === item.id) || item); publishWindow(ticketId, next); updateTicket(ticketId); return { ticket: allRef.current.find(item => item.id === ticketId)!, messages: next }; },
    toggleReaction: async (m: { id: number }, emoji: string) => { const id = selectionRef.current!; histories.current.set(id, historyFor(id).map(item => item.id !== m.id ? item : { ...item, reactions: item.reactions.some(reaction => reaction.emoji === emoji) ? item.reactions.filter(reaction => reaction.emoji !== emoji) : [...item.reactions, { emoji, count: 1, mine: true, userIds: [OWNER.id] }] })); publishWindow(id, visible.current.map(item => historyFor(id).find(value => value.id === item.id) || item)); },
    uploadAttachments: async (files: HelpLocalFile[]) => {
      const attachments:HelpAttachment[]=[];
      for(const file of files){const attachment=await uploadFixtureAttachment(file);uploaded.current.set(attachment.id,attachment);attachments.push(attachment);}
      return attachments;
    },
    mediaSource: resolveFixtureMedia, emitTyping: noop, retryPending: noop, refresh: async () => { if (onlineRef.current) syncCurrent(); }, requestIt: noop, claimTicket: noop, markAllRead: async () => { for (const [id, history] of histories.current) readCursors.current.set(id, history.at(-1)?.sequence ?? 0); commitTickets(tickets => tickets.map(ticket => ({ ...ticket, unreadCount: 0 }))); },
  };
}
