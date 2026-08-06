const storage = new Map<string, string>();
const axiosGet = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    storage.set(key, value);
  }),
}));

jest.mock('axios', () => ({
  get: (...args: unknown[]) => axiosGet(...args),
  post: jest.fn(),
}));

jest.mock('@/utils/config', () => ({
  API_BASE_URL: 'http://api.test',
}));

describe('update service polling cache', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    storage.clear();
  });

  it('deduplicates automatic checks but lets a manual check bypass the cache', async () => {
    axiosGet.mockResolvedValue({
      status: 200,
      data: { data: { updateAvailable: false, mandatory: false } },
      headers: { etag: 'test-etag' },
    });
    const { checkForUpdate } = await import('@/utils/updateService');
    const params = {
      platform: 'android' as const,
      versionCode: 22,
      versionName: '1.0.0',
      channel: 'dev',
      deviceId: 'device-1',
    };

    await checkForUpdate(params);
    await checkForUpdate(params);
    expect(axiosGet).toHaveBeenCalledTimes(1);

    await checkForUpdate({ ...params, force: true });
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('briefly caches network failures to avoid request storms', async () => {
    axiosGet.mockRejectedValue(new Error('Network Error'));
    const { checkForUpdate } = await import('@/utils/updateService');
    const params = {
      platform: 'android' as const,
      versionCode: 22,
      channel: 'dev',
      deviceId: 'device-2',
    };

    await checkForUpdate(params);
    await checkForUpdate(params);

    expect(axiosGet).toHaveBeenCalledTimes(1);
  });
});
