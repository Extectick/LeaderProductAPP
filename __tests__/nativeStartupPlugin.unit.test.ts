import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(__dirname, '../plugins/with-android-native-ota-loader.js'), 'utf8');
const sandbox: any = { module: { exports: {} }, require: (name: string) => name === 'expo/config-plugins' ? {
  AndroidConfig: { Manifest: { getMainApplicationOrThrow: (value: any) => value.manifest.application[0] } },
} : require(name) };
vm.runInNewContext(`${source}\nmodule.exports = { updateManifest, updateMainActivity, startupOverlaySource, ensureCoroutinesDependency, upsertGradleProperty };`, sandbox);
const plugin = sandbox.module.exports;
const kotlin: string = plugin.startupOverlaySource('com.leaderproduct.app');
const launcher = { action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }], category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }] };
const deepLink = { action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }], data: [{ $: { 'android:scheme': 'leaderproduct' } }] };
const template = `package com.leaderproduct.app
import expo.modules.splashscreen.SplashScreenManager
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // @generated begin expo-splashscreen - expo prebuild
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }
  override fun invokeDefaultOnBackPressed() { moveTaskToBack(false) }
}
`;

it('migrates the legacy gate to a compatibility alias and one singleTask launcher', () => {
  const main = { $: { 'android:name': '.MainActivity', 'android:theme': '@style/Theme.App.SplashScreen', 'android:exported': 'false' } };
  const other = { $: { 'android:name': '.OtherActivity' } };
  const manifest: any = { manifest: { application: [{ activity: [main, other,
    { $: { 'android:name': '.UpdateGateActivity' }, 'intent-filter': [launcher, deepLink] },
  ] }] } };
  plugin.updateManifest(manifest, 'com.leaderproduct.app');
  const app = manifest.manifest.application[0];
  expect(app.activity).toEqual([main, other]);
  expect(app.activity[0]['intent-filter']).toEqual([launcher, deepLink]);
  expect(main.$['android:exported']).toBe('true');
  expect((main.$ as any)['android:launchMode']).toBe('singleTask');
  expect(main.$['android:theme']).toBe('@style/Theme.App.SplashScreen');
  expect(app['activity-alias']).toEqual([{ $: {
    'android:name': '.UpdateGateActivity', 'android:targetActivity': '.MainActivity', 'android:exported': 'true',
  } }]);
  const first = JSON.stringify(manifest);
  plugin.updateManifest(manifest, 'com.leaderproduct.app');
  expect(JSON.stringify(manifest)).toBe(first);
});

it('preserves fresh launcher/deep links and deduplicates filters from incremental prebuild', () => {
  const manifest: any = { manifest: { application: [{ activity: [
    { $: { 'android:name': '.MainActivity' }, 'intent-filter': [launcher, deepLink] },
    { $: { 'android:name': '.UpdateGateActivity' }, 'intent-filter': [launcher] },
  ] }] } };
  plugin.updateManifest(manifest, 'com.leaderproduct.app');
  const app = manifest.manifest.application[0];
  expect(app.activity[0]['intent-filter']).toEqual([launcher, deepLink]);
  expect(app['meta-data'].find((entry: any) => entry.$['android:name'].endsWith('CHECK_ON_LAUNCH')).$['android:value']).toBe('ALWAYS');
  expect(app['meta-data'].find((entry: any) => entry.$['android:name'].endsWith('LAUNCH_WAIT_MS')).$['android:value']).toBe('8000');
});

it('patches MainActivity idempotently without replacing back/navigation lifecycle', () => {
  const patched: string = plugin.updateMainActivity(template);
  expect(plugin.updateMainActivity(patched)).toBe(patched);
  expect(patched).not.toContain('SplashScreenManager');
  expect(patched.match(/installSplashScreen\(\)/g)).toHaveLength(1);
  expect(patched.indexOf('startupOverlay = LeaderStartupOverlay(this)')).toBeLessThan(patched.indexOf('super.onCreate(null)'));
  expect(patched.indexOf('startupOverlay?.show()')).toBeGreaterThan(patched.indexOf('super.onCreate(null)'));
  expect(patched).toContain('splashScreen.setOnExitAnimationListener { it.remove() }');
  expect(patched).toContain('override fun invokeDefaultOnBackPressed() { moveTaskToBack(false) }');
  expect(patched).toContain('startupOverlay?.dispose()');
  expect(patched).not.toMatch(/onResume|onNewIntent|startActivity/);
});

it('preserves an existing destroy handler and refuses unknown MainActivity templates', () => {
  const patched = plugin.updateMainActivity(template.replace('  override fun invokeDefaultOnBackPressed()', '  override fun onDestroy() {\n    releaseOtherResource()\n    super.onDestroy()\n  }\n  override fun invokeDefaultOnBackPressed()'));
  expect(plugin.updateMainActivity(patched)).toBe(patched);
  expect(patched.match(/override fun onDestroy/g)).toHaveLength(1);
  expect(patched).toContain('releaseOtherResource()');
  expect(() => plugin.updateMainActivity('class SomeOtherActivity {}')).toThrow('Unsupported MainActivity');
});

it('runs after the real Expo splash mod in the configured prebuild order', async () => {
  const actualPlugin = require('../plugins/with-android-native-ota-loader');
  const { withAndroidSplashMainActivity } = require(path.join(__dirname, '../node_modules/expo-splash-screen/plugin/build/withAndroidSplashMainActivity.js'));
  const config = withAndroidSplashMainActivity(actualPlugin({ name: 'Leader', slug: 'leader', android: { package: 'com.leaderproduct.app' } }));
  const result = await config.mods.android.mainActivity({
    ...config, modResults: { language: 'kt', contents: template }, modRequest: { platform: 'android', modName: 'mainActivity' },
  });
  expect(result.modResults.contents).not.toContain('SplashScreenManager');
  expect(result.modResults.contents.match(/installSplashScreen\(\)/g)).toHaveLength(1);
  expect(plugin.updateMainActivity(result.modResults.contents)).toBe(result.modResults.contents);
  const appConfig = fs.readFileSync(path.join(__dirname, '../app.config.ts'), 'utf8');
  expect(appConfig.indexOf('"./plugins/with-android-native-ota-loader"')).toBeLessThan(appConfig.indexOf('"expo-splash-screen"'));
});

it('leaves initialization and the single Expo event observer exclusively to the SDK', () => {
  expect(kotlin).not.toMatch(/eventManager\.observer\s*=|controller\.start\(|launchAssetFile|initializeWithoutStarting|checkForUpdate\(|fetchUpdate\(|startActivity\(|finish\(/);
  expect(kotlin).toContain('withContext(Dispatchers.IO)');
  expect(kotlin).toContain('getConstantsForModule().initialContext');
  expect(kotlin).toContain('repeatOnLifecycle(Lifecycle.State.STARTED)');
  expect(kotlin).toContain('catch (cancelled: CancellationException) { throw cancelled }');
  expect(kotlin).toContain('ReactMarkerConstants.CONTENT_APPEARED');
  expect(kotlin).toContain('ReactMarker.removeListener(contentListener)');
  expect(kotlin).toContain('progressJob?.cancel()');
  expect(kotlin).toContain('if (disposed || rootView != null');
  expect(source).toContain("CUSTOM_INIT_PROPERTY, 'false'");
  expect(source).toContain("'EX_UPDATES_ANDROID_DELAY_LOAD_APP', 'true'");
});

it('shows only a logo while checking, progress only while downloading, with no minimum hold', () => {
  expect(kotlin).toContain('else -> renderStage(Stage.LOGO)');
  expect(kotlin).toContain('progressBar.visibility = if (downloading) View.VISIBLE else View.GONE');
  expect(kotlin).toContain('setImageResource(R.drawable.splashscreen_logo)');
  expect(kotlin).toContain('FrameLayout.LayoutParams(dp(288), dp(288), Gravity.CENTER)');
  expect(kotlin).toContain('root.height / 2 + dp(128)');
  expect(kotlin).toContain('"Обновляем"');
  expect(kotlin).not.toMatch(/Thread\.sleep|minimumDisplay|minimumDuration|hintView/);
  expect(kotlin.match(/\bdelay\(/g)).toHaveLength(1);
  expect(kotlin).toContain('delay(250) // Sampling interval');
});

it('does not gate React content on APK checks or show a checking modal', () => {
  const layout = fs.readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8');
  expect(layout).toContain('onLayout={handleRootLayout}');
  expect(layout).not.toMatch(/updateReady|onStartupDone|showCheckingOverlay|minSplashReady/);
  const updater = fs.readFileSync(path.join(__dirname, '../components/UpdateGate.tsx'), 'utf8');
  expect(updater).not.toMatch(/STARTUP_MAX_WAIT_MS|onStartupDone|showCheckingOverlay|Проверка наличия обновлений/);
});

it('sets Gradle flags and dependencies idempotently', () => {
  const gradle = plugin.ensureCoroutinesDependency('dependencies {\n}\n');
  expect(gradle).toContain('androidx.core:core-splashscreen:1.2.0');
  expect(plugin.ensureCoroutinesDependency(gradle)).toBe(gradle);
  const properties = plugin.upsertGradleProperty('EX_UPDATES_CUSTOM_INIT=true\n', 'EX_UPDATES_CUSTOM_INIT', 'false');
  expect(properties).toBe('EX_UPDATES_CUSTOM_INIT=false\n');
  expect(plugin.upsertGradleProperty(properties, 'EX_UPDATES_CUSTOM_INIT', 'false')).toBe(properties);
});
