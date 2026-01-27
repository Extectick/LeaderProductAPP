import axios from 'axios';
import { Platform } from 'react-native';

import { apiClient } from './apiClient';
import { API_BASE_URL } from './config';
import { getAccessToken, refreshToken as refreshAccessToken } from './tokenService';

const UPDATE_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

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

export async function uploadUpdateWithProgress(
  form: FormData,
  onProgress?: (percent: number) => void
) {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is missing');
  }

  const sendWithAxios = async (token?: string | null) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await axios.post(`${API_BASE_URL}/updates/upload`, form, {
      headers,
      timeout: UPDATE_UPLOAD_TIMEOUT_MS,
      onUploadProgress: (evt) => {
        if (!evt.total) return;
        const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
        if (onProgress) onProgress(percent);
      },
    });

    const payload = response.data?.data ?? response.data;
    return payload as UpdateItem;
  };

  const sendWithXHR = async (token?: string | null) => {
    return await new Promise<UpdateItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/updates/upload`);
      xhr.timeout = UPDATE_UPLOAD_TIMEOUT_MS;
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (!evt.lengthComputable) return;
          const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
          onProgress(percent);
        };
      }

      xhr.onload = () => {
        const status = xhr.status || 0;
        const text = xhr.responseText || '';
        let data: any;
        try {
          data = xhr.responseType === 'json' ? xhr.response : JSON.parse(text);
        } catch {
          data = undefined;
        }
        const payload = data?.data ?? data;
        if (status >= 200 && status < 300) {
          resolve(payload as UpdateItem);
          return;
        }
        const message =
          data?.message || data?.error || text || `HTTP error ${status}`;
        reject({ status, message });
      };

      xhr.onerror = () => reject({ status: 0, message: 'Network error' });
      xhr.ontimeout = () => reject({ status: 0, message: 'Upload timeout' });

      xhr.send(form);
    });
  };

  const token = await getAccessToken();
  try {
    if (Platform.OS === 'web') {
      return await sendWithAxios(token);
    }
    return await sendWithXHR(token);
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status;
    if (status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        if (Platform.OS === 'web') {
          return await sendWithAxios(refreshed);
        }
        return await sendWithXHR(refreshed);
      }
    }
    const message =
      e?.response?.data?.message || e?.message || 'Не удалось загрузить обновление';
    throw new Error(message);
  }
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
