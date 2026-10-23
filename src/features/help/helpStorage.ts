import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/utils/config';
import type { HelpCreateInput, HelpMessageInput } from './helpApi';

export type HelpPending = { key: string; ticketId?: number; create: boolean; action?: 'close' | 'reopen'; input: HelpCreateInput & {rating?:number}; createdAt: number };
const writes = new Map<string, Promise<unknown>>();
export const helpStorageKey = (userId: number, name: string) => `help:v1:${encodeURIComponent(API_BASE_URL)}:${userId}:${name}`;
export const helpClientId = () => `help-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
async function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = writes.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  writes.set(key, next);
  try { return await next; } finally { if (writes.get(key) === next) writes.delete(key); }
}
export async function readHelpPending(userId: number): Promise<HelpPending[]> {
  const key = helpStorageKey(userId, 'pending');
  await writes.get(key)?.catch(() => {});
  const value = await AsyncStorage.getItem(key);
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Не удалось прочитать сохранённые сообщения');
  return parsed;
}
export async function saveHelpPending(userId: number, item: HelpPending) {
  const key = helpStorageKey(userId, 'pending');
  return serialized(key, async () => {
    const items: HelpPending[] = JSON.parse(await AsyncStorage.getItem(key) || '[]');
    const existing = items.find((x) => x.key === item.key);
    if (existing && JSON.stringify(existing.input) !== JSON.stringify(item.input)) throw new Error('Нельзя изменять сообщение с неопределённым результатом отправки. Сначала повторите отправку.');
    if (!existing) await AsyncStorage.setItem(key, JSON.stringify([...items, item]));
  });
}
export async function removeHelpPending(userId: number, id: string) {
  const key = helpStorageKey(userId, 'pending');
  return serialized(key, async () => {
    const items: HelpPending[] = JSON.parse(await AsyncStorage.getItem(key) || '[]');
    await AsyncStorage.setItem(key, JSON.stringify(items.filter((x) => x.key !== id)));
  });
}
export async function getHelpDraft(userId: number, key: string) {
  const storage = helpStorageKey(userId, `draft:${key}`);
  await writes.get(storage)?.catch(() => {});
  return await AsyncStorage.getItem(storage) || '';
}
export async function setHelpDraft(userId: number, key: string, text: string) {
  const storage = helpStorageKey(userId, `draft:${key}`);
  return serialized(storage, () => text ? AsyncStorage.setItem(storage, text) : AsyncStorage.removeItem(storage));
}
export function sameHelpPayload(a: HelpMessageInput, b: HelpMessageInput) {
  return a.text === b.text && JSON.stringify(a.attachmentIds || []) === JSON.stringify(b.attachmentIds || [])
    && a.replyToId === b.replyToId && a.forwardedFromId === b.forwardedFromId;
}
