import { apiClient } from '@/utils/apiClient';
import { API_ENDPOINTS } from '@/utils/apiEndpoints';

export type PresenceInfo = {
  userId: number;
  isOnline: boolean;
  lastSeenAt: string | null;
};

export async function pingPresence() {
  const res = await apiClient<void, { ok: boolean }>(API_ENDPOINTS.USERS.PRESENCE_PING, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(res.message || 'Presence ping failed');
  return true;
}

export async function getPresence(userIds: number[]): Promise<PresenceInfo[]> {
  const ids = Array.from(new Set(userIds.filter((id) => Number.isFinite(id))));
  if (!ids.length) return [];
  const res = await apiClient<void, PresenceInfo[]>(API_ENDPOINTS.USERS.PRESENCE(ids));
  if (!res.ok) throw new Error(res.message || 'Presence fetch failed');
  return res.data || [];
}
