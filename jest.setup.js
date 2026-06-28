globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
