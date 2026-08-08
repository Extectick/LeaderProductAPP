globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Unit tests must never reach the network. Replacing jest-expo's lazy native
// fetch getter also keeps jest.resetModules() from loading torn-down Expo
// native modules while Jest inspects globals between tests.
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: jest.fn(() => Promise.reject(new Error('Unexpected network request in unit test'))),
});

const originalConsoleError = console.error;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    const firstArg = args[0];
    if (typeof firstArg === 'string' && firstArg.includes('react-test-renderer is deprecated')) {
      return;
    }
    originalConsoleError(...args);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});
