// utils/appealsService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { apiClient } from './apiClient';
import { API_BASE_URL } from './config';
import { getAccessToken } from './tokenService';
import { ErrorResponse, SuccessResponse } from '@/types';
import {
  AppealDetail,
  AppealListResponse,
  AppealPriority,
  AppealStatus,
  AddMessageResult,
  AppealCreateResult,
  DeleteMessageResult,
  EditMessageResult,
  AppealMessage,
  MessageStatus,
  Scope,
} from '@/types/appealsTypes';

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// -------------------- Кэш листинга --------------------
const LIST_CACHE_KEY = 'appealsListCache';
const LIST_CACHE_INDEX = 'appealsListCache:index';
const LIST_TTL = 2 * 60 * 1000; // 2 мин

type ListCacheEnvelope = {
  data: AppealListResponse['data'];
  meta: AppealListResponse['meta'];
  key: string;
  ts: number;
};

function listKey(scope: Scope, limit: number, offset: number, status?: AppealStatus, priority?: AppealPriority) {
  return JSON.stringify({ scope, limit, offset, status, priority });
}

async function readListCache(key: string): Promise<AppealListResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(`${LIST_CACHE_KEY}:${key}`);
    if (!raw) return null;
    const parsed: ListCacheEnvelope = JSON.parse(raw);
    if (Date.now() - parsed.ts > LIST_TTL) return null;
    return { data: parsed.data, meta: parsed.meta };
  } catch { return null; }
}

async function readListIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST_CACHE_INDEX);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

async function writeListIndex(keys: string[]) {
  try {
    await AsyncStorage.setItem(LIST_CACHE_INDEX, JSON.stringify(Array.from(new Set(keys))));
  } catch {}
}

async function writeListCache(key: string, payload: AppealListResponse) {
  try {
    const env: ListCacheEnvelope = { data: payload.data, meta: payload.meta, key, ts: Date.now() };
    const storageKey = `${LIST_CACHE_KEY}:${key}`;
    await AsyncStorage.setItem(storageKey, JSON.stringify(env));
    const idx = await readListIndex();
    idx.push(storageKey);
    await writeListIndex(idx);
  } catch {}
}

async function invalidateListCache() {
  try {
    const idx = await readListIndex();
    await Promise.all(idx.map(k => AsyncStorage.removeItem(k)));
    await AsyncStorage.removeItem(LIST_CACHE_INDEX);
  } catch {}
}

// -------------------- Кэш деталей --------------------
const DETAIL_CACHE_KEY = 'appealDetailCache';
const DETAIL_TTL = 2 * 60 * 1000;

type DetailCacheEnvelope = { data: AppealDetail; ts: number };

async function readDetailCache(id: number): Promise<AppealDetail | null> {
  try {
    const raw = await AsyncStorage.getItem(`${DETAIL_CACHE_KEY}:${id}`);
    if (!raw) return null;
    const parsed: DetailCacheEnvelope = JSON.parse(raw);
    if (Date.now() - parsed.ts > DETAIL_TTL) return null;
    return parsed.data;
  } catch { return null; }
}

async function writeDetailCache(id: number, data: AppealDetail) {
  try {
    const env: DetailCacheEnvelope = { data, ts: Date.now() };
    await AsyncStorage.setItem(`${DETAIL_CACHE_KEY}:${id}`, JSON.stringify(env));
  } catch {}
}

async function invalidateDetailCache(id: number) {
  try { await AsyncStorage.removeItem(`${DETAIL_CACHE_KEY}:${id}`); } catch {}
}

// -------------------- Helpers --------------------
export type FileLike = { uri: string; name: string; type: string };

function ensureNonEmpty(str?: string | null): string | undefined {
  const s = typeof str === 'string' ? str.trim() : '';
  return s ? s : undefined;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    search.set(k, String(v));
  });
  return search.toString();
}

// -------------------- WebSocket --------------------
export type MessageStatusUpdate = { messageId: number; status: MessageStatus };

export type AppealSocketEvent =
  | { type: 'message'; message: AppealMessage }
  | { type: 'status'; update: MessageStatusUpdate }
  | { type: 'typing'; userId: number }
  | { type: 'edit'; message: AppealMessage };

let appealSocket: Socket | null = null;

export async function connectAppealSocket(
  appealId: number,
  onEvent: (evt: AppealSocketEvent) => void,
) {
  const token = await getAccessToken();
  appealSocket = io(API_BASE_URL, {
    transports: ['websocket'],
    auth: token ? { token } : undefined,
  });

  appealSocket.emit('join', `appeal:${appealId}`);

  appealSocket.on('message:new', (m: AppealMessage) => onEvent({ type: 'message', message: m }));
  appealSocket.on('message:status', (u: MessageStatusUpdate) => onEvent({ type: 'status', update: u }));
  appealSocket.on('message:typing', (u: { userId: number }) => onEvent({ type: 'typing', userId: u.userId }));
  appealSocket.on('message:edit', (m: AppealMessage) => onEvent({ type: 'edit', message: m }));

  return () => {
    appealSocket?.emit('leave', `appeal:${appealId}`);
    appealSocket?.disconnect();
    appealSocket = null;
  };
}

// -------------------- Список --------------------
export async function getAppealsList(
  scope: Scope = 'my',
  limit = 20,
  offset = 0,
  opts?: { status?: AppealStatus; priority?: AppealPriority; forceRefresh?: boolean }
): Promise<AppealListResponse> {
  const key = listKey(scope, limit, offset, opts?.status, opts?.priority);
  if (!opts?.forceRefresh) {
    const cached = await readListCache(key);
    if (cached) return cached;
  }

  const qs = buildQuery({ scope, limit, offset, status: opts?.status, priority: opts?.priority });

  const resp = (await apiClient<undefined, AppealListResponse>(`/appeals?${qs}`, { method: 'GET' })) as ApiResponse<AppealListResponse>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка загрузки обращений');

  await writeListCache(key, resp.data);
  return resp.data;
}

export async function refreshAppealsList(scope: Scope, limit = 20, offset = 0, status?: AppealStatus, priority?: AppealPriority) {
  return getAppealsList(scope, limit, offset, { status, priority, forceRefresh: true });
}

// -------------------- Детали --------------------
export async function getAppealById(id: number, forceRefresh = false): Promise<AppealDetail> {
  if (!forceRefresh) {
    const cached = await readDetailCache(id);
    if (cached) return cached;
  }

  const resp = (await apiClient<undefined, AppealDetail>(`/appeals/${id}`, { method: 'GET' })) as ApiResponse<AppealDetail>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка загрузки обращения');

  await writeDetailCache(id, resp.data);
  return resp.data;
}

function ensureExt(name: string, mime: string) {
  if (/\.[a-z0-9]+$/i.test(name)) return name;
  const ext = (mime && mime.split('/')[1]) || 'bin';
  return `${name}.${ext}`;
}

// -------------------- Создание --------------------
// Всегда multipart, чтобы одинаково принимать любые вложения (файлы, аудио, фото, документы).
export async function createAppeal(payload: {
  toDepartmentId: number;
  title?: string;
  text: string;
  priority?: AppealPriority;
  deadline?: string; // ISO
  attachments?: FileLike[];
}): Promise<AppealCreateResult> {
  if (!payload.toDepartmentId) throw new Error('Не указан toDepartmentId');
  if (!ensureNonEmpty(payload.text)) throw new Error('Поле text обязательно');

  const fd = new FormData();
  fd.append('toDepartmentId', String(payload.toDepartmentId));
  if (ensureNonEmpty(payload.title)) fd.append('title', payload.title!.trim());
  fd.append('text', payload.text.trim());
  if (payload.priority !== undefined) fd.append('priority', String(payload.priority));
  if (ensureNonEmpty(payload.deadline)) fd.append('deadline', payload.deadline!.trim());

  (payload.attachments || []).forEach((f) => {
    fd.append(
      'attachments',
      { uri: f.uri, name: ensureExt(f.name, f.type), type: f.type } as any
    );
  });

  const resp = (await apiClient<FormData, AppealCreateResult>('/appeals', {
    method: 'POST',
    body: fd,
  })) as ApiResponse<AppealCreateResult>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка создания обращения');
  await invalidateListCache();
  return resp.data;
}

// -------------------- Статус --------------------
export async function updateAppealStatus(id: number, status: AppealStatus) {
  const resp = (await apiClient<{ status: AppealStatus }, { id: number; status: AppealStatus }>(`/appeals/${id}/status`, {
    method: 'PUT',
    body: { status },
  })) as ApiResponse<{ id: number; status: AppealStatus }>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка обновления статуса');
  await invalidateDetailCache(id);
  await invalidateListCache();
  return resp.data;
}

// -------------------- Исполнители / Наблюдатели --------------------
export async function assignAppeal(id: number, assigneeIds: number[]) {
  const resp = (await apiClient<{ assigneeIds: number[] }, { id: number; status: AppealStatus }>(`/appeals/${id}/assign`, {
    method: 'PUT',
    body: { assigneeIds },
  })) as ApiResponse<{ id: number; status: AppealStatus }>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка назначения исполнителей');
  await invalidateDetailCache(id);
  return resp.data;
}

export async function updateAppealWatchers(id: number, watcherIds: number[]) {
  const resp = (await apiClient<{ watcherIds: number[] }, { id: number; watchers: number[] }>(`/appeals/${id}/watchers`, {
    method: 'PUT',
    body: { watcherIds },
  })) as ApiResponse<{ id: number; watchers: number[] }>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка обновления наблюдателей');
  await invalidateDetailCache(id);
  return resp.data;
}

// -------------------- Сообщения --------------------
export async function addAppealMessage(
  id: number,
  opts: { text?: string; files?: FileLike[]; onProgress?: (p: number) => void; tempId?: string }
): Promise<AddMessageResult> {
  const hasText = !!ensureNonEmpty(opts.text);
  const hasFiles = !!opts.files?.length;
  if (!hasText && !hasFiles) throw new Error('Нужно указать текст и/или приложить файлы');

  const fd = new FormData();
  if (hasText) fd.append('text', opts.text!.trim());
  (opts.files || []).forEach((f) => {
    fd.append(
      'attachments',
      { uri: f.uri, name: ensureExt(f.name, f.type), type: f.type } as any
    );
  });

  opts.onProgress?.(0);
  const resp = (await apiClient<FormData, AddMessageResult>(`/appeals/${id}/messages`, {
    method: 'POST',
    body: fd,
  })) as ApiResponse<AddMessageResult>;
  opts.onProgress?.(100);

  if (!resp.ok) throw new Error(resp.message || 'Ошибка отправки сообщения');
  await invalidateDetailCache(id);
  return resp.data;
}

export async function editAppealMessage(
  messageId: number,
  opts: { text?: string; files?: FileLike[]; onProgress?: (p: number) => void }
): Promise<EditMessageResult> {
  const hasText = !!ensureNonEmpty(opts.text);
  const hasFiles = !!opts.files?.length;
  if (!hasText && !hasFiles) throw new Error('Нужно указать текст и/или приложить файлы');

  const fd = new FormData();
  if (hasText) fd.append('text', opts.text!.trim());
  (opts.files || []).forEach((f) => {
    fd.append(
      'attachments',
      { uri: f.uri, name: ensureExt(f.name, f.type), type: f.type } as any
    );
  });

  opts.onProgress?.(0);
  const resp = (await apiClient<FormData, EditMessageResult>(`/appeals/messages/${messageId}`, {
    method: 'PUT',
    body: fd,
  })) as ApiResponse<EditMessageResult>;
  opts.onProgress?.(100);

  if (!resp.ok) throw new Error(resp.message || 'Ошибка редактирования сообщения');
  return resp.data;
}

export async function deleteAppealMessage(
  messageId: number,
  opts?: { onProgress?: (p: number) => void }
): Promise<DeleteMessageResult> {
  opts?.onProgress?.(0);
  const resp = (await apiClient<undefined, DeleteMessageResult>(`/appeals/messages/${messageId}`, {
    method: 'DELETE',
  })) as ApiResponse<DeleteMessageResult>;
  opts?.onProgress?.(100);

  if (!resp.ok) throw new Error(resp.message || 'Ошибка удаления сообщения');
  return resp.data;
}

// -------------------- Синхронизация истории --------------------
const OFFLINE_MSG_KEY = (id: number) => `appealOffline:${id}`;

export async function getAppealMessages(
  id: number,
  limit = 20,
  offset = 0,
): Promise<AppealMessage[]> {
  const qs = buildQuery({ limit, offset });
  const resp = (await apiClient<undefined, { messages: AppealMessage[] }>(
    `/appeals/${id}/messages?${qs}`,
    { method: 'GET' },
  )) as ApiResponse<{ messages: AppealMessage[] }>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка загрузки сообщений');
  return resp.data.messages;
}

export async function savePendingMessage(id: number, msg: AppealMessage) {
  const key = OFFLINE_MSG_KEY(id);
  try {
    const raw = await AsyncStorage.getItem(key);
    const arr: AppealMessage[] = raw ? JSON.parse(raw) : [];
    arr.push(msg);
    await AsyncStorage.setItem(key, JSON.stringify(arr));
  } catch {}
}

function mergeMessages(remote: AppealMessage[], local: AppealMessage[]) {
  const map = new Map<number, AppealMessage>();
  remote.forEach((m) => map.set(m.id, m));
  local.forEach((m) => { if (!map.has(m.id)) map.set(m.id, m); });
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export async function syncAppealHistory(id: number): Promise<AppealMessage[]> {
  const key = OFFLINE_MSG_KEY(id);
  const raw = await AsyncStorage.getItem(key);
  const local: AppealMessage[] = raw ? JSON.parse(raw) : [];
  const remote = await getAppealMessages(id, 50, 0);
  const merged = mergeMessages(remote, local);
  await AsyncStorage.removeItem(key);
  return merged;
}

export async function bulkUpdateMessageStatus(
  appealId: number,
  messageIds: number[],
  status: MessageStatus,
) {
  const resp = (await apiClient<
    { messageIds: number[]; status: MessageStatus },
    { updates: MessageStatusUpdate[] }
  >(`/appeals/${appealId}/messages/status`, {
    method: 'PUT',
    body: { messageIds, status },
  })) as ApiResponse<{ updates: MessageStatusUpdate[] }>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка обновления статусов сообщений');
  return resp.data.updates;
}

// -------------------- Экспорт CSV --------------------
export async function exportAppealsCSV(params: {
  scope?: Scope;
  status?: AppealStatus;
  priority?: AppealPriority;
  fromDate?: string;
  toDate?: string;
}): Promise<Blob> {
  const qs = buildQuery({
    scope: params.scope,
    status: params.status,
    priority: params.priority,
    fromDate: params.fromDate,
    toDate: params.toDate,
  });

  // apiClient сам вернёт Blob по content-type
  const resp = (await apiClient<undefined, Blob>(`/appeals/export?${qs}`, { method: 'GET' })) as any;
  return resp as Blob;
}
