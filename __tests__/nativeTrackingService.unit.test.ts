describe('nativeTrackingService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns unavailable when native module is absent', async () => {
    jest.doMock('react-native', () => ({
      NativeModules: {},
      Platform: { OS: 'ios' },
    }));

    const service = require('../utils/nativeTrackingService');

    expect(service.isNativeTrackingAvailable()).toBe(false);
    await expect(service.getNativeTrackingStatus()).resolves.toEqual({ available: false });
    await expect(service.stopNativeTracking()).resolves.toEqual({ available: false });
    await expect(service.resumeNativeTracking()).resolves.toEqual({ available: false });
    await expect(service.updateNativeTrackingRoute(1)).resolves.toEqual({ available: false });
  });

  it('proxies start/stop/status to Android native module', async () => {
    const native = {
      start: jest.fn().mockResolvedValue({ available: true, enabled: true, running: true }),
      stop: jest.fn().mockResolvedValue({ available: true, enabled: false, running: false }),
      resume: jest.fn().mockResolvedValue({ available: true, enabled: true, running: true }),
      updateRoute: jest.fn().mockResolvedValue({ available: true, enabled: true, routeId: 2 }),
      getStatus: jest.fn().mockResolvedValue({ available: true, enabled: true, running: true }),
    };
    jest.doMock('react-native', () => ({
      NativeModules: { LeaderTracking: native },
      Platform: { OS: 'android' },
    }));

    const service = require('../utils/nativeTrackingService');

    expect(service.isNativeTrackingAvailable()).toBe(true);
    await expect(
      service.startNativeTracking({
        apiBaseUrl: 'http://api.test',
        token: 'lpt_test',
        routeId: 1,
        intervalMs: 15000,
      })
    ).resolves.toMatchObject({ running: true });
    await expect(service.getNativeTrackingStatus()).resolves.toMatchObject({ enabled: true });
    await expect(service.resumeNativeTracking()).resolves.toMatchObject({ running: true });
    await expect(service.updateNativeTrackingRoute(2)).resolves.toMatchObject({ routeId: 2 });
    await expect(service.stopNativeTracking()).resolves.toMatchObject({ enabled: false });
    expect(native.start).toHaveBeenCalledWith({
      apiBaseUrl: 'http://api.test',
      token: 'lpt_test',
      routeId: 1,
      intervalMs: 15000,
    });
    expect(native.updateRoute).toHaveBeenCalledWith(2);
  });
});
