import { Platform } from 'react-native';
import { jwtDecode } from 'jwt-decode';
import { apiClient } from '@/utils/apiClient';
import { API_BASE_URL } from '@/utils/config';
import { getAccessToken, getAccessTokenForRequest, refreshToken } from '@/utils/tokenService';
import type { HelpEvent, HelpHistoryPage, HelpHistoryQuery, HelpSearchResult, HelpSyncResult } from './helpHistoryTypes';
import type { HelpAssistantRun } from './helpAssistant';

export type HelpUser = { id: number; name: string; avatarUrl: string | null };
export type HelpAttachment = { id: string; name: string; mimeType: string; size: number; kind: 'IMAGE' | 'AUDIO' | 'FILE'; url: string; width?: number | null; height?: number | null; thumbnailDataUri?: string | null; position?: number };
export type HelpMessage = {
  ticketStatusChange?: 'CLOSED' | 'REOPENED' | null;
  assistantRun?: HelpAssistantRun;
  id: number; ticketId: number; sequence: number; clientMessageId: string | null;
  authorId: number | null; author: HelpUser | null; authorRole: 'USER' | 'IT' | 'SYSTEM';
  kind: 'TEXT' | 'CLOSURE' | 'SYSTEM' | 'ASSISTANT_PROGRESS'; text: string; createdAt: string; editedAt: string | null;
  replyToId: number | null; replyTo: { id: number; text: string; author?: HelpUser | null; attachments?: HelpAttachment[] } | null;
  forwardedFromId: number | null; rating: number | null; attachments: HelpAttachment[];
  reactions: { emoji: string; count: number; mine: boolean; userIds: number[] }[];
};
export type HelpTicket = {
  id: number; number: number; title: string; status: 'OPEN' | 'CLOSED'; ownerId: number;
  createdAt: string; updatedAt: string; closedAt: string | null; sourceTicketId: number | null;
  sourceTicket: { id: number; number: number; title: string } | null; itRequested: boolean;
  members: { userId: number; role: 'OWNER' | 'IT'; user: HelpUser; lastReadSequence?: number }[];
  unreadCount: number; lastMessage: HelpMessage | null; canReopen: boolean; aiEnabled: boolean;
  lastReadSequence?: number; lastSequence?: number;
};
export type HelpDetail = { queued?:boolean; ticket: HelpTicket; messages: HelpMessage[] } & Partial<HelpHistoryPage>;
export type HelpConfig = { aiEnabled: boolean; canManage: boolean; maxAttachments: number; maxFileBytes: number };
export type HelpFile = { uri: string; name: string; mimeType?: string; file?: File };
export type HelpMessageInput = { text: string; attachmentIds?: string[]; replyToId?: number; forwardedFromId?: number; clientMessageId?: string };
export type HelpCreateInput = HelpMessageInput & { sourceTicketId?: number; clientTicketId?: string };
export type HelpCloseInput = { text: string; rating: number; attachmentIds?: string[]; clientMessageId?: string };
export type HelpMediaSource = { uri: string; headers?: Record<string, string>; cacheKey?: string };
export class HelpApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
type HelpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type HelpAuth = { userId: number; token: string };
function tokenUserId(token: string | null): number | null {
  try { const id = Number(jwtDecode<{ userId?: number }>(token || '').userId); return Number.isSafeInteger(id) && id > 0 ? id : null; } catch { return null; }
}
function accountChanged(): never {
  // A previous request may already have committed; retain its immutable outbox item.
  throw new HelpApiError('Учётная запись изменилась. Вернитесь в исходную учётную запись для повтора.', 0, 'HELP_ACCOUNT_CHANGED');
}
async function captureAuth(expectedUserId?: number): Promise<HelpAuth> {
  const token = await getAccessTokenForRequest(), userId = tokenUserId(token);
  if (!token || !userId) {
    if (expectedUserId !== undefined) accountChanged();
    throw new HelpApiError('Войдите в приложение для продолжения', 401, 'UNAUTHORIZED');
  }
  if (expectedUserId !== undefined && userId !== expectedUserId) accountChanged();
  return { token, userId };
}
async function assertAuth(auth: HelpAuth) {
  if (tokenUserId(await getAccessToken()) !== auth.userId) accountChanged();
}
async function refreshAuth(auth: HelpAuth): Promise<HelpAuth> {
  await assertAuth(auth);
  const token = await refreshToken();
  if (!token || tokenUserId(token) !== auth.userId) accountChanged();
  await assertAuth(auth);
  return { token, userId: auth.userId };
}
async function requestWithAuth<T>(path: string, method: HelpMethod, body: unknown, auth: HelpAuth): Promise<T> {
  const send = (session: HelpAuth) => apiClient<unknown, T>(`/help${path}`, {
    method, body, timeoutMs: 30000, skipAuth: true, headers: { Authorization: `Bearer ${session.token}` },
  });
  await assertAuth(auth);
  let result = await send(auth);
  if (result.status === 401) result = await send(await refreshAuth(auth));
  await assertAuth(auth);
  if (!result.ok || result.data === undefined) throw new HelpApiError(result.message || 'Не удалось выполнить действие. Попробуйте ещё раз.', result.status, result.backendErrorCode);
  return result.data;
}
export async function helpRequest<T>(path: string, method: HelpMethod = 'GET', body?: unknown, expectedUserId?: number): Promise<T> {
  return requestWithAuth<T>(path, method, body, await captureAuth(expectedUserId));
}
export function createHelpApi(expectedUserId?: number) {
  const helpRequest = async <T,>(path: string, method: HelpMethod = 'GET', body?: unknown) =>
    requestWithAuth<T>(path, method, body, await captureAuth(expectedUserId));
  return {
  events: (after=0) => helpRequest<{events:HelpEvent[];nextCursor:number;hasMore:boolean;resyncRequired?:boolean;snapshotCursor?:number;visibleTicketIds?:number[];visibilityComplete?:boolean}>(`/events?after=${after}`),
  stopAssistant: (id:number,runId:string) => helpRequest<HelpDetail>(`/tickets/${id}/assistant/stop`,'POST',{runId}),
  retryAssistant: (id:number,runId:string) => helpRequest<HelpDetail>(`/tickets/${id}/assistant/retry`,'POST',{runId}),
  config: () => helpRequest<HelpConfig>('/config'),
  list: (status: string, scope: string, cursor?: string | number, query = '') => helpRequest<{ tickets: HelpTicket[]; nextCursor: string | number | null }>(`/tickets?status=${status}&scope=${scope}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`),
  detail: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}`),
  messages: (id: number, query: HelpHistoryQuery | number = {}) => {
    const options = typeof query === 'number' ? {before:query} : query;
    const params = new URLSearchParams({limit:String(options.limit ?? 100)});
    for (const name of ['before','after','around','aroundMessageId'] as const) if (options[name] !== undefined) params.set(name,String(options[name]));
    return helpRequest<HelpHistoryPage>(`/tickets/${id}/messages?${params}`);
  },
  search: (id:number, query:string, before?:number) => helpRequest<HelpSearchResult>(`/tickets/${id}/search?q=${encodeURIComponent(query)}&limit=30${before ? `&before=${before}` : ''}`),
  date: (id:number, from:string, to:string) => helpRequest<{messageId:number;sequence:number}>(`/tickets/${id}/date?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  sync: (id:number, after=0) => helpRequest<HelpSyncResult>(`/tickets/${id}/sync?after=${after}&limit=200`),
  create: (input: HelpCreateInput) => helpRequest<HelpDetail>('/tickets', 'POST', input),
  send: (id: number, input: HelpMessageInput) => helpRequest<HelpDetail>(`/tickets/${id}/messages`, 'POST', input),
  close: (id: number, input: HelpCloseInput) => helpRequest<HelpDetail>(`/tickets/${id}/close`, 'POST', input),
  reopen: (id: number, input: HelpMessageInput) => helpRequest<HelpDetail>(`/tickets/${id}/reopen`, 'POST', input),
  requestIt: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}/request-it`, 'POST', {}),
  claim: (id: number) => helpRequest<HelpDetail>(`/tickets/${id}/claim`, 'POST', {}),
  read: (id: number, sequence?: number) => helpRequest(`/tickets/${id}/read`, 'POST', { sequence }),
  readAll: () => helpRequest('/read-all', 'POST', {}),
  edit: (id: number, input: { text: string; rating?: number; attachmentIds?: string[] }) => helpRequest<HelpDetail>(`/messages/${id}`, 'PATCH', input),
  react: (id: number, emoji: string, remove: boolean) => helpRequest<HelpDetail>(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`, remove ? 'DELETE' : 'PUT', {}),
  };
}
export const helpApi = createHelpApi();

export async function uploadHelpFiles(files: HelpFile[], expectedUserId?: number): Promise<HelpAttachment[]> {
  if (!files.length || files.length > 10) throw new Error('Можно прикрепить от 1 до 10 файлов.');
  const auth = await captureAuth(expectedUserId);
  const form = new FormData();
  for (const file of files) {
    if (Platform.OS === 'web') {
      const blob = file.file || await (await fetch(file.uri)).blob();
      form.append('files', blob, file.name);
    } else form.append('files', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
  }
  const data = await requestWithAuth<{ attachments: HelpAttachment[] }>('/attachments', 'POST', form, auth);
  return data.attachments;
}

// Never send account tokens to an arbitrary URL supplied by message content.
export function helpAttachmentUrl(attachment: HelpAttachment): string {
  const url = new URL(attachment.url, `${API_BASE_URL}/`);
  const base = new URL(API_BASE_URL);
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/help/attachments/`)) throw new Error('Недопустимый адрес вложения');
  return url.toString();
}
export async function loadHelpMedia(attachment: HelpAttachment, expectedUserId?: number): Promise<HelpMediaSource> {
  const uri = helpAttachmentUrl(attachment);
  let auth = await captureAuth(expectedUserId);
  await assertAuth(auth);
  if (Platform.OS !== 'web') return { uri, headers: { Authorization: `Bearer ${auth.token}` }, cacheKey: `help:${auth.userId}:${attachment.id}:${API_BASE_URL}` };
  let response = await fetch(uri, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (response.status === 401) {
    auth = await refreshAuth(auth);
    response = await fetch(uri, { headers: { Authorization: `Bearer ${auth.token}` } });
  }
  await assertAuth(auth);
  if (!response.ok) throw new HelpApiError('Вложение недоступно', response.status);
  const blob = await response.blob();
  await assertAuth(auth);
  return { uri: URL.createObjectURL(blob) };
}
