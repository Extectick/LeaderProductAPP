/** Metro alias applies ONLY to HelpScreen inside this standalone QA project. */
import { useCallback, useRef, useState } from 'react';
import type { HelpAttachment, HelpDetail, HelpMessageInput, HelpTicket } from '../../src/features/help/helpApi';
import { fixtures, message, OWNER, IT, resolve } from './HelpPreview';

export function useHelpService() {
  const [all, setAll] = useState<HelpTicket[]>(() => [
    { id: 1042, number: 1042, title: 'Не открывается заказ', status: 'OPEN', ownerId: OWNER.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), closedAt: null, sourceTicketId: null, sourceTicket: null, itRequested: true, members: [{ userId: IT.id, role: 'IT', user: IT }], unreadCount: 3, lastMessage: fixtures[7], canReopen: false, aiEnabled: false },
    ...[1041, 1040, 1039, 1038, 1037, 1036].map((id, i): HelpTicket => ({ id, number: id, title: ['Не печатает принтер', 'Ошибка при входе в 1С', 'Как выгрузить отчёт в Excel', 'Проверить обмен', 'Заказ не найден', 'Старая заявка'][i], status: i > 3 ? 'CLOSED' : 'OPEN', ownerId: OWNER.id, createdAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(), updatedAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(), closedAt: i > 3 ? new Date(Date.now() - (i === 4 ? 1 : 5) * 86400000).toISOString() : null, sourceTicketId: null, sourceTicket: null, itRequested: i % 2 === 0, members: i % 2 === 0 ? [{ userId: IT.id, role: 'IT', user: IT }, { userId: 203, role: 'IT', user: { id: 203, name: 'Алексей · IT', avatarUrl: null } }] : [], unreadCount: i % 3, lastMessage: message(20 + i, i > 3 ? 'Обращение завершено' : 'Проверяю, скоро вернусь с ответом'), canReopen: i === 4, aiEnabled: false })),
  ]);
  const [selection, setSelection] = useState<number | null>(null), [messages, setMessages] = useState(fixtures), [query, setQuery] = useState('');
  const drafts = useRef(new Map<string, string>()), uploaded = useRef(new Map<string, HelpAttachment>());
  const selectedTicket = all.find(t => t.id === selection) || null;
  const loadTickets = useCallback(async (_status?: string, _scope?: string, _append?: boolean, search = '') => { setQuery(search); }, []);
  const openTicket = useCallback(async (id: number): Promise<HelpDetail> => { setSelection(id); setMessages(fixtures.map(m => ({ ...m, ticketId: id }))); const ticket = all.find(t => t.id === id); if (!ticket) throw Error('QA fixture missing'); return { ticket, messages: fixtures }; }, [all]);
  const clearSelection = useCallback(() => setSelection(null), []);
  const getDraft = useCallback(async (key: string) => drafts.current.get(key) || '', []);
  const setDraft = useCallback(async (key: string, text: string) => { drafts.current.set(key, text); }, []);
  const sendMessage = async (id: number, input: HelpMessageInput): Promise<HelpDetail> => { const ticket = all.find(t => t.id === id)!; const reply = messages.find(m => m.id === input.replyToId); const next = [...messages, message(Date.now(), input.text, true, { ticketId: id, attachments: (input.attachmentIds || []).map(key => uploaded.current.get(key)!).filter(Boolean), replyToId: reply?.id || null, replyTo: reply ? { id: reply.id, text: reply.text, author: reply.author, attachments: reply.attachments } : null })]; setMessages(next); return { ticket, messages: next }; };
  const status = async (id: number, input: HelpMessageInput & { rating?: number }, closed: boolean) => { const result = await sendMessage(id, input); const ticket: HelpTicket = { ...result.ticket, status: closed ? 'CLOSED' : 'OPEN', closedAt: closed ? new Date().toISOString() : null, canReopen: closed }; setAll(old => old.map(t => t.id === id ? ticket : t)); return { ...result, ticket }; };
  const noop = useCallback(async () => {}, []);
  return { tickets: all.filter(t => !query || t.title.includes(query)), selectedTicket, messages, loading: false, busy: false, error: null, pendingCount: 0, connected: true, online: true, canManage: false, userId: OWNER.id, typingByTicket: { 1041: [{ userId: IT.id, name: IT.name }] }, hasMore: false,
    loadTickets, openTicket, clearSelection, sendMessage, getDraft, setDraft,
    closeTicket: (id: number, input: HelpMessageInput & { rating: number }) => status(id, input, true), reopenTicket: (id: number, input: HelpMessageInput) => status(id, input, false),
    createTicket: async (input: HelpMessageInput) => { const id = Date.now(); const ticket = { ...all[0], id, number: id, title: input.text || 'QA новое обращение' }; setAll(old => [ticket, ...old]); setSelection(id); const next = [message(id, input.text, true, { ticketId: id })]; setMessages(next); return { ticket, messages: next }; },
    editMessage: async (id: number, input: { text: string; rating?: number }) => { const next = messages.map(m => m.id === id ? { ...m, ...input, editedAt: new Date().toISOString() } : m); setMessages(next); return { ticket: selectedTicket!, messages: next }; },
    toggleReaction: async (m: { id: number }, emoji: string) => setMessages(old => old.map(item => item.id !== m.id ? item : { ...item, reactions: item.reactions.some(r => r.emoji === emoji) ? item.reactions.filter(r => r.emoji !== emoji) : [...item.reactions, { emoji, count: 1, mine: true, userIds: [OWNER.id] }] })),
    uploadAttachments: async (files: { uri: string; name: string; mimeType?: string }[]) => files.map((f, i): HelpAttachment => { const attachment: HelpAttachment = { id: `local-${Date.now()}-${i}`, name: f.name, mimeType: f.mimeType || 'application/octet-stream', kind: f.mimeType?.startsWith('image/') ? 'IMAGE' : f.mimeType?.startsWith('audio/') ? 'AUDIO' : 'FILE', size: 0, url: f.uri }; uploaded.current.set(attachment.id, attachment); return attachment; }),
    mediaSource: resolve, loadOlder: noop, emitTyping: noop, retryPending: noop, refresh: noop, requestIt: noop, claimTicket: noop, markAllRead: async () => setAll(old => old.map(t => ({ ...t, unreadCount: 0 }))),
  };
}
