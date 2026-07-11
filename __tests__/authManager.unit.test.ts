const asyncStorage = new Map<string, string>();
const secureStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => asyncStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    asyncStorage.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    asyncStorage.delete(key);
  }),
  multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, asyncStorage.get(key) ?? null])),
  multiSet: jest.fn(async (items: [string, string][]) => {
    items.forEach(([key, value]) => asyncStorage.set(key, value));
  }),
  multiRemove: jest.fn(async (keys: string[]) => {
    keys.forEach((key) => asyncStorage.delete(key));
  }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => secureStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureStorage.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    secureStorage.delete(key);
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

const axiosPost = jest.fn();
jest.mock('axios', () => ({
  post: (...args: any[]) => axiosPost(...args),
}));

describe('auth token manager', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    asyncStorage.clear();
    secureStorage.clear();
  });

  it('refreshes token with device metadata and stores returned device session', async () => {
    const tokenService = await import('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-old');

    axiosPost.mockResolvedValueOnce({
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

    expect(axiosPost).toHaveBeenCalledWith(
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

  it('does not expire session when another runtime already rotated refresh token', async () => {
    const tokenService = await import('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-1');

    axiosPost.mockImplementationOnce(async () => {
      secureStorage.set('refreshToken', 'rotated-refresh');
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
    axiosPost.mockResolvedValueOnce({
      data: {
        data: {
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
          deviceSessionId: 'device-1',
          profile: { id: 1 },
        },
      },
    });

    await expect(tokenService.refreshToken()).resolves.toBe('fresh-access');

    expect(axiosPost).toHaveBeenCalledTimes(2);
    expect(axiosPost.mock.calls[1][1]).toEqual(expect.objectContaining({
      refreshToken: 'rotated-refresh',
    }));
    expect(tokenService.hasAuthSessionExpired()).toBe(false);
    await expect(tokenService.getRefreshToken()).resolves.toBe('fresh-refresh');
  });

  it('recovers when axios exposes refresh rotation conflict without response object', async () => {
    const tokenService = await import('@/utils/tokenService');
    await tokenService.saveTokens('old-access', 'old-refresh', { id: 1 }, 'device-1');

    axiosPost.mockImplementationOnce(async () => {
      secureStorage.set('accessToken', 'fresh-access-from-other-runtime');
      secureStorage.set('refreshToken', 'fresh-refresh-from-other-runtime');
      throw {
        status: 409,
        message: 'Request failed with status code 409',
      };
    });

    await expect(tokenService.refreshToken()).resolves.toBe('fresh-access-from-other-runtime');

    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(tokenService.hasAuthSessionExpired()).toBe(false);
    await expect(tokenService.getRefreshToken()).resolves.toBe('fresh-refresh-from-other-runtime');
  });
});
