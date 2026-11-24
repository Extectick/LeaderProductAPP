const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appId = process.env.LEADER_ANDROID_PACKAGE || 'com.leaderproduct.app';
const java = path.join(root, 'android/app/src/main/java');
const main = fs.readFileSync(path.join(java, ...appId.split('.'), 'MainApplication.kt'), 'utf8');
const initialize = 'com.leaderproduct.app.diagnostics.AppErrorStore.initialize(this)';
const register = 'add(com.leaderproduct.app.diagnostics.AppErrorsPackage())';
assert.equal(main.split(initialize).length, 2, 'Expected one native crash handler initialization');
assert.equal(main.split(register).length, 2, 'Expected one native diagnostics bridge registration');
assert.ok(main.indexOf('super.onCreate()') < main.indexOf(initialize) &&
  main.indexOf(initialize) < main.indexOf('loadReactNative(this)'), 'Initialize crash reporting before React Native');
const environment = process.env.EXPO_PUBLIC_UPDATE_CHANNEL === 'prod' ? 'production' : 'development';
for (const file of ['AppErrorStore.kt', 'AppErrorsPackage.kt', 'AppExitFrames.kt']) {
  const expected = fs.readFileSync(path.join(root, 'plugins/app-errors', file), 'utf8');
  const generated = fs.readFileSync(path.join(java, 'com/leaderproduct/app/diagnostics', file), 'utf8');
  assert.equal(generated, expected.replace('__LEADER_APP_ERROR_ENV__', environment),
    'Native crash reporter is stale or targets the wrong release channel: ' + file);
}
console.log('Native app-error reporting verified for ' + environment + '.');
