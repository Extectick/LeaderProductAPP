let storage: Map<string, string>;
let secure: Map<string, string>;
let sdk: any;
let native: any;
let api: jest.Mock;
let location: any;

beforeEach(() => {
  jest.resetModules();
  storage = new Map([['tracking:v2:enabled', 'true'], ['tracking:v2:legacy-migrated', 'done']]);
  secure = new Map([['tracking.v2.credential', 'lpt_existing']]);
  sdk = { init: jest.fn().mockResolvedValue(undefined), setConfig: jest.fn().mockResolvedValue(undefined), start: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined), isTracking: jest.fn().mockResolvedValue(false), requestPosition: jest.fn().mockResolvedValue(true), getLogs: jest.fn().mockResolvedValue([]) };
  native = { setCommandsEnabled: jest.fn().mockResolvedValue(true), getReliabilityStatus: jest.fn().mockResolvedValue({ batteryOptimizationExempt: false, commandsRunning: false }) };
  location = { getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', android: { accuracy: 'fine' } }), getBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }), requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }), requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }), hasServicesEnabledAsync: jest.fn().mockResolvedValue(true) };
  api = jest.fn(async (path: string) => path.endsWith('/bootstrap') ? ({ ok: true, status: 200, data: { credential: 'lpt_existing', endpoint: '/tracking/native/osmand' } }) : ({ ok: true, status: 200 }));
  jest.doMock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
    getItem: jest.fn(async (key: string) => storage.get(key) || null),
    setItem: jest.fn(async (key: string, value: string) => { storage.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { storage.delete(key); }),
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, storage.get(key) || null])),
  } }));
  jest.doMock('expo-secure-store', () => ({ getItemAsync: jest.fn(async (key: string) => secure.get(key) || null), setItemAsync: jest.fn(async (key: string, value: string) => { secure.set(key, value); }), deleteItemAsync: jest.fn(async (key: string) => { secure.delete(key); }) }));
  jest.doMock('react-native', () => ({ Platform: { OS: 'android', Version: 35 }, NativeModules: { LeaderTracking: native }, PermissionsAndroid: { PERMISSIONS: { ACTIVITY_RECOGNITION: 'activity' }, RESULTS: { GRANTED: 'granted' }, check: jest.fn().mockResolvedValue(true), request: jest.fn().mockResolvedValue('granted') }, Linking: { openSettings: jest.fn() } }));
  jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
  jest.doMock('expo-location', () => location);
  jest.doMock('expo-notifications', () => ({ getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }), requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }) }));
  jest.doMock('react-native-traccar-client-sdk', () => sdk);
  jest.doMock('../utils/traccarSdk', () => ({ loadTraccarSdk: jest.fn(async () => sdk) }));
  jest.doMock('../utils/apiClient', () => ({ apiClient: api }));
  jest.doMock('../utils/config', () => ({ API_BASE_URL: 'https://dev.example.test' }));
  jest.doMock('../utils/tokenService', () => ({ getAuthDevicePayload: jest.fn().mockResolvedValue({ installId: 'phone-1' }) }));
  jest.doMock('../utils/nativeTrackingService', () => ({ getNativeTrackingStatus: jest.fn(), stopNativeTracking: jest.fn(), resumeNativeTracking: jest.fn() }));
  jest.doMock('../utils/trackingUploader', () => ({ flushTrackingQueue: jest.fn() }));
});

it('restores the buffered collector offline with an existing credential', async () => {
  api.mockResolvedValue({ ok: false, status: 0, message: 'Нет сети' });
  const { restoreTrackingV2 } = require('../utils/trackingV2Service');
  await expect(restoreTrackingV2()).resolves.toBe(true);
  expect(sdk.setConfig).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'lpt_existing', buffer: true }));
  expect(sdk.start).toHaveBeenCalledTimes(1);
  expect(native.setCommandsEnabled).toHaveBeenCalledWith(true);
});

it.each([401, 403, 404])('does not bypass bootstrap rejection %s using a saved key', async (status) => {
  api.mockResolvedValue({ ok: false, status, message: 'Access denied' });
  await expect(require('../utils/trackingV2Service').restoreTrackingV2()).rejects.toThrow('Access denied');
  expect(sdk.start).not.toHaveBeenCalled();
});

it('does not revive a credential rejected by the native channel while offline', async () => {
  native.getReliabilityStatus.mockResolvedValue({ commandError: 'DEVICE_AUTH_REQUIRED' });
  api.mockResolvedValue({ ok: false, status: 0, message: 'Нет сети' });
  await expect(require('../utils/trackingV2Service').restoreTrackingV2()).rejects.toThrow('Нет сети');
  expect(sdk.start).not.toHaveBeenCalled();
});

it('repairs a rejected credential only after a successful authenticated bootstrap', async () => {
  native.getReliabilityStatus.mockResolvedValue({ commandError: 'DEVICE_AUTH_REQUIRED' });
  api.mockResolvedValue({ ok: true, data: { credential: 'lpt_replacement', endpoint: '/tracking/native/osmand' } });
  await expect(require('../utils/trackingV2Service').restoreTrackingV2()).resolves.toBe(true);
  expect(secure.get('tracking.v2.credential')).toBe('lpt_replacement');
  expect(sdk.setConfig).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'lpt_replacement' }));
  expect(native.setCommandsEnabled).toHaveBeenCalledWith(true);
});

it('does not start an unregistered device offline', async () => {
  secure.clear();
  api.mockResolvedValue({ ok: false, status: 0, message: 'Нет сети' });
  await expect(require('../utils/trackingV2Service').restoreTrackingV2()).rejects.toThrow('Нет сети');
  expect(sdk.start).not.toHaveBeenCalled();
});

it('pause wins over a slow restore and does not enable command polling afterwards', async () => {
  let release!: (value: any) => void;
  const pending = new Promise((resolve) => { release = resolve; });
  api.mockImplementation(async (path: string) => path.endsWith('/bootstrap') ? pending : { ok: true });
  const service = require('../utils/trackingV2Service');
  const restore = service.restoreTrackingV2();
  for (let i = 0; i < 30 && !api.mock.calls.length; i++) await Promise.resolve();
  expect(api).toHaveBeenCalled();
  const stop = service.stopTrackingV2();
  for (let i = 0; i < 20 && !sdk.stop.mock.calls.length; i++) await Promise.resolve();
  expect(sdk.stop).toHaveBeenCalled(); // does not wait for bootstrap/network
  release({ ok: true, data: { credential: 'lpt_existing', endpoint: '/tracking/native/osmand' } });
  await Promise.all([restore, stop]);
  expect(storage.get('tracking:v2:enabled')).toBe('false');
  expect(sdk.start).not.toHaveBeenCalled();
  expect(native.setCommandsEnabled).not.toHaveBeenCalledWith(true);
  expect(sdk.stop).toHaveBeenCalled();
});

it('pause wins over a slow explicit start and preserves the paused intent', async () => {
  let release!: (value: any) => void;
  const pending = new Promise((resolve) => { release = resolve; });
  api.mockImplementation(async (path: string) => path.endsWith('/bootstrap') ? pending : { ok: true });
  const service = require('../utils/trackingV2Service');
  const start = service.startTrackingV2();
  for (let i = 0; i < 50 && !api.mock.calls.length; i++) await Promise.resolve();
  expect(api).toHaveBeenCalled();
  const stop = service.stopTrackingV2();
  release({ ok: true, data: { credential: 'lpt_existing', endpoint: '/tracking/native/osmand' } });
  await Promise.all([start, stop]);
  expect(storage.get('tracking:v2:enabled')).toBe('false');
  expect(sdk.start).not.toHaveBeenCalled();
  expect(native.setCommandsEnabled).not.toHaveBeenCalledWith(true);
});

it('coalesces concurrent restores and avoids resetting the engine on each check', async () => {
  const service = require('../utils/trackingV2Service');
  await Promise.all([service.restoreTrackingV2(), service.restoreTrackingV2()]);
  sdk.isTracking.mockResolvedValue(true);
  await service.restoreTrackingV2();
  expect(api.mock.calls.filter(([path]) => path.endsWith('/bootstrap'))).toHaveLength(1);
  expect(sdk.setConfig).toHaveBeenCalledTimes(1);
  expect(sdk.start).toHaveBeenCalledTimes(1);
});

it('does not prompt for permissions or start a collector during automatic repair', async () => {
  location.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  await expect(require('../utils/trackingV2Service').restoreTrackingV2()).resolves.toBe(false);
  expect(location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalled();
  expect(sdk.start).not.toHaveBeenCalled();
});

it('does not restore or bootstrap a paused tracker', async () => {
  storage.set('tracking:v2:enabled', 'false');
  await expect(require('../utils/trackingV2Service').restoreTrackingV2()).resolves.toBe(false);
  expect(api).not.toHaveBeenCalled();
});

it('does not open a notification permission prompt from automatic repair', async () => {
  const notifications = require('expo-notifications');
  notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
  await expect(require('../utils/trackingV2Service').restoreTrackingV2()).resolves.toBe(false);
  expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(sdk.start).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalled();
});

it('exposes battery restrictions but not invented coordinates or successful upload time', async () => {
  sdk.getLogs.mockResolvedValue([{ time: Date.now(), message: 'Upload error: lpt_private' }, { time: Date.now(), message: 'Location provider failed' }]);
  const result = await require('../utils/trackingV2Service').getTrackingV2Diagnostics();
  expect(result.batteryOptimizationExempt).toBe(false);
  expect(result.preciseLocation).toBe(true);
  expect(result.lastSentAt).toBeUndefined();
  expect(result.lastRecordedAt).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('lpt_private');
});
