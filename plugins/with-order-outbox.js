const { withAndroidManifest, withAppBuildGradle, withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function withOrderOutbox(config) {
  const appPackage = config.android?.package;
  if (!appPackage) throw new Error('Order outbox requires android.package');
  config = withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] ||= [];
    for (const name of ['android.permission.ACCESS_NETWORK_STATE','android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_DATA_SYNC']) {
      if (!manifest['uses-permission'].some(item => item.$?.['android:name'] === name)) manifest['uses-permission'].push({ $: { 'android:name': name } });
    }
    const application = manifest.application[0];
    application.service ||= [];
    const name = 'androidx.work.impl.foreground.SystemForegroundService';
    let service = application.service.find(item => item.$?.['android:name'] === name);
    if (!service) { service = { $: { 'android:name': name } }; application.service.push(service); }
    service.$['android:foregroundServiceType'] = 'dataSync';
    service.$['android:exported'] = 'false';
    return mod;
  });
  config = withAppBuildGradle(config, mod => {
    for (const dependency of ["implementation project(':expo-background-task')", "implementation 'androidx.work:work-runtime-ktx:2.9.1'"]) {
      if (!mod.modResults.contents.includes(dependency)) mod.modResults.contents = mod.modResults.contents.replace(/dependencies\s*\{/, `dependencies {\n    ${dependency}`);
    }
    return mod;
  });
  config = withMainApplication(config, mod => {
    const importLine = `import ${appPackage}.orderoutbox.LeaderOrderOutboxPackage`;
    if (!mod.modResults.contents.includes(importLine)) mod.modResults.contents = mod.modResults.contents.replace(/^(package\s+[^\n]+\n)/m, `$1\n${importLine}\n`);
    if (!mod.modResults.contents.includes('add(LeaderOrderOutboxPackage())')) {
      if (!/PackageList\(this\)\.packages\.apply\s*\{/.test(mod.modResults.contents)) throw new Error('Order outbox: PackageList not found');
      mod.modResults.contents = mod.modResults.contents.replace(/(PackageList\(this\)\.packages\.apply\s*\{)/, '$1\n              add(LeaderOrderOutboxPackage())');
    }
    return mod;
  });
  return withDangerousMod(config, ['android', mod => {
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java', ...appPackage.split('.'), 'orderoutbox');
    fs.mkdirSync(destination, { recursive: true });
    for (const name of ['LeaderOrderOutboxPackage.kt','LeaderOrderOutboxModule.kt','LeaderOrderOutboxWorker.kt']) {
      const source = fs.readFileSync(path.join(__dirname, 'leader-order-outbox-native', name), 'utf8').replaceAll('__LEADER_APP_PACKAGE__', appPackage);
      fs.writeFileSync(path.join(destination, name), source, 'utf8');
    }
    return mod;
  }]);
};
