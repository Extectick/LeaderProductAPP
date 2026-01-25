import { apiClient } from './apiClient';

export type UpdateItem = {
  id: number;
  platform: 'ANDROID' | 'IOS';
  channel: string;
  versionCode: number;
  versionName: string;
  minSupportedVersionCode: number;
  isMandatory: boolean;
  rolloutPercent: number;
  isActive: boolean;
  releaseNotes?: string | null;
  storeUrl?: string | null;
  apkKey?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
  checksumMd5?: string | null;
  createdAt: string;
};

export type UpdatesListResult = {
  data: UpdateItem[];
  meta: { total: number; limit: number; offset: number };
};

type UpdatesListParams = {
  platform?: 'android' | 'ios';
  channel?: string;
  limit?: number;
  offset?: number;
};

export async function getUpdatesList(params: UpdatesListParams = {}) {
  const query = new URLSearchParams();
  if (params.platform) query.set('platform', params.platform);
  if (params.channel) query.set('channel', params.channel);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const resp = await apiClient<undefined, UpdatesListResult>(`/updates${suffix}`, {
    method: 'GET',
  });
  if (!resp.ok) throw new Error(resp.message || 'Не удалось загрузить обновления');
  return resp.data!;
}

export type UpdatePayload = {
  platform: 'android' | 'ios';
  channel?: string;
  versionCode: number;
  versionName: string;
  minSupportedVersionCode: number;
  isMandatory?: boolean;
  rolloutPercent?: number;
  isActive?: boolean;
  releaseNotes?: string | null;
  storeUrl?: string | null;
  apkKey?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
  checksumMd5?: string | null;
};

export async function createUpdate(payload: UpdatePayload) {
  const resp = await apiClient<UpdatePayload, UpdateItem>('/updates', {
    method: 'POST',
    body: payload,
  });
  if (!resp.ok) throw new Error(resp.message || 'Не удалось создать обновление');
  return resp.data!;
}

export async function uploadUpdate(form: FormData) {
  const resp = await apiClient<FormData, UpdateItem>('/updates/upload', {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) throw new Error(resp.message || 'Не удалось загрузить обновление');
  return resp.data!;
}

export async function updateUpdate(id: number, patch: Partial<UpdatePayload>) {
  const resp = await apiClient<Partial<UpdatePayload>, UpdateItem>(`/updates/${id}`, {
    method: 'PUT',
    body: patch,
  });
  if (!resp.ok) throw new Error(resp.message || 'Не удалось обновить запись');
  return resp.data!;
}

export async function deleteUpdate(id: number, purgeFile = true) {
  const suffix = purgeFile ? '?purgeFile=1' : '';
  const resp = await apiClient<undefined, { id: number }>(`/updates/${id}${suffix}`, {
    method: 'DELETE',
  });
  if (!resp.ok) throw new Error(resp.message || 'Не удалось удалить обновление');
  return resp.data!;
}

export async function cleanupUpdates(payload: {
  platform?: 'android' | 'ios';
  channel?: string;
  keepLatest?: number;
  purgeFile?: boolean;
}) {
  const resp = await apiClient<typeof payload, { deletedCount: number; deletedIds: number[] }>(
    '/updates/cleanup',
    {
      method: 'POST',
      body: payload,
    }
  );
  if (!resp.ok) throw new Error(resp.message || 'Не удалось выполнить очистку');
  return resp.data!;
}
