const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const DOWNLOADS_PACKAGE = 'downloads';

function ensureLegacyWritePermission(manifest) {
  manifest['uses-permission'] = manifest['uses-permission'] || [];
  const name = 'android.permission.WRITE_EXTERNAL_STORAGE';
  let permission = manifest['uses-permission'].find((item) => item.$?.['android:name'] === name);
  if (!permission) {
    permission = { $: { 'android:name': name } };
    manifest['uses-permission'].push(permission);
  }
  permission.$['android:maxSdkVersion'] = '28';
}

function addNativePackage(contents, packageName) {
  const importLine = `import ${packageName}.downloads.LeaderDownloadsPackage`;
  let next = contents;
  if (!next.includes(importLine)) {
    next = next.replace(/^(package\s+[^\n]+\n)/m, `$1\n${importLine}\n`);
  }

  if (!next.includes('add(LeaderDownloadsPackage())')) {
    const packageListPattern = /(PackageList\(this\)\.packages\.apply\s*\{)/;
    if (!packageListPattern.test(next)) {
      throw new Error('with-android-file-download could not find PackageList in MainApplication.kt');
    }
    next = next.replace(packageListPattern, '$1\n              add(LeaderDownloadsPackage())');
  }
  return next;
}

function readTemplate(name, packageName) {
  const templatePath = path.join(__dirname, 'leader-downloads-native', name);
  return fs.readFileSync(templatePath, 'utf8').replaceAll('__LEADER_APP_PACKAGE__', packageName);
}

function writeFileIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return;
  fs.writeFileSync(filePath, contents, 'utf8');
}

function withAndroidFileDownload(config) {
  const packageName = config.android?.package;
  if (!packageName) throw new Error('with-android-file-download requires android.package');

  config = withAndroidManifest(config, (modConfig) => {
    ensureLegacyWritePermission(modConfig.modResults.manifest);
    return modConfig;
  });

  config = withMainApplication(config, (modConfig) => {
    modConfig.modResults.contents = addNativePackage(modConfig.modResults.contents, packageName);
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    (modConfig) => {
      const sourceRoot = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.'),
        DOWNLOADS_PACKAGE
      );
      for (const name of ['LeaderDownloadsModule.kt', 'LeaderDownloadsPackage.kt']) {
        writeFileIfChanged(path.join(sourceRoot, name), readTemplate(name, packageName));
      }
      return modConfig;
    },
  ]);

  return config;
}

module.exports = withAndroidFileDownload;
