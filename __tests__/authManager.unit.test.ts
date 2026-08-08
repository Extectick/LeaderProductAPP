const mockAsyncStorage = new Map<string, string>();
const mockSecureStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncStorage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockAsyncStorage.delete(key);
  }),
  multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, mockAsyncStorage.get(key) ?? null])),
  multiSet: jest.fn(async (items: [string, string][]) => {
    items.forEach(([key, value]) => mockAsyncStorage.set(key, value));
  }),
  multiRemove: jest.fn(async (keys: string[]) => {
    keys.forEach((key) => mockAsyncStorage.delete(key));
  }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStorage.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStorage.delete(key);
  }),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 35 },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '9.9.9' },
  manifest2: null,
  deviceName: 'Unit Test Device',
}));

jest.mock('@/utils/config', () => ({
  API_BASE_URL: 'http://api.test',
}));

jest.mock('@/src/shared/network/serverStatus', () => ({
  setServerReachable: jest.fn(),
  setServerUnavailable: jest.fn(),
}));

jest.mock('@/src/features/services/storage/servicesAccessCache', () => ({
  clearServicesAccessCache: jest.fn(async () => undefined),
}));

const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  post: (...args: any[]) => mockAxiosPost(...args),
}));

describe('auth token manager', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAsyncStorage.clear();
    mockSecureStorage.clear();
  });

  it('refreshes token with device metadata and stores returned device session', async () => {
    const tokenService = require('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-old');

    mockAxiosPost.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          deviceSessionId: 'device-new',
          profile: { id: 1 },
        },
      },
    });

    await expect(tokenService.refreshToken()).resolves.toBe('new-access');

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'http://api.test/auth/token',
      expect.objectContaining({
        refreshToken: 'old-refresh',
        deviceSessionId: 'device-old',
        installId: expect.stringMatching(/^lp-/),
        platform: 'android',
        appVersion: '9.9.9',
      }),
      expect.any(Object)
    );
    await expect(tokenService.getRefreshToken()).resolves.toBe('new-refresh');
    await expect(tokenService.getDeviceSessionId()).resolves.toBe('device-new');
  });

  it('uses the token pair written by another runtime without rotating it again', async () => {
    const tokenService = require('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-1');

    mockAxiosPost.mockImplementationOnce(async () => {
      mockSecureStorage.set('refreshToken', 'rotated-refresh');
      mockSecureStorage.set('accessToken', 'fresh-access-from-other-runtime');
      throw {
        response: {
          status: 409,
          data: {
            message: 'already rotated',
            error: { details: { reason: 'REFRESH_TOKEN_ROTATED' } },
          },
        },
      };
    });
    await expect(tokenService.refreshToken()).resolves.toBe('fresh-access-from-other-runtime');

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(tokenService.hasAuthSessionExpired()).toBe(false);
    await expect(tokenService.getRefreshToken()).resolves.toBe('rotated-refresh');
  });

  it('recovers when axios exposes refresh rotation conflict without response object', async () => {
    const tokenService = require('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-1');

    mockAxiosPost.mockImplementationOnce(async () => {
      mockSecureStorage.set('accessToken', 'fresh-access-from-other-runtime');
      mockSecureStorage.set('refreshToken', 'fresh-refresh-from-other-runtime');
      throw {
        status: 409,
        message: 'Request failed with status code 409',
      };
    });

    await expect(tokenService.refreshToken()).resolves.toBe('fresh-access-from-other-runtime');

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(tokenService.hasAuthSessionExpired()).toBe(false);
    await expect(tokenService.getRefreshToken()).resolves.toBe('fresh-refresh-from-other-runtime');
  });

  it('refreshes an access token shortly before it expires', async () => {
    const tokenService = require('@/utils/tokenService');
    const soonExpiring = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 30 }))
      .toString('base64url')}.signature`;
    await tokenService.saveTokens(soonExpiring, 'old-refresh', { id: 1 }, 'device-1');
    mockAxiosPost.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
          deviceSessionId: 'device-1',
          profile: { id: 1 },
        },
      },
    });

    await expect(tokenService.getAccessTokenForRequest()).resolves.toBe('fresh-access');
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    await expect(tokenService.getRefreshToken()).resolves.toBe('fresh-refresh');
  });

  it('keeps the local session and backs off refresh attempts while the API is unavailable', async () => {
    const tokenService = require('@/utils/tokenService');
    const expiredRefresh = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }))
      .toString('base64url')}.signature`;
    await tokenService.saveTokens('expired-access', expiredRefresh, { id: 1 }, 'device-1');
    mockAxiosPost.mockRejectedValueOnce(new Error('Network Error'));

    await expect(tokenService.refreshToken()).resolves.toBeNull();
    await expect(tokenService.refreshToken()).resolves.toBeNull();

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(tokenService.hasAuthSessionExpired()).toBe(false);
    expect(tokenService.getLastRefreshFailure()).toMatchObject({ kind: 'network' });
    await expect(tokenService.getRefreshToken()).resolves.toBe(expiredRefresh);
    expect(mockAsyncStorage.get('profile')).toBe(JSON.stringify({ id: 1 }));
  });
});
