const fs = require('node:fs');
const assert = require('node:assert/strict');
if (process.env.EXPO_PUBLIC_UPDATE_CHANNEL !== 'dev' || process.env.EXPO_PUBLIC_SENTRY_ENABLED !== 'true') process.exit(0);
const base = 'android/app/src/main';
const main = fs.readFileSync(`${base}/java/com/leaderproduct/app/MainApplication.kt`, 'utf8');
assert.equal((main.match(/LeaderCrashReporting.initialize\(this\)/g) || []).length, 1);
assert.ok(main.includes('LeaderDiagnosticsPackage()'));
assert.ok(main.indexOf('LeaderCrashReporting.initialize') < main.indexOf('loadReactNative(this)'));
const native = fs.readFileSync(`${base}/java/com/leaderproduct/app/monitoring/LeaderCrashReporting.kt`, 'utf8');
for (const marker of ['options.isAnrEnabled = true', 'options.isEnableNdk = true', 'sanitizeEvent(event)',
  'setProcessStateSummary', 'getHistoricalProcessExitReasons', 'installation_id', 'exit_checkpoint']) assert.ok(native.includes(marker), marker);
const manifest = fs.readFileSync(`${base}/AndroidManifest.xml`, 'utf8');
assert.match(manifest, /android:name="io.sentry.auto-init"\s+android:value="false"/);
assert.ok(!native.includes('__LEADER_DSN__'));
console.log('Early native diagnostics, privacy hook, identity and process-exit collector verified.');
