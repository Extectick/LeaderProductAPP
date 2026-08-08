const mockStorage = new Map<string, string>();
const mockAxiosGet = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
}));

jest.mock('axios', () => ({
  get: (...args: unknown[]) => mockAxiosGet(...args),
  post: jest.fn(),
}));

jest.mock('@/utils/config', () => ({
  API_BASE_URL: 'http://api.test',
}));

describe('update service polling cache', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockStorage.clear();
  });

  it('deduplicates automatic checks but lets a manual check bypass the cache', async () => {
    mockAxiosGet.mockResolvedValue({
      status: 200,
      data: { data: { updateAvailable: false, mandatory: false } },
      headers: { etag: 'test-etag' },
    });
    const { checkForUpdate } = require('@/utils/updateService');
    const params = {
      platform: 'android' as const,
      versionCode: 22,
      versionName: '1.0.0',
      channel: 'dev',
      deviceId: 'device-1',
    };

    await checkForUpdate(params);
    await checkForUpdate(params);
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);

    await checkForUpdate({ ...params, force: true });
    expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  });

  it('briefly caches network failures to avoid request storms', async () => {
    mockAxiosGet.mockRejectedValue(new Error('Network Error'));
    const { checkForUpdate } = require('@/utils/updateService');
    const params = {
      platform: 'android' as const,
      versionCode: 22,
      channel: 'dev',
      deviceId: 'device-2',
    };

    await checkForUpdate(params);
    await checkForUpdate(params);

    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
  });
});
