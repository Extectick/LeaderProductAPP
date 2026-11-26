const fs = require('node:fs');
const path = require('node:path');
const { withMainApplication, withDangerousMod } = require('expo/config-plugins');

function patchApplication(source) {
  const initializer = 'com.leaderproduct.app.diagnostics.AppErrorStore.initialize(this)';
  const registration = 'add(com.leaderproduct.app.diagnostics.AppErrorsPackage())';
  const packages = /PackageList\(this\)\.packages\.apply\s*\{/;
  if (!source.includes('super.onCreate()') || !packages.test(source)) {
    throw new Error('Cannot register app error diagnostics in MainApplication');
  }
  if (!source.includes(initializer)) source = source.replace('super.onCreate()', 'super.onCreate()\n    ' + initializer);
  if (!source.includes(registration)) source = source.replace(packages, match => match + '\n              ' + registration);
  return source;
}

module.exports = function withAppErrors(config) {
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Expected Kotlin MainApplication');
    mod.modResults.contents = patchApplication(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const source = path.join(__dirname, 'app-errors');
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/leaderproduct/app/diagnostics');
    fs.mkdirSync(destination, { recursive: true });
    const environment = process.env.EXPO_PUBLIC_UPDATE_CHANNEL === 'prod' ? 'production' : 'development';
    for (const name of fs.readdirSync(source).filter(name => name.endsWith('.kt'))) {
      const kotlin = fs.readFileSync(path.join(source, name), 'utf8');
      fs.writeFileSync(path.join(destination, name), kotlin.replace('__LEADER_APP_ERROR_ENV__', environment));
    }
    return mod;
  }]);
};

module.exports.patchApplication = patchApplication;
