import { httpRequest } from '../src/shared/api/httpClient';
import {
  getLastRefreshFailure,
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
  getAccessToken: jest.fn(async () => null),
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

  it('aborts requests after the default 10 second timeout', async () => {
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
      status: 0,
      message: 'Request timeout',
      errorCode: 'NETWORK_UNAVAILABLE',
    });
    expect(setServerUnavailable).toHaveBeenCalledWith('Request timeout');
    expect(handleBackendUnavailable).toHaveBeenCalledWith('Request timeout');
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
});
