const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

module.exports = function crashSymbolFiles(target) {
  if (target === '--apk') {
    const bundle = path.resolve('android/app/build/generated/assets/react/release/index.android.bundle');
    const map = path.resolve('android/app/build/generated/sourcemaps/react/release/index.android.bundle.map');
    const packager = path.resolve('android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map');
    // Same SDK operation that the disabled Gradle auto-upload task performs.
    const copied = spawnSync(process.execPath, [require.resolve('@sentry/react-native/scripts/copy-debugid.js'), packager, map], { stdio: 'inherit' });
    if (copied.status !== 0) throw Error('Could not transfer Hermes source-map debug ID');
    return { bundle, map };
  }
  const root = path.resolve(target || 'dist-ota');
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8'));
  const bundle = path.resolve(root, metadata.fileMetadata.android.bundle);
  if (!bundle.startsWith(root + path.sep)) throw Error('Bundle must be inside export directory');
  return { bundle, map: bundle + '.map' };
};
