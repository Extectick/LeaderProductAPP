import { httpRequest } from '../src/shared/api/httpClient';
import {
  getLastRefreshFailure,
  getAccessTokenForRequest,
  handleBackendUnavailable,
  hasAuthSessionExpired,
  logout,
  refreshToken,
} from '@/utils/tokenService';
import { setServerReachable, setServerUnavailable } from '@/src/shared/network/serverStatus';

jest.mock('@/utils/config', () => ({
  API_BASE_URL: 'http://api.test',
}));

jest.mock('@/utils/tokenService', () => ({
  getAccessTokenForRequest: jest.fn(async () => null),
  getLastRefreshFailure: jest.fn(() => null),
  handleBackendUnavailable: jest.fn(async () => undefined),
  hasAuthSessionExpired: jest.fn(() => false),
  logout: jest.fn(async () => undefined),
  refreshToken: jest.fn(async () => null),
}));

jest.mock('@/src/shared/network/serverStatus', () => ({
  setServerReachable: jest.fn(),
  setServerUnavailable: jest.fn(),
}));

jest.mock('@/src/shared/monitoring', () => ({
  addMonitoringBreadcrumb: jest.fn(),
}));

describe('httpRequest', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('preserves the structured order review instead of losing confirmation details', async () => {
    const details = { kind: 'ORDER_CHANGE_REVIEW_REQUIRED', confirmationToken: 'signed', baseContentToken: 'base', changes: [] };
    const json = { ok: false, message: 'Подтвердите изменение', error: { code: 'CONFLICT', details } };
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 409,
      headers: { get: () => 'application/json' }, clone: () => ({ json: async () => json }) }) as any;
    const response = await httpRequest('/client-orders/by-client-id/id', { method: 'PUT', body: {} });
    expect(response.errorDetails).toEqual(details);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns a distinct response after the default 10 second timeout', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }));
    global.fetch = fetchMock as any;

    const request = httpRequest('/client-orders');
    await jest.advanceTimersByTimeAsync(10_000);
    const response = await request;

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/client-orders', expect.objectContaining({
      method: 'GET',
      signal: expect.any(AbortSignal),
    }));
    expect(response).toMatchObject({
      ok: false,
      status: 408,
      message: 'Операция выполняется дольше обычного. Повторите запрос.',
      errorCode: 'REQUEST_TIMEOUT',
    });
    expect(setServerUnavailable).not.toHaveBeenCalled();
    expect(handleBackendUnavailable).not.toHaveBeenCalled();
  });

  it('retries a GET after a short network disconnect and recovers transparently', async () => {
    jest.useFakeTimers();
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed: java.net.ConnectException: 155.212.144.191:443'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    global.fetch = fetchMock as any;

    const request = httpRequest('/client-orders');
    await jest.advanceTimersByTimeAsync(350);

    await expect(request).resolves.toMatchObject({ ok: true, status: 200, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(setServerUnavailable).not.toHaveBeenCalled();
  });

  it('never retries a mutating request after an unknown network outcome', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(
      new Error('fetch failed: java.net.ConnectException: 155.212.144.191:443')
    );
    global.fetch = fetchMock as any;

    const response = await httpRequest('/client-orders', { method: 'POST', body: { id: 'stable-id' } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      ok: false,
      status: 0,
      message: 'Нет связи с сервером. Проверьте интернет-соединение. Подключение восстановится автоматически.',
      errorCode: 'NETWORK_UNAVAILABLE',
    });
    expect(JSON.stringify(response)).not.toContain('155.212.144.191');
    expect(JSON.stringify(response)).not.toContain('java.net');
  });

  it('retries once with refreshed token after 401', async () => {
    jest.mocked(refreshToken).mockResolvedValueOnce('new-token');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    global.fetch = fetchMock as any;

    const response = await httpRequest('/client-orders');

    expect(response).toMatchObject({ ok: true, status: 200, data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('http://api.test/client-orders', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer new-token' }),
    }));
    expect(setServerReachable).toHaveBeenCalled();
  });

  it('uses a proactively refreshed token before the first request', async () => {
    jest.mocked(getAccessTokenForRequest).mockResolvedValueOnce('fresh-before-request');
    const fetchMock = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    global.fetch = fetchMock as any;

    await expect(httpRequest('/tracking/status')).resolves.toMatchObject({ ok: true, status: 200 });

    expect(refreshToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/tracking/status', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-before-request' }),
    }));
  });

  it('treats invalid refresh token as auth expiration, not network outage', async () => {
    jest.mocked(refreshToken).mockResolvedValueOnce(null);
    jest.mocked(hasAuthSessionExpired).mockReturnValueOnce(true);
    jest.mocked(getLastRefreshFailure).mockReturnValueOnce({
      kind: 'invalid',
      status: 403,
      message: 'Неверный refresh токен',
      at: Date.now(),
    });
    const fetchMock = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    global.fetch = fetchMock as any;

    const response = await httpRequest('/services');

    expect(response).toMatchObject({
      ok: false,
      status: 401,
      errorCode: 'UNAUTHORIZED',
    });
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
    expect(setServerReachable).toHaveBeenCalled();
    expect(setServerUnavailable).not.toHaveBeenCalledWith('Unauthorized');
  });

  it('keeps authentication and hides refresh network internals after a 401', async () => {
    jest.mocked(refreshToken).mockResolvedValueOnce(null);
    jest.mocked(getLastRefreshFailure).mockReturnValueOnce({
      kind: 'network',
      message: 'connect ECONNREFUSED 155.212.144.191:443',
      at: Date.now(),
    });
    const fetchMock = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    global.fetch = fetchMock as any;

    const response = await httpRequest('/services');

    expect(response).toMatchObject({
      ok: false,
      status: 0,
      message: 'Нет связи с сервером. Проверьте интернет-соединение. Подключение восстановится автоматически.',
      errorCode: 'NETWORK_UNAVAILABLE',
    });
    expect(logout).not.toHaveBeenCalled();
    expect(JSON.stringify(response)).not.toContain('155.212.144.191');
  });

  it('returns a transient conflict when refresh token is being rotated elsewhere', async () => {
    jest.mocked(refreshToken).mockResolvedValueOnce(null);
    jest.mocked(getLastRefreshFailure).mockReturnValueOnce({
      kind: 'rotated',
      status: 409,
      message: 'Request failed with status code 409',
      at: Date.now(),
    } as any);
    const fetchMock = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    global.fetch = fetchMock as any;

    const response = await httpRequest('/tracking/points', { method: 'POST', body: { points: [] } });

    expect(response).toMatchObject({
      ok: false,
      status: 409,
      errorCode: 'CONFLICT',
    });
    expect(logout).not.toHaveBeenCalled();
    expect(setServerUnavailable).not.toHaveBeenCalled();
  });

  it('keeps the session for an indeterminate refresh failure', async () => {
    jest.mocked(refreshToken).mockResolvedValueOnce(null);
    jest.mocked(getLastRefreshFailure).mockReturnValueOnce({
      kind: 'unknown',
      status: 503,
      message: 'Refresh still in progress',
      at: Date.now(),
    } as any);
    const fetchMock = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    global.fetch = fetchMock as any;

    await expect(httpRequest('/services')).resolves.toMatchObject({
      ok: false,
      status: 503,
      errorCode: 'SERVER_ERROR',
    });
    expect(logout).not.toHaveBeenCalled();
  });
  it('bounds token preflight and never starts a late request or logs out', async () => {
    jest.useFakeTimers();
    let finish!:(value:string|null)=>void;
    jest.mocked(getAccessTokenForRequest).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    global.fetch=jest.fn() as any;
    const request=httpRequest('/help/events');
    await jest.advanceTimersByTimeAsync(15000);
    await expect(request).resolves.toMatchObject({ok:false,status:408,errorCode:'REQUEST_TIMEOUT'});
    finish('late-token');await Promise.resolve();await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();expect(logout).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels credential preflight immediately without aborting shared refresh work', async () => {
    jest.useFakeTimers();
    let finish!:(value:string|null)=>void;
    jest.mocked(getAccessTokenForRequest).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    global.fetch=jest.fn() as any;
    const controller=new AbortController();
    const request=httpRequest('/help/events',{signal:controller.signal});
    controller.abort();
    await expect(request).resolves.toMatchObject({ok:false,status:499});
    finish('late-token');await Promise.resolve();await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();expect(logout).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds a stalled refresh after 401 without retrying a mutation or clearing auth', async () => {
    jest.useFakeTimers();
    let finish!:(value:string|null)=>void;
    jest.mocked(refreshToken).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    global.fetch=jest.fn().mockResolvedValueOnce(new Response('{}',{status:401,headers:{'content-type':'application/json'}})) as any;
    const request=httpRequest('/help/messages',{method:'POST',body:{text:'test'}});
    await jest.advanceTimersByTimeAsync(15000);
    await expect(request).resolves.toMatchObject({ok:false,status:408});
    finish('late-token');await Promise.resolve();await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);expect(logout).not.toHaveBeenCalled();
  });

  it.each(['json', 'text', 'binary'] as const)('bounds a stalled %s body and never repeats a mutation after headers', async (kind) => {
    jest.useFakeTimers();
    let finish!: (value: any) => void;
    const body = new Promise(resolve => { finish = resolve; });
    const response = {
      ok: true, status: 200,
      headers: new Headers({ 'content-type': kind === 'binary' ? 'application/pdf' : 'application/json' }),
      clone: () => ({ json: () => kind === 'text' ? Promise.reject(new SyntaxError('not JSON')) : body }),
      text: () => body, blob: () => body,
    };
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock;
    const request = httpRequest('/help/messages', { skipAuth: true, method: 'POST', body: { text: 'one operation' }, networkRetryCount: 2 });
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(request).resolves.toMatchObject({ status: 408, errorCode: 'REQUEST_TIMEOUT' });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setServerReachable).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    finish(kind === 'json' ? { data: { late: true } } : kind === 'text' ? 'late' : new Blob(['late']));
    await Promise.resolve(); await Promise.resolve();
    expect(setServerReachable).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one timeout between headers and body instead of starting a new body budget', async () => {
    jest.useFakeTimers();
    let headers!: (value: any) => void;
    const stalledBody = new Promise(() => {});
    global.fetch = jest.fn(() => new Promise(resolve => { headers = resolve; })) as any;
    let settled = false;
    const request = httpRequest('/help/events', { skipAuth: true }).finally(() => { settled = true; });
    await jest.advanceTimersByTimeAsync(6000);
    headers({ ok: true, status: 200, headers: new Headers(), clone: () => ({ json: () => stalledBody }) });
    await jest.advanceTimersByTimeAsync(3999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toMatchObject({ status: 408 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([0, 10_000])('cancels a body read after headers with timeoutMs=%s, including native fetch that ignores abort', async (timeoutMs) => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    let bodyStarted = false;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
      clone: () => ({ json: () => { bodyStarted = true; return new Promise(() => {}); } }),
    });
    global.fetch = fetchMock;
    const request = httpRequest('/help/events', { skipAuth: true, timeoutMs, signal: controller.signal });
    for (let index = 0; index < 10 && !bodyStarted; index++) await Promise.resolve();
    expect(bodyStarted).toBe(true);
    controller.abort();
    await expect(request).resolves.toMatchObject({ status: 499 });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(jest.getTimerCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setServerReachable).not.toHaveBeenCalled();
  });

  it('cleans up cancellation after a complete response and keeps plain text fallback', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = jest.fn().mockResolvedValue(new Response('temporary maintenance', { status: 503 }));
    global.fetch = fetchMock;
    await expect(httpRequest('/services', { skipAuth: true, signal: controller.signal }))
      .resolves.toMatchObject({ status: 503, message: 'temporary maintenance' });
    expect(jest.getTimerCount()).toBe(0);
    controller.abort();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    expect(setServerReachable).toHaveBeenCalledTimes(1);
  });

  it('does not retry a GET whose body fails after response headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
      clone: () => ({ json: async () => { throw new Error('body disconnected'); } }),
      text: async () => { throw new Error('body disconnected'); },
    });
    await expect(httpRequest('/help/events', { skipAuth: true })).resolves.toMatchObject({ status: 0 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

});
