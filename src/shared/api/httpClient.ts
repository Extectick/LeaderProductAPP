import { API_BASE_URL } from '@/utils/config';
import {
  getLastRefreshFailure,
  getAccessToken,
  handleBackendUnavailable,
  hasAuthSessionExpired,
  logout,
  refreshToken as refreshTokens,
} from '@/utils/tokenService';
import { mapHttpStatusToErrorCode, type AppErrorCode } from '@/src/shared/errors/appError';
import { setServerReachable, setServerUnavailable } from '@/src/shared/network/serverStatus';
import { addMonitoringBreadcrumb } from '@/src/shared/monitoring';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

type BodyLike = any; // JSON | FormData | string | Blob | ArrayBuffer
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export interface HttpResponse<T> {
  ok: boolean;
  data?: T;
  meta?: any;
  message?: string;
  status: number;
  errorCode?: AppErrorCode;
}

export interface HttpRequestOptions<Req> {
  method?: HttpMethod;
  body?: Req | BodyLike;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  timeoutMs?: number;
}

function isFormData(val: any): val is FormData {
  return typeof FormData !== 'undefined' && val instanceof FormData;
}

function isBlob(val: any): val is Blob {
  return typeof Blob !== 'undefined' && val instanceof Blob;
}

function buildHeaders(base: Record<string, string>, token: string | null, isForm: boolean) {
  const h: Record<string, string> = { ...base };
  if (!isForm) {
    if (!h['Content-Type']) h['Content-Type'] = 'application/json';
  } else if ('Content-Type' in h) {
    delete h['Content-Type'];
  }
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function parseResponse<Res>(
  response: Response
): Promise<{ data: Res | undefined; meta?: any; message?: string }> {
  const ct = response.headers.get('content-type') || '';
  const contentDisposition = response.headers.get('content-disposition') || '';
  const isBinaryAttachment =
    contentDisposition.toLowerCase().includes('attachment') ||
    ct.includes('text/csv') ||
    ct.includes('application/octet-stream') ||
    ct.includes('application/pdf') ||
    ct.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (isBinaryAttachment) {
    const blob = await response.blob();
    return { data: blob as unknown as Res };
  }

  try {
    const json = await response.clone().json();
    const data = json && typeof json === 'object' && 'data' in json ? (json.data as Res) : (json as Res);
    const meta = json && typeof json === 'object' && 'meta' in json ? json.meta : undefined;
    const message = (json && (json.message || json.error)) as string | undefined;
    return { data, meta, message };
  } catch {
    const text = await response.text();
    return { data: undefined, message: text || undefined };
  }
}

export async function httpRequest<Req = undefined, Res = any>(
  path: string,
  options: HttpRequestOptions<Req> = {}
): Promise<HttpResponse<Res>> {
  const { method = 'GET', body, headers = {}, skipAuth = false, timeoutMs } = options;
  const effectiveTimeoutMs = timeoutMs === undefined ? DEFAULT_REQUEST_TIMEOUT_MS : timeoutMs;
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  let token = !skipAuth ? await getAccessToken() : null;
  const isForm = isFormData(body);
  const isGetLike = method === 'GET';

  async function doFetch(tk: string | null): Promise<Response> {
    const h = buildHeaders(headers, tk, isForm);
    let reqBody: BodyInit | undefined;
    if (!isGetLike) {
      if (isForm || isBlob(body) || typeof body === 'string') {
        reqBody = body as any;
      } else if (body !== undefined) {
        reqBody = JSON.stringify(body);
      }
    }
    if (!effectiveTimeoutMs || effectiveTimeoutMs <= 0 || typeof AbortController === 'undefined') {
      return fetch(url, { method, headers: h, body: reqBody });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    try {
      return await fetch(url, { method, headers: h, body: reqBody, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let response = await doFetch(token);

    if (response.status === 401 && !skipAuth) {
      addMonitoringBreadcrumb('http_401_refresh_attempt', { path });
      const newToken = await refreshTokens();
      if (!newToken) {
        addMonitoringBreadcrumb('http_401_refresh_failed', { path });
        const failure = getLastRefreshFailure();
        if (hasAuthSessionExpired() || failure?.kind === 'invalid') {
          setServerReachable();
          return {
            ok: false,
            status: 401,
            message: 'Сессия истекла. Войдите заново.',
            errorCode: 'UNAUTHORIZED',
          };
        }

        if (failure?.kind === 'network') {
          return {
            ok: false,
            status: 0,
            message: failure.message || 'Не удалось обновить сессию: сервер недоступен.',
            errorCode: 'NETWORK_UNAVAILABLE',
          };
        }

        if (failure?.kind === 'server') {
          return {
            ok: false,
            status: failure.status || 503,
            message: failure.message || 'Не удалось обновить сессию: ошибка сервера.',
            errorCode: 'SERVER_ERROR',
          };
        }

        if (failure?.kind === 'rotated') {
          return {
            ok: false,
            status: failure.status || 409,
            message: failure.message || 'Refresh token is being rotated by another runtime. Retry the request.',
            errorCode: 'CONFLICT',
          };
        }

        await logout();
        setServerReachable();
        return { ok: false, status: 401, message: 'Сессия истекла. Войдите заново.', errorCode: 'UNAUTHORIZED' };
      }
      token = newToken;
      response = await doFetch(token);
    }

    setServerReachable();
    const status = response.status;
    const { data, meta, message } = await parseResponse<Res>(response);

    if (!response.ok) {
      addMonitoringBreadcrumb('http_error_response', { path, status });
      return {
        ok: false,
        status,
        message: message || `HTTP error ${status}`,
        errorCode: mapHttpStatusToErrorCode(status),
      };
    }

    return { ok: true, status, data, meta };
  } catch (error: any) {
    const message = error?.name === 'AbortError'
      ? 'Request timeout'
      : error?.message || 'Network error';
    addMonitoringBreadcrumb('http_network_error', { path, message });
    setServerUnavailable(message);
    await handleBackendUnavailable(message);
    return {
      ok: false,
      status: 0,
      message,
      errorCode: 'NETWORK_UNAVAILABLE',
    };
  }
}
