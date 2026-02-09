import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppealListItem, AppealMessage } from '@/types/appealsTypes';

type MessagesMeta = {
  hasMoreBefore: boolean;
  prevCursor: string | null;
  hasMoreAfter: boolean;
  nextCursor: string | null;
  anchorMessageId: number | null;
};

type StoreState = {
  appeals: Record<number, AppealListItem>;
  messages: Record<number, AppealMessage[]>;
  messagesMeta: Record<number, MessagesMeta>;
  lists: Record<
    string,
    {
      ids: number[];
      meta?: { total?: number; limit?: number; offset?: number };
      lastFetched?: number;
    }
  >;
};

type Listener = (state: StoreState) => void;

const STORAGE_KEY = 'appealsStore:v1';

const state: StoreState = {
  appeals: {},
  messages: {},
  messagesMeta: {},
  lists: {},
};

const listeners: Listener[] = [];

const defaultMessagesMeta = (): MessagesMeta => ({
  hasMoreBefore: false,
  prevCursor: null,
  hasMoreAfter: false,
  nextCursor: null,
  anchorMessageId: null,
});

function mergeMessagesAsc(existing: AppealMessage[], incoming: AppealMessage[]) {
  const map = new Map<number, AppealMessage>();
  [...existing, ...incoming].forEach((m) => map.set(m.id, { ...map.get(m.id), ...m }));
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function notify() {
  const snapshot = getState();
  listeners.forEach((l) => l(snapshot));
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function getState(): StoreState {
  return {
    appeals: { ...state.appeals },
    messages: { ...state.messages },
    messagesMeta: { ...state.messagesMeta },
    lists: { ...state.lists },
  };
}

export async function initAppealsStore() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoreState;
      state.appeals = parsed.appeals || {};
      state.messages = parsed.messages || {};
      state.messagesMeta = Object.fromEntries(
        Object.entries(parsed.messagesMeta || {}).map(([appealId, meta]: any) => [
          appealId,
          {
            ...defaultMessagesMeta(),
            hasMoreBefore: meta?.hasMoreBefore ?? meta?.hasMore ?? false,
            prevCursor: meta?.prevCursor ?? meta?.cursor ?? null,
            hasMoreAfter: meta?.hasMoreAfter ?? false,
            nextCursor: meta?.nextCursor ?? null,
            anchorMessageId: meta?.anchorMessageId ?? null,
          },
        ])
      ) as Record<number, MessagesMeta>;
      state.lists = parsed.lists || {};
    }
  } catch {}
  notify();
}

export function subscribe(listener: Listener) {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export async function setAppeals(list: AppealListItem[]) {
  const next: Record<number, AppealListItem> = { ...state.appeals };
  list.forEach((a) => {
    next[a.id] = { ...(next[a.id] || {}), ...a };
  });
  state.appeals = next;
  notify();
  await persist();
}

function bumpAppealInLists(appealId: number) {
  Object.keys(state.lists).forEach((key) => {
    const ids = state.lists[key]?.ids || [];
    if (!ids.includes(appealId)) return;
    const filtered = ids.filter((id) => id !== appealId);
    state.lists[key] = {
      ...state.lists[key],
      ids: [appealId, ...filtered],
    };
  });
}

export function getAppealsArray() {
  return Object.values(state.appeals).sort((a, b) => {
    const aDate = a.lastMessage?.createdAt || (a as any).updatedAt || a.createdAt;
    const bDate = b.lastMessage?.createdAt || (b as any).updatedAt || b.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
}

export function getMessages(appealId: number) {
  return state.messages[appealId] || [];
}

export function getMessagesMeta(appealId: number) {
  return state.messagesMeta[appealId] || defaultMessagesMeta();
}

export async function upsertMessage(
  appealId: number,
  message: AppealMessage,
  currentUserId?: number
) {
  const msgs = state.messages[appealId] ? [...state.messages[appealId]] : [];
  const exists = msgs.find((m) => m.id === message.id);
  const isNew = !exists;
  if (!exists) {
    msgs.push(message);
    state.messages[appealId] = mergeMessagesAsc([], msgs);
  } else {
    state.messages[appealId] = mergeMessagesAsc(
      [],
      msgs.map((m) => (m.id === message.id ? { ...m, ...message } : m))
    );
  }

  const appeal = state.appeals[appealId];
  if (appeal) {
    const isOwn = message.sender?.id === currentUserId;
    const unread = appeal.unreadCount ?? 0;
    state.appeals[appealId] = {
      ...appeal,
      lastMessage: message,
      unreadCount: isNew ? (isOwn ? unread : unread + 1) : unread,
    };
  } else {
    state.appeals[appealId] = {
      id: appealId,
      number: appealId,
      status: 'OPEN',
      priority: 'MEDIUM',
      createdAt: new Date().toISOString(),
      toDepartment: { id: 0, name: '' },
      assignees: [],
      lastMessage: message,
      unreadCount: message.sender?.id === currentUserId ? 0 : 1,
    } as AppealListItem;
  }

  bumpAppealInLists(appealId);
  notify();
  await persist();
}

export async function markAppealReadLocal(appealId: number) {
  const appeal = state.appeals[appealId];
  if (appeal) {
    state.appeals[appealId] = { ...appeal, unreadCount: 0 };
    notify();
    await persist();
  }
}

export async function setMessages(
  appealId: number,
  messages: AppealMessage[],
  meta?: Partial<MessagesMeta>
) {
  state.messages[appealId] = mergeMessagesAsc([], messages);
  state.messagesMeta[appealId] = {
    ...(state.messagesMeta[appealId] || defaultMessagesMeta()),
    ...(meta || {}),
  };
  notify();
  await persist();
}

export async function prependMessages(
  appealId: number,
  messages: AppealMessage[],
  meta?: Partial<MessagesMeta>
) {
  const existing = state.messages[appealId] || [];
  state.messages[appealId] = mergeMessagesAsc(existing, messages);
  state.messagesMeta[appealId] = {
    ...(state.messagesMeta[appealId] || defaultMessagesMeta()),
    ...(meta || {}),
  };
  notify();
  await persist();
}

export async function appendMessages(
  appealId: number,
  messages: AppealMessage[],
  meta?: Partial<MessagesMeta>
) {
  const existing = state.messages[appealId] || [];
  state.messages[appealId] = mergeMessagesAsc(existing, messages);
  state.messagesMeta[appealId] = {
    ...(state.messagesMeta[appealId] || defaultMessagesMeta()),
    ...(meta || {}),
  };
  notify();
  await persist();
}

export async function updateMessage(
  appealId: number,
  messageId: number,
  patch: Partial<AppealMessage>
) {
  const existing = state.messages[appealId] || [];
  const next = existing.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
  state.messages[appealId] = next;
  const appeal = state.appeals[appealId];
  if (appeal?.lastMessage?.id === messageId) {
    state.appeals[appealId] = { ...appeal, lastMessage: { ...appeal.lastMessage, ...patch } as any };
  }
  notify();
  await persist();
}

export async function removeMessage(appealId: number, messageId: number) {
  const existing = state.messages[appealId] || [];
  const next = existing.filter((m) => m.id !== messageId);
  state.messages[appealId] = next;
  const appeal = state.appeals[appealId];
  if (appeal?.lastMessage?.id === messageId) {
    state.appeals[appealId] = { ...appeal, lastMessage: next[next.length - 1] ?? null } as any;
  }
  notify();
  await persist();
}

export async function patchAppeal(appealId: number, patch: Partial<AppealListItem>) {
  const existing = state.appeals[appealId];
  if (!existing) return;
  state.appeals[appealId] = { ...existing, ...patch };
  bumpAppealInLists(appealId);
  notify();
  await persist();
}

export async function applyMessageReads(
  appealId: number,
  messageIds: number[],
  userId: number,
  readAt: string,
  viewerId: number = userId
) {
  const idSet = new Set(messageIds);
  const existing = state.messages[appealId] || [];
  const next = existing.map((m) => {
    if (!idSet.has(m.id)) return m;
    const already = (m.readBy || []).some((r) => r.userId === userId);
    const readBy = already ? (m.readBy || []) : [...(m.readBy || []), { userId, readAt }];
    const isSelf = userId === viewerId;
    return { ...m, isRead: isSelf ? true : m.isRead, readBy };
  });
  state.messages[appealId] = next;
  notify();
  await persist();
}

export function getListSnapshot(listKey: string) {
  const entry = state.lists[listKey];
  const ids = entry?.ids || [];
  const items = ids
    .map((id) => state.appeals[id])
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = a.lastMessage?.createdAt || (a as any).updatedAt || a.createdAt;
      const bDate = b.lastMessage?.createdAt || (b as any).updatedAt || b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

  return { items, meta: entry?.meta, lastFetched: entry?.lastFetched };
}

export async function setListPage(
  listKey: string,
  pageItems: AppealListItem[],
  meta?: { total?: number; limit?: number; offset?: number },
  replace = false
) {
  const merged: Record<number, AppealListItem> = { ...state.appeals };
  pageItems.forEach((a) => {
    merged[a.id] = { ...(merged[a.id] || {}), ...a };
  });
  state.appeals = merged;

  const existingIds = replace ? [] : state.lists[listKey]?.ids || [];
  const newIds = pageItems.map((a) => a.id);
  const uniqIds = Array.from(new Set([...existingIds, ...newIds]));

  state.lists[listKey] = {
    ids: uniqIds,
    meta: meta ? { ...state.lists[listKey]?.meta, ...meta } : state.lists[listKey]?.meta,
    lastFetched: Date.now(),
  };

  notify();
  await persist();
}

export async function appendListPage(
  listKey: string,
  pageItems: AppealListItem[],
  meta?: { total?: number; limit?: number; offset?: number }
) {
  return setListPage(listKey, pageItems, meta, false);
}
