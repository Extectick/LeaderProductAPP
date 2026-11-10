import { API_BASE_URL } from '@/utils/config';
import { jwtDecode } from 'jwt-decode';
import {
  getLastRefreshFailure,
  getAccessTokenForRequest,
  handleBackendUnavailable,
  hasAuthSessionExpired,
  logout,
  refreshToken as refreshTokens,
} from '@/utils/tokenService';
import { mapHttpStatusToErrorCode, type AppErrorCode } from '@/src/shared/errors/appError';
import { SERVER_CONNECTION_UNAVAILABLE_MESSAGE } from '@/src/shared/errors/userErrorMessage';
import { setServerReachable, setServerUnavailable } from '@/src/shared/network/serverStatus';
import { addMonitoringBreadcrumb } from '@/src/shared/monitoring';
import { withDeadline } from '@/src/shared/network/withDeadline';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

type BodyLike = any; // JSON | FormData | string | Blob | ArrayBuffer
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const AUTH_WAIT_TIMEOUT_MS = 15_000;
const DEFAULT_GET_NETWORK_RETRY_DELAYS_MS = [350, 1_000] as const;

export interface HttpResponse<T> {
  ok: boolean;
  data?: T;
  meta?: any;
  message?: string;
  status: number;
  errorCode?: AppErrorCode;
  backendErrorCode?: string;
  errorDetails?: any;
}

export interface HttpRequestOptions<Req> {
  /** Pin credential-bearing requests to the initiating account, including token-refresh retries. */
  expectedUserId?: number;
  method?: HttpMethod;
  body?: Req | BodyLike;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  timeoutMs?: number;
  /** Network-only GET retries before response headers. Mutations are not replayed. */
  networkRetryCount?: number;
  /** Cancels a request that is no longer useful (for example, after changing a filter). */
  signal?: AbortSignal;
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
): Promise<{ data: Res | undefined; meta?: any; message?: string; backendErrorCode?: string; errorDetails?: any }> {
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
    const message = (json && (json.message || (typeof json.error === 'string' ? json.error : undefined))) as string | undefined;
    const backendErrorCode = json && typeof json.error === 'object' ? json.error?.code : undefined;
    const errorDetails = json && typeof json.error === 'object' ? json.error?.details : undefined;
    return { data, meta, message, backendErrorCode, errorDetails };
  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw error;
    const text = await response.text();
    return { data: undefined, message: text || undefined };
  }
}

export async function httpRequest<Req = undefined, Res = any>(
  path: string,
  options: HttpRequestOptions<Req> = {}
): Promise<HttpResponse<Res>> {
  const { method = 'GET', body, headers = {}, skipAuth = false, timeoutMs, signal } = options;
  const effectiveTimeoutMs = timeoutMs === undefined ? DEFAULT_REQUEST_TIMEOUT_MS : timeoutMs;
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  let token: string | null = null;
  const isForm = isFormData(body);
  const isGetLike = method === 'GET';
  const networkRetryCount = isGetLike ? Math.max(0, Math.min(
    options.networkRetryCount ?? DEFAULT_GET_NETWORK_RETRY_DELAYS_MS.length,
    DEFAULT_GET_NETWORK_RETRY_DELAYS_MS.length
  )) : 0;

  type AttemptResult = { response: Response; parsed: Awaited<ReturnType<typeof parseResponse<Res>>> };
  async function doFetch(tk: string | null, onHeaders: () => void): Promise<AttemptResult> {
    if (options.expectedUserId !== undefined) {
      let matches = false;
      try { matches = Number(jwtDecode<{ userId?: number }>(tk || '').userId) === options.expectedUserId; } catch { /* fail closed */ }
      if (!matches) throw new Error('ACCOUNT_CHANGED');
    }
    const h = buildHeaders(headers, tk, isForm);
    let reqBody: BodyInit | undefined;
    if (!isGetLike) {
      if (isForm || isBlob(body) || typeof body === 'string') {
        reqBody = body as any;
      } else if (body !== undefined) {
        reqBody = JSON.stringify(body);
      }
    }
    if (signal?.aborted) {
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      throw error;
    }
    const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
    let stopped = false;
    let rejectWait!: (error: Error) => void;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectWait = reject; });
    const stop = (name: 'AbortError' | 'TimeoutError') => {
      if (stopped) return;
      stopped = true;
      rejectWait(Object.assign(new Error(name === 'AbortError' ? 'Request aborted' : 'Request timed out'), { name }));
      controller?.abort();
    };
    const abortFromCaller = () => stop('AbortError');
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = effectiveTimeoutMs && effectiveTimeoutMs > 0
      ? setTimeout(() => stop('TimeoutError'), effectiveTimeoutMs)
      : null;
    try {
      const work = (async () => {
        const response = await fetch(url, { method, headers: h, body: reqBody, signal: controller?.signal ?? signal });
        onHeaders();
        if (stopped) throw Object.assign(new Error('Request aborted'), { name: 'AbortError' });
        const parsed = await parseResponse<Res>(response);
        return { response, parsed };
      })();
      // Keep both cancellation and the deadline alive while the response body is
      // read. The race also bounds native fetch implementations that ignore abort.
      return await Promise.race([work, interrupted]);
    } finally {
      stopped = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  async function doFetchWithNetworkRetry(tk: string | null): Promise<AttemptResult> {
    let attempt = 0;
    while (true) {
      let receivedHeaders = false;
      try {
        return await doFetch(tk, () => { receivedHeaders = true; });
      } catch (error: any) {
        // A timeout already consumed the complete request budget. Repeating it
        // would turn a 10 second timeout into a long frozen screen.
        const canRetry = !receivedHeaders && error?.name !== 'AbortError' && error?.name !== 'TimeoutError'
          && error?.message !== 'ACCOUNT_CHANGED' && attempt < networkRetryCount;
        if (!canRetry) throw error;
        const retryDelay = DEFAULT_GET_NETWORK_RETRY_DELAYS_MS[attempt] ?? 1_000;
        addMonitoringBreadcrumb('http_network_retry', { path, attempt: attempt + 1, retryDelay });
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  try {
    if (signal?.aborted) throw Object.assign(new Error('Request aborted'), { name: 'AbortError' });
    token = !skipAuth ? await withDeadline(getAccessTokenForRequest(), AUTH_WAIT_TIMEOUT_MS, signal) : null;
    let result = await doFetchWithNetworkRetry(token);

    if (result.response.status === 401 && !skipAuth) {
      addMonitoringBreadcrumb('http_401_refresh_attempt', { path });
      const newToken = await withDeadline(refreshTokens(), AUTH_WAIT_TIMEOUT_MS, signal);
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
          setServerUnavailable(SERVER_CONNECTION_UNAVAILABLE_MESSAGE);
          return {
            ok: false,
            status: 0,
            message: SERVER_CONNECTION_UNAVAILABLE_MESSAGE,
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

        // A non-confirmed failure must not evict the user. It can be a
        // temporary SecureStore/second-runtime race; tokenService only marks
        // the session expired after a confirmed invalid refresh token.
        if (!failure || failure.kind === 'unknown') {
          return {
            ok: false,
            status: failure?.status || 503,
            message: failure?.message || 'Session refresh is still in progress. Please retry the request.',
            errorCode: failure?.status === 409 ? 'CONFLICT' : 'SERVER_ERROR',
          };
        }

        await logout();
        setServerReachable();
        return { ok: false, status: 401, message: 'Сессия истекла. Войдите заново.', errorCode: 'UNAUTHORIZED' };
      }
      token = newToken;
      result = await doFetchWithNetworkRetry(token);
    }

    setServerReachable();
    const { response, parsed } = result;
    const status = response.status;
    const { data, meta, message, backendErrorCode, errorDetails } = parsed;

    if (!response.ok) {
      addMonitoringBreadcrumb('http_error_response', { path, status });
      return {
        ok: false,
        status,
        message: message || `HTTP error ${status}`,
        errorCode: mapHttpStatusToErrorCode(status),
        backendErrorCode,
        errorDetails,
      };
    }

    return { ok: true, status, data, meta };
  } catch (error: any) {
    if (error?.message === 'ACCOUNT_CHANGED') {
      return { ok: false, status: 409, message: 'Учётная запись изменилась. Откройте форму заново.', errorCode: 'CONFLICT' };
    }
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      if (signal?.aborted) {
        return {
          ok: false,
          status: 499,
          message: 'Запрос отменён.',
        };
      }
      addMonitoringBreadcrumb('http_request_timeout', { path, timeoutMs: effectiveTimeoutMs });
      return {
        ok: false,
        status: 408,
        message: 'Операция выполняется дольше обычного. Повторите запрос.',
        errorCode: 'REQUEST_TIMEOUT',
      };
    }
    const technicalMessage = error?.name === 'AbortError'
      ? 'Request timeout'
      : error?.message || 'Network error';
    addMonitoringBreadcrumb('http_network_error', { path, message: technicalMessage });
    setServerUnavailable(SERVER_CONNECTION_UNAVAILABLE_MESSAGE);
    await handleBackendUnavailable(SERVER_CONNECTION_UNAVAILABLE_MESSAGE);
    return {
      ok: false,
      status: 0,
      message: SERVER_CONNECTION_UNAVAILABLE_MESSAGE,
      errorCode: 'NETWORK_UNAVAILABLE',
    };
  }
}
