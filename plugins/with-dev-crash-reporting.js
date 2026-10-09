const fs = require('node:fs');
const path = require('node:path');
const { withMainApplication, withDangerousMod, withAndroidManifest } = require('expo/config-plugins');

function nativeSource(dsn) {
  return fs.readFileSync(path.join(__dirname, 'leader-diagnostics/LeaderCrashReporting.kt'), 'utf8')
    .replace('__LEADER_DSN__', JSON.stringify(String(dsn)).replace(/\$/g, '\\$'));
}
function patchMainApplication(source, enabled) {
  let clean = source
    .replace(/\n[ \t]*com\.leaderproduct\.app\.monitoring\.LeaderCrashReporting\.initialize\(this\)/g, '')
    .replace(/\n[ \t]*add\(com\.leaderproduct\.app\.monitoring\.LeaderDiagnosticsPackage\(\)\)/g, '');
  if (!enabled) return clean;
  if (!clean.includes('super.onCreate()')) throw new Error('Missing MainApplication.onCreate');
  clean = clean.replace('super.onCreate()', 'super.onCreate()\n    com.leaderproduct.app.monitoring.LeaderCrashReporting.initialize(this)');
  const packages = /(PackageList\(this\)\.packages\.apply\s*\{)/;
  if (packages.test(clean)) clean = clean.replace(packages, '$1\n              add(com.leaderproduct.app.monitoring.LeaderDiagnosticsPackage())');
  return clean;
}
module.exports = function withDevCrashReporting(config) {
  const enabled = process.env.EXPO_PUBLIC_UPDATE_CHANNEL === 'dev' && process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true';
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
  if (enabled && !/^https:\/\/[^\s]+@dev\.leader-product\.ru\/sentry\/\d+$/.test(dsn)) throw new Error('Dev diagnostics requires its own HTTPS DSN');
  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Expected Kotlin MainApplication');
    if (enabled && !/PackageList\(this\)\.packages\.apply/.test(mod.modResults.contents)) throw new Error('Missing native package list');
    mod.modResults.contents = patchMainApplication(mod.modResults.contents, enabled);
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    if (enabled) {
      const app = mod.modResults.manifest.application[0];
      app['meta-data'] = (app['meta-data'] || []).filter((entry) => entry.$['android:name'] !== 'io.sentry.auto-init');
      app['meta-data'].push({ $: { 'android:name': 'io.sentry.auto-init', 'android:value': 'false' } });
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    if (!enabled) return mod;
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/leaderproduct/app/monitoring');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'LeaderCrashReporting.kt'), nativeSource(dsn));
    for (const name of ['LeaderDiagnosticsModule.kt', 'LeaderDiagnosticsPackage.kt']) {
      fs.copyFileSync(path.join(__dirname, 'leader-diagnostics', name), path.join(directory, name));
    }
    return mod;
  }]);
};
module.exports.patchMainApplication = patchMainApplication;
module.exports.nativeSource = nativeSource;
