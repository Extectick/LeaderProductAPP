import { LogBox } from 'react-native';

if (__DEV__) {
  LogBox.ignoreLogs([
    'SafeAreaView has been deprecated',
    'Due to changes in Androids permission requirements',
    '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method.',
    '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method.',
    'Ignoring DevTools app debug target',
  ]);
}
