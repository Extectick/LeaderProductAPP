// utils/apiClient.ts
import { API_BASE_URL } from './config';
import { getAccessToken, logout, refreshToken as refreshTokens } from './tokenService';

export interface ApiResponse<Res = any> {
  ok: boolean;
  data?: Res;
  message?: string;
  status: number;
}

interface RequestOptions<Req = any> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: Req | string | FormData;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export async function apiClient<Res = any, Req = any>(
  path: string,
  options: RequestOptions<Req> = {}
): Promise<ApiResponse<Res>> {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options;
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  let token = !skipAuth ? await getAccessToken() : null;
  const reqHeaders: Record<string, string> = {
    ...headers,
  };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (!isFormData) reqHeaders['Content-Type'] = reqHeaders['Content-Type'] ?? 'application/json';
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

  async function fetchWithToken(tk: string | null): Promise<Response> {
    const h = { ...reqHeaders };
    if (tk) h['Authorization'] = `Bearer ${tk}`;
    const reqBody: BodyInit | undefined =
      ['GET', 'HEAD'].includes(method)
        ? undefined
        : typeof body === 'string' || isFormData
        ? (body as any)
        : JSON.stringify(body);
    return fetch(url, { method, headers: h, body: reqBody });
  }

  try {
    let response = await fetchWithToken(token);
    if (response.status === 401 && !skipAuth) {
      const newToken = await refreshTokens();
      if (!newToken) {
        // do not clear tokens; return unauthorized to allow context handle
        return { ok: false, status: 401, message: 'Unauthorized - token expired' };
      }
      token = newToken;
      response = await fetchWithToken(token);
    }
    const status = response.status;
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    const responseData = json.data !== undefined ? json.data : json;
    if (!response.ok) {
      return {
        ok: false,
        status,
        message: json.message || json.error || `HTTP error ${status}`,
      };
    }
    return { ok: true, status, data: responseData as Res };
  } catch (error: any) {
    console.error('apiClient fetch error:', error);
    return { ok: false, status: 0, message: error?.message || 'Network error' };
  }
}