import { httpRequest } from '@/src/shared/api/httpClient';

export type OnecConnection = {
  baseKey: string; label: string; login: string; displayName: string | null; loginLocked: boolean; mapped: boolean;
  connected: boolean; verifiedAt: string | null;
};
export async function loadOnecConnections(userId: number, signal: AbortSignal) {
  const r = await httpRequest<undefined, OnecConnection[]>('/users/me/onec-connections', { expectedUserId: userId, signal, networkRetryCount: 0 });
  if (!r.ok || !r.data) throw new Error(r.message || 'Не удалось получить подключения 1С.');
  return r.data;
}
export async function saveOnecConnection(userId: number, baseKey: string, login: string, password: string, signal: AbortSignal) {
  const r = await httpRequest<{ login: string; password: string }, OnecConnection>(`/users/me/onec-connections/${encodeURIComponent(baseKey)}`, {
    method: 'PUT', body: { login, password }, expectedUserId: userId, signal, timeoutMs: 30000, networkRetryCount: 0,
  });
  if (!r.ok || !r.data) throw new Error(r.message || 'Не удалось подключиться к 1С.');
  return r.data;
}
export async function removeOnecConnection(userId: number, baseKey: string, signal: AbortSignal) {
  const r = await httpRequest<undefined, OnecConnection>(`/users/me/onec-connections/${encodeURIComponent(baseKey)}`, { method: 'DELETE', expectedUserId: userId, signal, networkRetryCount: 0 });
  if (!r.ok || !r.data) throw new Error(r.message || 'Не удалось отключить 1С.');
  return r.data;
}
