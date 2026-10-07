const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { bundle, map } = require('./crashSymbolFiles')(process.argv[2]);
assert.ok(fs.existsSync(bundle) && fs.existsSync(map), 'Bundle and source map required');
assert.ok(process.env.EXPO_PUBLIC_SENTRY_RELEASE && process.env.SENTRY_DIST, 'Release and native build required');

// The generic sourcemaps upload ignores binary Hermes bundles. The RN uploader
// supplies the Hermes source stub needed by the backend to resolve stack frames.
// verifyCrashSymbols separately waits for and checks actual processing; --wait
// is intentionally omitted because GlitchTip does not implement that CLI poll.
const result = spawnSync(process.execPath, [
  require.resolve('@sentry/cli/bin/sentry-cli'), 'react-native', 'gradle',
  '--bundle', bundle, '--sourcemap', map,
  '--release', process.env.EXPO_PUBLIC_SENTRY_RELEASE, '--dist', process.env.SENTRY_DIST,
], { env: process.env, stdio: 'inherit', timeout: 120000 });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
