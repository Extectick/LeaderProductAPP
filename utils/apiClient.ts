// utils/apiClient.ts
import { getAccessToken, logout, refreshToken as refreshTokens } from './tokenService';
import { API_BASE_URL } from './config';

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  message?: string;
  status: number;
}

type BodyLike = any; // JSON | FormData | string | Blob | ArrayBuffer

interface RequestOptions<Req> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: Req | BodyLike;
  headers?: Record<string, string>;
  skipAuth?: boolean; // если не нужен токен
}

/** Определяем, FormData ли это */
function isFormData(val: any): val is FormData {
  return typeof FormData !== 'undefined' && val instanceof FormData;
}

/** Определяем, Blob ли это */
function isBlob(val: any): val is Blob {
  return typeof Blob !== 'undefined' && val instanceof Blob;
}

/** Собираем заголовки: для FormData НИЧЕГО не ставим */
function buildHeaders(base: Record<string, string>, token: string | null, isForm: boolean) {
  const h: Record<string, string> = { ...base };
  if (!isForm) {
    // Для JSON/текста
    if (!h['Content-Type']) h['Content-Type'] = 'application/json';
  } else {
    // Для FormData content-type с boundary проставит fetch сам
    if ('Content-Type' in h) delete h['Content-Type'];
  }
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/** Парсинг ответа: JSON если можно, иначе Blob/текст */
async function parseResponse<Res>(response: Response): Promise<{ data: Res | undefined; message?: string }> {
  const ct = response.headers.get('content-type') || '';

  // CSV / бинарные
  if (ct.includes('text/csv') || ct.includes('application/octet-stream') || ct.includes('application/pdf')) {
    const blob = await response.blob();
    return { data: blob as unknown as Res };
  }

  // Попробуем JSON
  try {
    const json = await response.json();
    const data = (json && typeof json === 'object' && 'data' in json) ? (json.data as Res) : (json as Res);
    const message = (json && (json.message || json.error)) as string | undefined;
    return { data, message };
  } catch {
    // Не JSON — отдадим текст
    const text = await response.text();
    return { data: undefined, message: text || undefined };
  }
}

/**
 * Универсальная функция для API запросов с автоматическим добавлением токенов и обновлением при 401.
 */
export async function apiClient<Req = undefined, Res = any>(
  path: string,
  options: RequestOptions<Req> = {}
): Promise<ApiResponse<Res>> {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options;
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  let token = !skipAuth ? await getAccessToken() : null;

  const isForm = isFormData(body);
  const isGetLike = method === 'GET';

  async function doFetch(tk: string | null): Promise<Response> {
    const h = buildHeaders(headers, tk, isForm);

    let reqBody: BodyInit | undefined;
    if (!isGetLike) {
      if (isForm) {
        reqBody = body as any; // FormData отдаём как есть
      } else if (isBlob(body)) {
        reqBody = body as any;
      } else if (typeof body === 'string') {
        // предполагаем что строка уже сериализована снаружи
        reqBody = body as any;
      } else if (body !== undefined) {
        // JSON
        reqBody = JSON.stringify(body);
      }
    }

    return fetch(url, { method, headers: h, body: reqBody });
  }

  try {
    let response = await doFetch(token);

    if (response.status === 401 && !skipAuth) {
      const newToken = await refreshTokens();
      if (!newToken) {
        await logout();
        return { ok: false, status: 401, message: 'Unauthorized - token expired' };
      }
      token = newToken;
      response = await doFetch(token);
    }

    const status = response.status;
    const { data, message } = await parseResponse<Res>(response);

    if (!response.ok) {
      return {
        ok: false,
        status,
        message: message || `HTTP error ${status}`,
      };
    }

    return { ok: true, status, data };
  } catch (error: any) {
    console.error('apiClient fetch error:', error);
    return {
      ok: false,
      status: 0,
      message: error?.message || 'Network error',
    };
  }
}
