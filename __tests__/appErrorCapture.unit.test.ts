const mockSend = jest.fn(async () => {});
jest.mock('../src/shared/monitoring/appErrorDelivery', () => ({ queueAppErrorReport: mockSend }));
jest.mock('../utils/logger', () => ({ logger: { captureException: jest.fn() } }));
jest.mock('expo-updates', () => ({ runtimeVersion: '0.1.48', updateId: null }));
jest.mock('expo-application', () => ({}));
jest.mock('../src/shared/monitoring/appErrorPayload', () => ({ appErrorScreenFromPath: () => 'help' }));
jest.mock('../src/shared/monitoring/nativeAppErrors', () => ({
  updateNativeAppErrorScreen: jest.fn(), updateNativeAppErrorIdentity: jest.fn(), updateNativeAppErrorRuntime: jest.fn(),
}));

test('reports a boundary outside orders once, without passing caller extras, and forgets the signed-out owner', async () => {
  const monitoring = require('../src/shared/monitoring');
  await monitoring.setMonitoringUser(42);
  monitoring.setMonitoringScreen('(main)/services/help/[ticket]');
  const error = new TypeError('failure');
  const context = { source: 'router_error_boundary', extra: { client: 'PRIVATE' } };
  monitoring.captureException(error, context, { componentStack: 'at HelpList' });
  monitoring.captureException(error, { source: 'global_error_handler' });
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockSend).toHaveBeenCalledWith({ ownerId: 42, screen: 'help', stage: undefined,
    source: 'react_boundary', error, componentStack: 'at HelpList' });
  await monitoring.setMonitoringUser(null);
  monitoring.captureException(new Error('signed out'));
  expect(mockSend).toHaveBeenCalledTimes(1);
});

test('the global JS handler reports an uncaught exception and preserves default fatal handling', async () => {
  jest.resetModules(); mockSend.mockClear();
  const previous = (globalThis as any).ErrorUtils;
  const fallback = jest.fn();
  let wrapped: ((e: Error, fatal: boolean) => void) | undefined;
  (globalThis as any).ErrorUtils = { getGlobalHandler: () => fallback, setGlobalHandler: (fn: typeof wrapped) => { wrapped = fn; } };
  try {
    const monitoring = require('../src/shared/monitoring');
    monitoring.installGlobalJsErrorHandler();
    await monitoring.setMonitoringUser(7);
    const error = new Error('uncaught');
    wrapped!(error, true);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ error, ownerId: 7, source: 'global_js' }));
    expect(fallback).toHaveBeenCalledWith(error, true);
  } finally { (globalThis as any).ErrorUtils = previous; }
});
