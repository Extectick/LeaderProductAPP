import { scrubCrashEvent, scrubDiagnosticValue, redactDiagnosticText } from '../src/shared/monitoring/privacy';

const mockSdk = { init: jest.fn(), setTag: jest.fn(), setUser: jest.fn(), captureException: jest.fn() };
jest.mock('@sentry/react-native', () => mockSdk);
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0.1.26', nativeBuildVersion: '25' }));
jest.mock('expo-updates', () => ({ runtimeVersion: '0.1.26', updateId: 'test-ota-id' }));
jest.mock('../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), captureException: jest.fn() } }));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SENTRY_ENABLED = 'true';
  process.env.EXPO_PUBLIC_UPDATE_CHANNEL = 'prod';
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@api.leader-product.ru/sentry/3';
  process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'com.leaderproduct.app@0.1.26+25-ota.test';
});

test('production init is idempotent, privacy filtered and safe for an OTA-only release', () => {
  const m = require('../src/shared/monitoring');
  m.initMonitoring(); m.initMonitoring();
  expect(mockSdk.init).toHaveBeenCalledTimes(1);
  expect(mockSdk.init).toHaveBeenCalledWith(expect.objectContaining({
    environment: 'production', dist: '25', sendDefaultPii: false,
    enableNativeCrashHandling: false, enableNdk: false, enableAutoSessionTracking: false,
    tracesSampleRate: 0, beforeSend: expect.any(Function),
  }));
  expect(mockSdk.setTag).toHaveBeenCalledWith('ota_update_id', 'test-ota-id');
});

test('disabled collection and missing DSN never initialize the SDK', () => {
  process.env.EXPO_PUBLIC_SENTRY_ENABLED = 'false';
  require('../src/shared/monitoring').initMonitoring();
  expect(mockSdk.init).not.toHaveBeenCalled();
  jest.resetModules();
  process.env.EXPO_PUBLIC_SENTRY_ENABLED = 'true';
  process.env.EXPO_PUBLIC_SENTRY_DSN = '';
  require('../src/shared/monitoring').initMonitoring();
  expect(mockSdk.init).not.toHaveBeenCalled();
});

test('dev and prod environments are separate', () => {
  process.env.EXPO_PUBLIC_UPDATE_CHANNEL = 'dev';
  const m = require('../src/shared/monitoring'); m.initMonitoring();
  expect(mockSdk.init).toHaveBeenCalledWith(expect.objectContaining({ environment: 'development' }));
});

test('only numeric account identity is sent and logout clears it', () => {
  const m = require('../src/shared/monitoring'); m.initMonitoring();
  m.setMonitoringUser(42); m.setMonitoringUser('name@example.com'); m.setMonitoringUser(null);
  expect(mockSdk.setUser.mock.calls).toEqual([[{ id: '42' }], [null], [null]]);
  m.setMonitoringScreen('services/client_orders/[id]?token=SECRET');
  expect(mockSdk.setTag).toHaveBeenCalledWith('screen', 'services/client_orders/[id]');
});

test('SDK global handler is not wrapped again', () => {
  const m = require('../src/shared/monitoring'); m.initMonitoring();
  const previous = (global as any).ErrorUtils;
  const handler = jest.fn();
  (global as any).ErrorUtils = { setGlobalHandler: handler };
  try { m.installGlobalJsErrorHandler(); expect(handler).not.toHaveBeenCalled(); }
  finally { (global as any).ErrorUtils = previous; }
});

test('removes request, documents, PII, local variables and network breadcrumbs', () => {
  const result = scrubCrashEvent({
    user: { id: '42', email: 'name@example.com', ip_address: '10.0.0.1' },
    request: { data: 'CUSTOMER_BODY' }, extra: { document: 'CUSTOMER_BODY' },
    server_name: 'PRIVATE_HOST', transaction: '/orders/PRIVATE_ID',
    exception: { values: [{ value: 'token=SECRET https://example.com?token=SECRET', stacktrace: { frames: [{ function: 'saveOrder', vars: { document: 'CUSTOMER_BODY' } }] } }] },
    tags: { screen: 'orders/[id]', arbitrary: 'CUSTOMER_BODY' },
    contexts: { location: { latitude: 55 }, device: { model: 'Pixel', name: 'PRIVATE_NAME' }, arbitrary: 'CUSTOMER_BODY' },
    breadcrumbs: [{ category: 'http', message: 'CUSTOMER_BODY' }, { category: 'app', message: 'open_order', data: { customer: 'CUSTOMER_BODY' } }],
  });
  expect(JSON.stringify(result)).not.toMatch(/SECRET|CUSTOMER_BODY|PRIVATE_|latitude|name@|10.0.0.1/);
  expect(result.user).toEqual({ id: '42' });
  expect(result.exception.values[0].stacktrace.frames[0]).toEqual({ function: 'saveOrder' });
});

test('quoted secrets and cyclic metadata are redacted and bounded', () => {
  expect(redactDiagnosticText('"password":"SECRET", token=OTHER')).not.toMatch(/SECRET|OTHER/);
  expect(redactDiagnosticText('Request failed {"customer":"PRIVATE_CLIENT","items":[1,2]}')).not.toContain('PRIVATE_CLIENT');
  const data: any = { authorization: 'SECRET' }; data.self = data;
  expect(JSON.stringify(scrubDiagnosticValue(data))).not.toContain('SECRET');
});
