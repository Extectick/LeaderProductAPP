const mockNative = {
  enabled: true, version: 1, installationId: 'installation', sessionId: 'session', userId: '91',
  setUser: jest.fn(async () => {}), setRuntime: jest.fn(), setScreen: jest.fn(), recordAction: jest.fn(),
};
const mockSdk = { init: jest.fn(), setTag: jest.fn(), setUser: jest.fn(), addBreadcrumb: jest.fn() };
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { LeaderDiagnostics: mockNative } }));
jest.mock('@sentry/react-native', () => mockSdk);
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0.1.34', nativeBuildVersion: '33' }));
jest.mock('expo-updates', () => ({ runtimeVersion: '0.1.34', updateId: 'test-update' }));
jest.mock('../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), captureException: jest.fn() } }));
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); mockNative.enabled = true;
  process.env.EXPO_PUBLIC_SENTRY_ENABLED = 'true'; process.env.EXPO_PUBLIC_UPDATE_CHANNEL = 'dev';
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@dev.leader-product.ru/sentry/1';
});

test('preserves the early native SDK/privacy hook and restores identity before profile loads', () => {
  const m = require('../src/shared/monitoring'); m.initMonitoring();
  expect(mockSdk.init).toHaveBeenCalledWith(expect.objectContaining({
    autoInitializeNativeSdk: false, enableNativeCrashHandling: true, enableNdk: true, maxQueueSize: 100,
  }));
  expect(mockSdk.setUser).toHaveBeenCalledWith({ id: '91' });
  expect(mockSdk.setTag).toHaveBeenCalledWith('installation_id', 'installation');
  expect(mockSdk.setTag).toHaveBeenCalledWith('app_session_id', 'session');
  expect(mockNative.setRuntime).toHaveBeenCalledWith('0.1.34', 'test-update');
});
test('switching users/logout persists only numeric identity and never credentials', async () => {
  const m = require('../src/shared/monitoring'); m.initMonitoring();
  await m.setMonitoringUser(42); await m.setMonitoringUser(null); await m.setMonitoringUser('email@example.com');
  expect(mockNative.setUser.mock.calls).toEqual([['42'], [null], [null]]);
});
test('stores action names and route templates but never document bodies', () => {
  const m = require('../src/shared/monitoring'); m.initMonitoring();
  m.addMonitoringBreadcrumb('order.product_add', { document: 'PRIVATE' });
  m.setMonitoringScreen('(main)/services/client_orders/[id]?token=SECRET');
  expect(mockNative.recordAction).toHaveBeenCalledWith('order.product_add');
  expect(mockNative.setScreen).toHaveBeenCalledWith('(main)/services/client_orders/[id]');
  const options = mockSdk.init.mock.calls[0][0];
  const event = options.beforeSend({ user: { id: '91', email: 'PRIVATE' },
    tags: { installation_id: 'installation', app_session_id: 'session' },
    breadcrumbs: [{ category: 'app', message: 'order.product_add', data: { document: 'PRIVATE' } }] });
  expect(JSON.stringify(event)).not.toContain('PRIVATE');
  expect(event.tags.capture_mode).toBe('javascript');
  expect(event.tags.app_session_id).toBe('session');
});
test('legacy APK and production are not opted into unsafe native capture through OTA', () => {
  mockNative.enabled = false;
  let m = require('../src/shared/monitoring'); m.initMonitoring();
  expect(mockSdk.init).toHaveBeenLastCalledWith(expect.objectContaining({ autoInitializeNativeSdk: true, enableNativeCrashHandling: false }));
  jest.resetModules(); mockNative.enabled = true; process.env.EXPO_PUBLIC_UPDATE_CHANNEL = 'prod';
  m = require('../src/shared/monitoring'); m.initMonitoring();
  expect(mockSdk.init).toHaveBeenLastCalledWith(expect.objectContaining({ enableNativeCrashHandling: false }));
});
