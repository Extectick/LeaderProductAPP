const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const TRACKING_PACKAGE = 'tracking';
const SERVICE_NAME = '.tracking.LeaderTrackingService';
const RECEIVER_NAME = '.tracking.LeaderTrackingBootReceiver';
const KOTLIN_DEPENDENCIES = [
  "implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'",
  "implementation 'com.google.android.gms:play-services-location:21.3.0'",
];

function ensurePermission(manifest, name) {
  manifest['uses-permission'] = manifest['uses-permission'] || [];
  if (!manifest['uses-permission'].some((permission) => permission.$?.['android:name'] === name)) {
    manifest['uses-permission'].push({ $: { 'android:name': name } });
  }
}

function ensureComponent(application, key, name, attributes, intentFilter) {
  application[key] = application[key] || [];
  let component = application[key].find((item) => item.$?.['android:name'] === name);
  if (!component) {
    component = { $: { 'android:name': name } };
    application[key].push(component);
  }
  component.$ = { ...component.$, ...attributes, 'android:name': name };
  if (intentFilter) component['intent-filter'] = [intentFilter];
}

function addDependencies(contents) {
  let next = contents;
  for (const dependency of KOTLIN_DEPENDENCIES) {
    if (next.includes(dependency)) continue;
    next = next.replace(/dependencies\s*\{/, `dependencies {\n    ${dependency}`);
  }
  if (next === contents) return contents;
  if (!next.includes(KOTLIN_DEPENDENCIES[0]) || !next.includes(KOTLIN_DEPENDENCIES[1])) {
    throw new Error('with-leader-native-tracking could not add Android tracking dependencies');
  }
  return next;
}

function addNativePackage(contents, packageName) {
  const importLine = `import ${packageName}.tracking.LeaderTrackingPackage`;
  let next = contents;
  if (!next.includes(importLine)) {
    next = next.replace(/^(package\s+[^\n]+\n)/m, `$1\n${importLine}\n`);
  }

  if (!next.includes('add(LeaderTrackingPackage())')) {
    const packageListPattern = /(PackageList\(this\)\.packages\.apply\s*\{)/;
    if (!packageListPattern.test(next)) {
      throw new Error('with-leader-native-tracking could not find PackageList in MainApplication.kt');
    }
    next = next.replace(packageListPattern, '$1\n              add(LeaderTrackingPackage())');
  }
  return next;
}

function writeFileIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return;
  fs.writeFileSync(filePath, contents, 'utf8');
}

function readTemplate(name, packageName) {
  const templatePath = path.join(__dirname, 'leader-tracking-native', name);
  const template = fs.readFileSync(templatePath, 'utf8');
  return template.replaceAll('__LEADER_APP_PACKAGE__', packageName);
}

function withLeaderNativeTracking(config) {
  if (!config.android?.package) {
    throw new Error('with-leader-native-tracking requires android.package in app config');
  }
  const packageName = config.android.package;

  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    ensurePermission(manifest, 'android.permission.RECEIVE_BOOT_COMPLETED');
    ensurePermission(manifest, 'android.permission.FOREGROUND_SERVICE');
    ensurePermission(manifest, 'android.permission.FOREGROUND_SERVICE_LOCATION');
    ensureComponent(application, 'service', SERVICE_NAME, {
      'android:exported': 'false',
      'android:foregroundServiceType': 'location',
    });
    ensureComponent(
      application,
      'receiver',
      RECEIVER_NAME,
      {
        'android:enabled': 'true',
        // BOOT_COMPLETED is sent by Android outside the application UID.
        'android:exported': 'true',
      },
      {
        action: [
          { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
          { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
        ],
      }
    );
    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = addDependencies(modConfig.modResults.contents);
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
        TRACKING_PACKAGE
      );
      for (const name of [
        'LeaderTrackingModule.kt',
        'LeaderTrackingPackage.kt',
        'LeaderTrackingService.kt',
        'LeaderTrackingBootReceiver.kt',
      ]) {
        writeFileIfChanged(path.join(sourceRoot, name), readTemplate(name, packageName));
      }
      return modConfig;
    },
  ]);

  return config;
}

module.exports = withLeaderNativeTracking;
