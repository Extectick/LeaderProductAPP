const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

// Private SSH endpoint only. Never include source files or publish symbols with APK assets.
assert.equal(process.env.EXPO_PUBLIC_UPDATE_CHANNEL, 'dev');
assert.match(process.env.SENTRY_URL || '', /^http:\/\/127\.0\.0\.1:\d+\/?$/);
const root = path.resolve('android/app/build/intermediates/merged_native_libs/release/mergeReleaseNativeLibs/out/lib');
assert.ok(fs.existsSync(root), 'Unstripped native libraries must exist before publication');
const libraries = fs.readdirSync(root).flatMap(abi => fs.readdirSync(path.join(root, abi)).filter(f => f.endsWith('.so')));
assert.ok(libraries.includes('libhermes.so') && libraries.includes('libreactnative.so'), 'Hermes and React Native symbols required');
const result = spawnSync(process.execPath, [require.resolve('@sentry/cli/bin/sentry-cli'),
  'debug-files', 'upload', '--org', process.env.SENTRY_ORG, '--project', process.env.SENTRY_PROJECT,
  root], { env: process.env, stdio: 'inherit', timeout: 600000 });
if (result.error) throw result.error;
if (result.status !== 0) throw Error('Native symbol upload failed');
console.log(`Native libraries uploaded privately (${libraries.length} ABI/files).`);
