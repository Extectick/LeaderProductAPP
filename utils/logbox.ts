import { LogBox } from 'react-native';

const ignoredDevWarnings = [
  'SafeAreaView has been deprecated',
  'Due to changes in Androids permission requirements',
  '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method.',
  '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method.',
  'Ignoring DevTools app debug target',
];

declare global {
  // eslint-disable-next-line no-var
  var __leaderProductConsoleWarnPatched: boolean | undefined;
}

if (__DEV__) {
  LogBox.ignoreLogs(ignoredDevWarnings);

  if (!globalThis.__leaderProductConsoleWarnPatched) {
    globalThis.__leaderProductConsoleWarnPatched = true;
    const originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : ''))
        .join(' ');
      if (ignoredDevWarnings.some((warning) => message.includes(warning))) {
        return;
      }
      originalWarn(...args);
    };
  }
}
