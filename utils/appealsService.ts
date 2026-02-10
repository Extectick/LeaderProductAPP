// utils/appealsService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiClient } from './apiClient';
import { ErrorResponse, SuccessResponse } from '@/types';
import {
  AppealDetail,
  AppealListResponse,
  AppealPriority,
  AppealStatus,
  AppealCounters,
  AddMessageResult,
  AppealCreateResult,
  DeleteMessageResult,
  EditMessageResult,
  Scope,
  AppealMessagesResponse,
  UserMini,
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
export type FileLike = { uri: string; name: string; type: string; file?: any };

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

// -------------------- Список --------------------
export async function getAppealsList(
  scope: Scope = 'my',
  limit = 20,
  offset = 0,
  opts?: { status?: AppealStatus; priority?: AppealPriority; forceRefresh?: boolean }
): Promise<AppealListResponse> {
  const key = listKey(scope, limit, offset, opts?.status, opts?.priority);
  const skipCache = opts?.forceRefresh === true;
  if (!skipCache) {
    const cached = await readListCache(key);
    if (cached) return cached;
  }

  // Добавляем _ts для обхода ответов 304/ETag на некоторых платформах
  const qs = buildQuery({ scope, limit, offset, status: opts?.status, priority: opts?.priority, _ts: Date.now() });

  const resp = (await apiClient<undefined, AppealListResponse>(`/appeals?${qs}`, { method: 'GET' })) as ApiResponse<AppealListResponse>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка загрузки обращений');

  await writeListCache(key, resp.data);
  return resp.data;
}

export async function refreshAppealsList(scope: Scope, limit = 20, offset = 0, status?: AppealStatus, priority?: AppealPriority) {
  return getAppealsList(scope, limit, offset, { status, priority, forceRefresh: true });
}

export async function getAppealsCounters(): Promise<AppealCounters> {
  const resp = (await apiClient<undefined, AppealCounters>('/appeals/counters', {
    method: 'GET',
  })) as ApiResponse<AppealCounters>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка загрузки счетчиков обращений');
  return resp.data;
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

  for (const f of payload.attachments || []) {
    if (Platform.OS === 'web') {
      if (f.file) {
        fd.append('attachments', f.file, ensureExt(f.name, f.type));
        continue;
      }
      if (f.uri) {
        const res = await fetch(f.uri);
        const blob = await res.blob();
        fd.append('attachments', blob, ensureExt(f.name, f.type));
        continue;
      }
    }
    fd.append(
      'attachments',
      { uri: f.uri, name: ensureExt(f.name, f.type), type: f.type } as any
    );
  }

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

export async function claimAppeal(id: number) {
  const resp = (await apiClient<undefined, { id: number; status: AppealStatus; assigneeIds: number[] }>(
    `/appeals/${id}/claim`,
    { method: 'POST' }
  )) as ApiResponse<{ id: number; status: AppealStatus; assigneeIds: number[] }>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка назначения исполнителя');
  await invalidateDetailCache(id);
  await invalidateListCache();
  return resp.data;
}

export async function updateAppealDeadline(id: number, deadline: string | null) {
  const resp = (await apiClient<{ deadline: string | null }, { id: number; deadline: string | null }>(`/appeals/${id}/deadline`, {
    method: 'PUT',
    body: { deadline },
  })) as ApiResponse<{ id: number; deadline: string | null }>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка обновления дедлайна');
  await invalidateDetailCache(id);
  await invalidateListCache();
  return resp.data;
}

export async function changeAppealDepartment(id: number, departmentId: number) {
  const resp = (await apiClient<{ departmentId: number }, { id: number; status: AppealStatus; toDepartmentId: number }>(
    `/appeals/${id}/department`,
    { method: 'PUT', body: { departmentId } }
  )) as ApiResponse<{ id: number; status: AppealStatus; toDepartmentId: number }>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка смены отдела');
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

export async function markAppealMessageRead(
  appealId: number,
  messageId: number
): Promise<{ readAt: string }> {
  const resp = (await apiClient<undefined, { appealId: number; messageId: number; readAt: string }>(
    `/appeals/${appealId}/messages/${messageId}/read`,
    { method: 'POST' }
  )) as ApiResponse<{ appealId: number; messageId: number; readAt: string }>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка отметки прочитанного');
  await invalidateDetailCache(appealId);
  return { readAt: resp.data.readAt };
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

export async function getDepartmentMembers(departmentId: number): Promise<UserMini[]> {
  const resp = (await apiClient<undefined, UserMini[]>(
    `/departments/${departmentId}/members`,
    { method: 'GET' }
  )) as ApiResponse<UserMini[]>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка загрузки сотрудников отдела');
  return resp.data || [];
}

// -------------------- Сообщения --------------------
export async function getAppealMessagesPage(
  id: number,
  opts?: { limit?: number; cursor?: string | null; direction?: 'before' | 'after' }
): Promise<AppealMessagesResponse> {
  const qs = buildQuery({
    mode: 'page',
    limit: opts?.limit ?? 30,
    cursor: opts?.cursor || undefined,
    direction: opts?.direction ?? 'before',
  });
  const resp = (await apiClient<undefined, AppealMessagesResponse>(
    `/appeals/${id}/messages?${qs}`,
    { method: 'GET' }
  )) as ApiResponse<AppealMessagesResponse>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка загрузки сообщений');
  return resp.data;
}

export async function getAppealMessagesBootstrap(
  id: number,
  opts?: { limit?: number; before?: number; after?: number; anchor?: 'first_unread' | 'last_unread' }
): Promise<AppealMessagesResponse> {
  const qs = buildQuery({
    mode: 'bootstrap',
    limit: opts?.limit ?? 30,
    anchor: opts?.anchor ?? 'last_unread',
    before: opts?.before ?? 40,
    after: opts?.after ?? 20,
    direction: 'before',
  });
  const resp = (await apiClient<undefined, AppealMessagesResponse>(
    `/appeals/${id}/messages?${qs}`,
    { method: 'GET' }
  )) as ApiResponse<AppealMessagesResponse>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка загрузки сообщений');
  return resp.data;
}

export async function getAppealMessages(
  id: number,
  opts?: { limit?: number; cursor?: string | null }
): Promise<AppealMessagesResponse> {
  return getAppealMessagesPage(id, {
    limit: opts?.limit,
    cursor: opts?.cursor,
    direction: 'before',
  });
}

export async function markAppealMessagesReadBulk(
  id: number,
  messageIds: number[]
): Promise<{ messageIds: number[]; readAt: string }> {
  const resp = (await apiClient<{ messageIds: number[] }, { messageIds: number[]; readAt: string }>(
    `/appeals/${id}/messages/read-bulk`,
    { method: 'POST', body: { messageIds } }
  )) as ApiResponse<{ messageIds: number[]; readAt: string }>;
  if (!resp.ok) throw new Error(resp.message || 'Ошибка отметки прочитанного');
  return resp.data;
}

export async function addAppealMessage(
  id: number,
  opts: { text?: string; files?: FileLike[] }
): Promise<AddMessageResult> {
  const hasText = !!ensureNonEmpty(opts.text);
  const hasFiles = !!opts.files?.length;
  if (!hasText && !hasFiles) throw new Error('Нужно указать текст и/или приложить файлы');

  const fd = new FormData();
  if (hasText) fd.append('text', opts.text!.trim());
  for (const f of opts.files || []) {
    if (Platform.OS === 'web') {
      if (f.file) {
        fd.append('attachments', f.file, ensureExt(f.name, f.type));
        continue;
      }
      if (f.uri) {
        const res = await fetch(f.uri);
        const blob = await res.blob();
        fd.append('attachments', blob, ensureExt(f.name, f.type));
        continue;
      }
    }
    fd.append(
      'attachments',
      { uri: f.uri, name: ensureExt(f.name, f.type), type: f.type } as any
    );
  }

  const resp = (await apiClient<FormData, AddMessageResult>(`/appeals/${id}/messages`, {
    method: 'POST',
    body: fd,
  })) as ApiResponse<AddMessageResult>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка отправки сообщения');
  await invalidateDetailCache(id);
  return resp.data;
}

export async function editAppealMessage(messageId: number, text: string): Promise<EditMessageResult> {
  const body = { text: text.trim() };
  if (!body.text) throw new Error('Текст сообщения не может быть пустым');

  const resp = (await apiClient<{ text: string }, EditMessageResult>(`/appeals/messages/${messageId}`, {
    method: 'PUT',
    body,
  })) as ApiResponse<EditMessageResult>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка редактирования сообщения');
  return resp.data;
}

export async function deleteAppealMessage(messageId: number): Promise<DeleteMessageResult> {
  const resp = (await apiClient<undefined, DeleteMessageResult>(`/appeals/messages/${messageId}`, {
    method: 'DELETE',
  })) as ApiResponse<DeleteMessageResult>;

  if (!resp.ok) throw new Error(resp.message || 'Ошибка удаления сообщения');
  return resp.data;
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
