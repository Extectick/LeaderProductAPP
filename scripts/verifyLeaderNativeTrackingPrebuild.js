const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageName = process.env.LEADER_ANDROID_PACKAGE || 'com.leaderproduct.app';
const packagePath = packageName.split('.');

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected generated file is missing: ${relativePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function requireText(relativePath, text) {
  if (!read(relativePath).includes(text)) {
    throw new Error(`Expected ${JSON.stringify(text)} in ${relativePath}`);
  }
}

const kotlinRoot = path.join('android', 'app', 'src', 'main', 'java', ...packagePath);

requireText(path.join(kotlinRoot, 'tracking', 'LeaderTrackingService.kt'), 'class LeaderTrackingService');
requireText(path.join(kotlinRoot, 'tracking', 'LeaderTrackingSecureStore.kt'), 'object LeaderTrackingSecureStore');
requireText(path.join(kotlinRoot, 'tracking', 'LeaderTrackingModule.kt'), 'class LeaderTrackingModule');
requireText(path.join(kotlinRoot, 'tracking', 'LeaderTrackingPackage.kt'), 'class LeaderTrackingPackage');
requireText(path.join(kotlinRoot, 'tracking', 'LeaderTrackingBootReceiver.kt'), 'class LeaderTrackingBootReceiver');
requireText(path.join(kotlinRoot, 'MainApplication.kt'), 'add(LeaderTrackingPackage())');
requireText('android/app/src/main/AndroidManifest.xml', '.tracking.LeaderTrackingService');
requireText('android/app/src/main/AndroidManifest.xml', '.tracking.LeaderTrackingBootReceiver');
requireText('android/app/src/main/AndroidManifest.xml', 'android.permission.RECEIVE_BOOT_COMPLETED');
requireText('android/app/src/main/AndroidManifest.xml', 'android.permission.ACCESS_NETWORK_STATE');
requireText('android/app/build.gradle', "implementation 'com.google.android.gms:play-services-location:21.3.0'");
requireText('android/app/build.gradle', "implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'");

console.log(`Leader native tracking prebuild verification passed for ${packageName}.`);
