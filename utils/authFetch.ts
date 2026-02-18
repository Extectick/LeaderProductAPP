import type { AxiosRequestConfig } from 'axios';
import { apiClient } from './apiClient';

/**
 * @deprecated Use `apiClient` directly. Kept as compatibility adapter.
 */
export async function authFetch<Req = any, Res = any>(
  url: string,
  config?: Omit<AxiosRequestConfig, 'url' | 'data'> & { body?: Req }
): Promise<{ ok: boolean; data?: Res; message?: string; status?: number }> {
  const response = await apiClient<Req, Res>(url, {
    method: (config?.method || 'GET') as any,
    body: config?.body,
    headers: (config?.headers || {}) as Record<string, string>,
  });
  return {
    ok: response.ok,
    data: response.data,
    message: response.message,
    status: response.status,
  };
}

export default authFetch;

