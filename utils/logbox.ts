import { LogBox } from 'react-native';

if (__DEV__) {
  LogBox.ignoreLogs([
    'SafeAreaView has been deprecated',
    'Due to changes in Androids permission requirements',
  ]);
}
