import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppealListItem, AppealMessage } from '@/types/appealsTypes';

type StoreState = {
  appeals: Record<number, AppealListItem>;
  messages: Record<number, AppealMessage[]>;
  messagesMeta: Record<number, { hasMore?: boolean; cursor?: any }>;
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
      state.messagesMeta = parsed.messagesMeta || {};
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
    const aDate = a.lastMessage?.createdAt || a.createdAt;
    const bDate = b.lastMessage?.createdAt || b.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
}

export function getMessages(appealId: number) {
  return state.messages[appealId] || [];
}

export async function upsertMessage(
  appealId: number,
  message: AppealMessage,
  currentUserId?: number
) {
  const msgs = state.messages[appealId] ? [...state.messages[appealId]] : [];
  const exists = msgs.find((m) => m.id === message.id);
  if (!exists) {
    msgs.push(message);
    state.messages[appealId] = msgs;
  }

  const appeal = state.appeals[appealId];
  if (appeal) {
    const isOwn = message.sender?.id === currentUserId;
    const unread = appeal.unreadCount ?? 0;
    state.appeals[appealId] = {
      ...appeal,
      lastMessage: message,
      unreadCount: isOwn ? unread : unread + 1,
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
  meta?: { hasMore?: boolean; cursor?: any }
) {
  state.messages[appealId] = messages;
  if (meta) state.messagesMeta[appealId] = meta;
  notify();
  await persist();
}

export async function appendMessages(
  appealId: number,
  messages: AppealMessage[],
  meta?: { hasMore?: boolean; cursor?: any }
) {
  const existing = state.messages[appealId] || [];
  state.messages[appealId] = [...messages, ...existing];
  if (meta) state.messagesMeta[appealId] = meta;
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
      const aDate = a.lastMessage?.createdAt || a.createdAt;
      const bDate = b.lastMessage?.createdAt || b.createdAt;
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
