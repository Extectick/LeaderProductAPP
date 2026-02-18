import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { AttachmentFile } from '@/components/ui/AttachmentsPicker';
import { addAppealMessage, type FileLike } from '@/utils/appealsService';
import {
  removeMessage,
  subscribe as subscribeAppealsStore,
  updateMessage,
  upsertMessage,
} from '@/utils/appealsStore';
import { getServerStatus, subscribeServerStatus } from '@/src/shared/network/serverStatus';
import { addMonitoringBreadcrumb, captureException } from '@/src/shared/monitoring';
import type { AppealAttachment, AppealMessage, UserMini } from '@/src/entities/appeal/types';

type OutboxAttachment = {
  uri: string;
  name: string;
  type: string;
  size?: number;
  lastModified?: number;
};

type OutboxStatus = 'pending' | 'failed';

export type AppealOutboxItem = {
  id: string;
  appealId: number;
  createdAt: string;
  attempts: number;
  nextRetryAt: number;
  status: OutboxStatus;
  lastError?: string;
  localMessageId: number;
  sender: UserMini;
  text?: string;
  attachments: OutboxAttachment[];
};

type OutboxState = {
  initialized: boolean;
  items: AppealOutboxItem[];
  flushing: boolean;
};

type Listener = (items: AppealOutboxItem[]) => void;

const STORAGE_KEY = 'appeals:outbox:v1';
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const BASE_RETRY_DELAY_MS = 2500;

const state: OutboxState = {
  initialized: false,
  items: [],
  flushing: false,
};

const listeners = new Set<Listener>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let autoFlushStarted = false;
let cleanupServerStatusSub: (() => void) | null = null;
let cleanupAppealsStoreSub: (() => void) | null = null;

function notify() {
  const snapshot = [...state.items].sort((a, b) => a.nextRetryAt - b.nextRetryAt);
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // noop
    }
  });
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  } catch {
    // noop
  }
}

function calcRetryDelay(attempt: number) {
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.max(1, 2 ** (attempt - 1)));
}

function makeOutboxId() {
  return `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeLocalMessageId() {
  return -Date.now() - Math.floor(Math.random() * 1000);
}

function resolveAttachmentType(mimeType?: string | null): AppealAttachment['fileType'] {
  const value = String(mimeType || '').toLowerCase();
  if (value.startsWith('image/')) return 'IMAGE';
  if (value.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

function toOutboxAttachment(file: AttachmentFile): OutboxAttachment {
  return {
    uri: file.uri,
    name: file.name || 'attachment',
    type: file.type || 'application/octet-stream',
    size: file.size,
    lastModified: file.lastModified,
  };
}

function toFileLike(file: OutboxAttachment): FileLike {
  return {
    uri: file.uri,
    name: file.name,
    type: file.type,
  };
}

function toOptimisticAttachments(files: OutboxAttachment[]): AppealAttachment[] {
  return files.map((file, index) => ({
    id: -(index + 1),
    fileUrl: file.uri,
    fileName: file.name,
    fileType: resolveAttachmentType(file.type),
  }));
}

function clearTimer() {
  if (!flushTimer) return;
  clearTimeout(flushTimer);
  flushTimer = null;
}

function scheduleFlush(delayMs = 0) {
  clearTimer();
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAppealsOutbox();
  }, Math.max(0, delayMs));
}

function scheduleNextByQueue() {
  const next = state.items
    .filter((item) => item.status !== 'pending' || item.nextRetryAt > Date.now())
    .sort((a, b) => a.nextRetryAt - b.nextRetryAt)[0];

  if (!next) return;
  const delay = Math.max(0, next.nextRetryAt - Date.now());
  scheduleFlush(delay);
}

async function upsertQueuedMessage(item: AppealOutboxItem) {
  const message: AppealMessage = {
    id: item.localMessageId,
    appealId: item.appealId,
    text: item.text || '',
    createdAt: item.createdAt,
    sender: item.sender,
    attachments: toOptimisticAttachments(item.attachments),
    isRead: true,
    readBy: [],
    localState: item.status,
    localError: item.lastError,
  };

  await upsertMessage(item.appealId, message, item.sender.id);
}

async function updateQueuedMessageState(item: AppealOutboxItem) {
  await updateMessage(item.appealId, item.localMessageId, {
    localState: item.status,
    localError: item.lastError,
  } as Partial<AppealMessage>);
}

function findItemIndex(id: string) {
  return state.items.findIndex((item) => item.id === id);
}

async function setItem(next: AppealOutboxItem) {
  const idx = findItemIndex(next.id);
  if (idx < 0) return;
  state.items[idx] = next;
  await persist();
  notify();
}

async function removeItem(id: string) {
  state.items = state.items.filter((item) => item.id !== id);
  await persist();
  notify();
}

async function markFailed(item: AppealOutboxItem, errorMessage: string) {
  const attempts = item.attempts + 1;
  const next: AppealOutboxItem = {
    ...item,
    attempts,
    status: 'failed',
    lastError: errorMessage,
    nextRetryAt: Date.now() + calcRetryDelay(attempts),
  };
  await setItem(next);
  await updateQueuedMessageState(next);
  addMonitoringBreadcrumb('appeals_outbox_failed', {
    appealId: item.appealId,
    localMessageId: item.localMessageId,
    attempts,
    error: errorMessage,
  });
}

function canFlushNow() {
  const server = getServerStatus();
  return server.isReachable;
}

function isRemoteUrl(uri: string) {
  return /^https?:\/\//i.test(uri);
}

async function ensureWebAttachmentsReadable(item: AppealOutboxItem) {
  if (Platform.OS !== 'web') return;
  for (const file of item.attachments) {
    if (!file.uri || isRemoteUrl(file.uri)) continue;
    try {
      const response = await fetch(file.uri);
      // Blob/file/data URL should be retrievable before upload.
      if (!response.ok && file.uri.startsWith('http')) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch {
      throw new Error(
        `Вложение "${file.name}" недоступно после перезапуска. Прикрепите файл снова и повторите отправку.`
      );
    }
  }
}

async function sendOutboxItem(item: AppealOutboxItem) {
  await ensureWebAttachmentsReadable(item);
  const files = item.attachments.map(toFileLike);
  const result = await addAppealMessage(item.appealId, {
    text: item.text,
    files,
  });

  const optimistic = toOptimisticAttachments(item.attachments);
  const fromResponse = Array.isArray((result as any)?.attachments)
    ? ((result as any).attachments as AppealAttachment[])
    : null;

  const delivered: AppealMessage = {
    id: result.id,
    appealId: item.appealId,
    text: item.text || '',
    createdAt: result.createdAt || new Date().toISOString(),
    sender: item.sender,
    attachments: fromResponse ?? optimistic,
    isRead: true,
    readBy: [],
  };

  await removeMessage(item.appealId, item.localMessageId);
  await upsertMessage(item.appealId, delivered, item.sender.id);
  await removeItem(item.id);
  addMonitoringBreadcrumb('appeals_outbox_sent', {
    appealId: item.appealId,
    localMessageId: item.localMessageId,
    remoteMessageId: result.id,
  });
}

export async function initAppealsOutbox() {
  if (state.initialized) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppealOutboxItem[];
      state.items = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    state.items = [];
  }

  state.initialized = true;

  // Ensure queued messages are visible after restart.
  for (const item of state.items) {
    await upsertQueuedMessage(item);
  }

  notify();
}

export function subscribeAppealsOutbox(listener: Listener) {
  listeners.add(listener);
  listener([...state.items]);
  return () => {
    listeners.delete(listener);
  };
}

export function getAppealsOutboxSnapshot() {
  return [...state.items];
}

export async function enqueueAppealOutboxMessage(payload: {
  appealId: number;
  sender: UserMini;
  text?: string;
  files?: AttachmentFile[];
}) {
  await initAppealsOutbox();

  const files = (payload.files || []).map(toOutboxAttachment);
  const nowIso = new Date().toISOString();
  const entry: AppealOutboxItem = {
    id: makeOutboxId(),
    appealId: payload.appealId,
    createdAt: nowIso,
    attempts: 0,
    nextRetryAt: Date.now(),
    status: 'pending',
    localMessageId: makeLocalMessageId(),
    sender: payload.sender,
    text: payload.text,
    attachments: files,
  };

  state.items.push(entry);
  await persist();
  notify();

  await upsertQueuedMessage(entry);
  addMonitoringBreadcrumb('appeals_outbox_queued', {
    appealId: payload.appealId,
    localMessageId: entry.localMessageId,
    hasText: Boolean(payload.text),
    attachmentsCount: files.length,
  });
  scheduleFlush(0);

  return entry;
}

export async function retryAppealsOutboxMessage(id: string) {
  await initAppealsOutbox();
  const idx = findItemIndex(id);
  if (idx < 0) return;

  const current = state.items[idx];
  const next: AppealOutboxItem = {
    ...current,
    status: 'pending',
    nextRetryAt: Date.now(),
    lastError: undefined,
  };
  await setItem(next);
  await updateQueuedMessageState(next);
  scheduleFlush(0);
}

function findItemByLocalMessage(appealId: number, localMessageId: number) {
  return state.items.find(
    (item) => item.appealId === appealId && item.localMessageId === localMessageId
  );
}

export async function retryAppealsOutboxMessageByLocalId(appealId: number, localMessageId: number) {
  await initAppealsOutbox();
  const item = findItemByLocalMessage(appealId, localMessageId);
  if (!item) return;
  await retryAppealsOutboxMessage(item.id);
}

export async function cancelAppealsOutboxMessageByLocalId(appealId: number, localMessageId: number) {
  await initAppealsOutbox();
  const item = findItemByLocalMessage(appealId, localMessageId);
  if (!item) return;
  await removeItem(item.id);
  await removeMessage(appealId, localMessageId);
  addMonitoringBreadcrumb('appeals_outbox_cancelled', {
    appealId,
    localMessageId,
  });
}

export async function flushAppealsOutbox() {
  await initAppealsOutbox();
  if (state.flushing) return;
  if (!canFlushNow()) {
    scheduleNextByQueue();
    return;
  }

  state.flushing = true;
  try {
    while (true) {
      const next = state.items
        .filter((item) => item.nextRetryAt <= Date.now())
        .sort((a, b) => a.nextRetryAt - b.nextRetryAt)[0];

      if (!next) break;

      const pending: AppealOutboxItem = {
        ...next,
        status: 'pending',
        lastError: undefined,
      };
      await setItem(pending);
      await updateQueuedMessageState(pending);

      try {
        await sendOutboxItem(pending);
      } catch (error: any) {
        const msg = error?.message || 'Не удалось отправить сообщение';
        captureException(error, {
          where: 'appeals_outbox_flush',
          appealId: pending.appealId,
          localMessageId: pending.localMessageId,
        });
        await markFailed(pending, msg);
      }
    }
  } finally {
    state.flushing = false;
    scheduleNextByQueue();
  }
}

export async function startAppealsOutboxAutoFlush() {
  if (autoFlushStarted) return;
  autoFlushStarted = true;
  await initAppealsOutbox();
  void flushAppealsOutbox();

  cleanupServerStatusSub = subscribeServerStatus((snapshot) => {
    if (!snapshot.isReachable) return;
    void flushAppealsOutbox();
  });

  // Reschedule after other parts of app mutate appeal store state.
  cleanupAppealsStoreSub = subscribeAppealsStore(() => {
    if (state.items.length === 0) return;
    scheduleFlush(1200);
  });
}

export function stopAppealsOutboxAutoFlush() {
  autoFlushStarted = false;
  cleanupServerStatusSub?.();
  cleanupServerStatusSub = null;
  cleanupAppealsStoreSub?.();
  cleanupAppealsStoreSub = null;
  clearTimer();
}
