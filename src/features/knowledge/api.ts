import { apiClient } from '@/utils/apiClient';
import type { HttpRequestOptions } from '@/src/shared/api/httpClient';
import type { KnowledgeClient } from './types';

export class KnowledgeRequestError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function request<T>(path: string, options: HttpRequestOptions<unknown> = {}): Promise<T> {
  const response = await apiClient<unknown, T>(`/knowledge${path}`, { timeoutMs: 35000, ...options });
  if (!response.ok) {
    const code = (response.data as { code?: string } | undefined)?.code || response.backendErrorCode || response.errorCode || '';
    throw new KnowledgeRequestError(response.status, code, response.message || 'Не удалось выполнить запрос. Попробуйте ещё раз.');
  }
  return response.data!;
}
const query = (values: Record<string, unknown>) => Object.entries(values).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&');
export const knowledgeApi: KnowledgeClient = {
  config: signal => request('/config', { signal }),
  sources: signal => request('/sources', { signal }),
  documents: (values, signal) => request(`/documents?${query({ ...values, limit: 30 })}`, { signal }),
  document: (id, signal) => request(`/documents/${id}`, { signal }),
  preview: (id, revision, signal) => request(`/documents/${id}/versions/${revision}`, { signal }),
  versions: (id, before, signal) => request(`/documents/${id}/versions?${query({ before })}`, { signal }),
  audit: (id, signal) => request(`/documents/${id}/audit`, { signal }),
  audience: (kind, values, signal) => request(`/audience?${query({ ...values, kind, ids: values.ids?.join(',') })}`, { signal }),
  publish: (id, versionId, audience) => request(`/documents/${id}/publish`, { method: 'POST', body: { versionId, ...audience }, networkRetryCount: 0 }),
  revoke: id => request(`/documents/${id}/revoke`, { method: 'POST', body: {}, networkRetryCount: 0 }),
  retry: id => request(`/documents/${id}/retry`, { method: 'POST', body: {}, networkRetryCount: 0 }),
  sync: id => request(`/sources/${id}/sync`, { method: 'POST', body: {}, networkRetryCount: 0 }),
};
