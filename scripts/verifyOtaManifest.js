#!/usr/bin/env node
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');

function verifyManifest(manifest, release) {
  if (manifest.id !== release.updateId || manifest.runtimeVersion !== release.runtimeVersion) {
    throw new Error('API returned a different OTA release/runtime');
  }
  const expected = release.metadata?.expoClient;
  if (!expected?.scheme || !isDeepStrictEqual(manifest.extra?.expoClient, expected)) {
    throw new Error('API OTA expoClient does not match the build config; do not accept this release');
  }
  if (manifest.launchAsset?.hash !== release.launchAssetHash) {
    throw new Error('API OTA launch asset does not match the release');
  }
}

async function main() {
  const file = process.argv[2];
  const url = process.env.EXPO_PUBLIC_OTA_UPDATE_URL;
  if (!file || !url) throw new Error('Provide metadata path and EXPO_PUBLIC_OTA_UPDATE_URL');
  const release = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Publication probes must participate even in staged rollouts.
  // Find an included device with the same stable bucket used by the API.
  const crypto = require('node:crypto');
  let deviceId;
  for (let i = 0; i < 10000; i += 1) {
    const candidate = `ota-release-verification-${i}`;
    const bucket = parseInt(crypto.createHash('sha1').update(`${candidate}:${release.updateId}`).digest('hex').slice(0, 8), 16) % 100;
    if (bucket < release.rolloutPercent) { deviceId = candidate; break; }
  }
  if (!deviceId) throw new Error('Cannot verify an inactive/zero-percent OTA release');
  const response = await fetch(url, {
    headers: { 'expo-platform': release.platform, 'expo-runtime-version': release.runtimeVersion,
      'expo-channel-name': release.channel, 'expo-device-id': deviceId, 'expo-protocol-version': '1',
      accept: 'multipart/mixed, application/expo+json, application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status !== 200) throw new Error(`OTA check returned HTTP ${response.status}`);
  const body = await response.text();
  const manifest = response.headers.get('content-type')?.includes('multipart/')
    ? JSON.parse(body.split('\r\n\r\n')[1].split('\r\n--')[0])
    : JSON.parse(body);
  verifyManifest(manifest, release);
  console.log(`Verified OTA config and bundle: ${release.channel}/${release.runtimeVersion}/${release.updateId}`);
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { verifyManifest };
