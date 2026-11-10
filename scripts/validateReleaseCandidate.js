const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const kind = process.env.RELEASE_KIND;
require('./releaseDiagnosticsPolicy').validateCandidate(process.env.EXPO_PUBLIC_UPDATE_CHANNEL, process.env.RELEASE_COMMIT_SHA, undefined, process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true');
const version = require('./readNativeVersion').readVersion();
const m = JSON.parse(fs.readFileSync('release-artifacts/' + (kind === 'apk' ? 'release-metadata.json' : 'ota-metadata.json')));
assert.equal(m.commitSha, process.env.RELEASE_COMMIT_SHA);
assert.equal(m.channel, process.env.EXPO_PUBLIC_UPDATE_CHANNEL);
assert.equal(kind === 'apk' ? m.versionName : m.runtimeVersion, version.versionName, 'Candidate native version mismatch');
assert.equal(kind === 'apk' ? m.versionCode : m.metadata.baseVersionCode, version.versionCode, 'Candidate native build mismatch');
if (kind === 'apk') {
  const file = 'release-artifacts/' + m.apkKey.split('/').pop();
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), m.checksum);
  if (m.channel === 'prod') assert.equal(m.buildType, 'release');
}
const release = 'com.leaderproduct.app@' + version.versionName + '+' + version.versionCode + (kind === 'ota' ? '-ota.' + m.commitSha.slice(0,12) : '');
fs.appendFileSync(process.env.GITHUB_ENV, 'SENTRY_DIST=' + version.versionCode + '\nEXPO_PUBLIC_SENTRY_RELEASE=' + release + '\n');
console.log('Candidate version, commit and channel verified');
