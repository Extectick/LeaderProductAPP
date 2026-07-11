const storage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    storage.delete(key);
    return Promise.resolve();
  }),
}));

jest.mock('../utils/apiClient', () => ({
  apiClient: jest.fn(),
}));

const basePoint = {
  latitude: 55.03,
  longitude: 82.92,
  recordedAt: '2026-07-10T08:00:00.000Z',
  accuracy: 8,
};

describe('tracking uploader', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    storage.clear();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('sends queued point with clientPointId and starts route when route is absent', async () => {
    const { apiClient } = require('../utils/apiClient');
    apiClient.mockResolvedValue({
      ok: true,
      status: 200,
      data: { routeId: 123 },
    });
    const { enqueueTrackingPoints, getQueueDebug } = require('../utils/trackingUploader');

    await enqueueTrackingPoints([basePoint], '[test]');

    expect(apiClient).toHaveBeenCalledTimes(1);
    const payload = apiClient.mock.calls[0][1].body;
    expect(payload.routeId).toBeUndefined();
    expect(payload.startNewRoute).toBe(true);
    expect(payload.endRoute).toBe(false);
    expect(payload.points).toHaveLength(1);
    expect(payload.points[0].clientPointId).toMatch(/^tp-/);
    expect(await getQueueDebug()).toMatchObject({
      length: 0,
      routeId: 123,
      pendingEndRoute: false,
      sending: false,
    });
    expect(storage.get('tracking:routeId')).toBe('123');
  });

  it('marks route ending and sends next batch with endRoute=true', async () => {
    storage.set('tracking:routeId', '44');
    const { apiClient } = require('../utils/apiClient');
    apiClient.mockResolvedValue({
      ok: true,
      status: 200,
      data: { routeId: 44 },
    });
    const {
      enqueueTrackingPoints,
      getQueueDebug,
      markTrackingRouteEnding,
    } = require('../utils/trackingUploader');

    await markTrackingRouteEnding('[test]');
    expect(storage.get('tracking:pendingEndRoute')).toBe('true');

    await enqueueTrackingPoints([{ ...basePoint, eventType: 'STOP' }], '[test]');

    const payload = apiClient.mock.calls[0][1].body;
    expect(payload.routeId).toBe(44);
    expect(payload.startNewRoute).toBe(false);
    expect(payload.endRoute).toBe(true);
    expect(payload.points[0].eventType).toBe('STOP');
    expect(await getQueueDebug()).toMatchObject({
      length: 0,
      routeId: undefined,
      pendingEndRoute: false,
      sending: false,
    });
    expect(storage.has('tracking:routeId')).toBe(false);
    expect(storage.has('tracking:pendingEndRoute')).toBe(false);
  });

  it('exposes upload errors in queue debug and keeps points queued', async () => {
    const { apiClient } = require('../utils/apiClient');
    apiClient.mockResolvedValue({
      ok: false,
      status: 401,
      message: 'Unauthorized',
    });
    const { enqueueTrackingPoints, getQueueDebug } = require('../utils/trackingUploader');

    await enqueueTrackingPoints([basePoint], '[test]');

    expect(await getQueueDebug()).toMatchObject({
      length: 1,
      routeId: undefined,
      pendingEndRoute: false,
      sending: false,
      lastError: {
        status: 401,
        message: 'Unauthorized',
      },
    });
  });

  it('keeps points queued on refresh rotation conflict', async () => {
    const { apiClient } = require('../utils/apiClient');
    apiClient.mockResolvedValue({
      ok: false,
      status: 409,
      message: 'Request failed with status code 409',
    });
    const { enqueueTrackingPoints, getQueueDebug } = require('../utils/trackingUploader');

    await enqueueTrackingPoints([basePoint], '[test]');

    expect(await getQueueDebug()).toMatchObject({
      length: 1,
      routeId: undefined,
      pendingEndRoute: false,
      sending: false,
      lastError: {
        status: 409,
        message: 'Request failed with status code 409',
      },
    });
  });
});
