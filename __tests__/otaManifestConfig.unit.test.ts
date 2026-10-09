const { buildOtaExpoConfig } = require('../scripts/otaExpoConfig');
const { verifyManifest } = require('../scripts/verifyOtaManifest');

let mockManifest: any;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone', get expoConfig() { return mockManifest.extra.expoClient; } },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));
const { resolveScheme } = require('expo-linking');
const config = {
  name: 'Лидер Продукт', slug: 'leader-product', version: '0.1.33', scheme: 'leaderproduct',
  android: { package: 'com.leaderproduct.app', versionCode: 32, config: { private: 'SECRET' } },
  ios: { bundleIdentifier: 'com.leaderproduct.app', buildNumber: '32' },
  extra: { router: {}, eas: { projectId: 'test-project' }, private: 'SECRET' },
  plugins: [['private-plugin', { token: 'SECRET' }]], _internal: { projectRoot: 'PRIVATE_PATH' },
  hooks: { private: 'SECRET' }, updates: { codeSigningCertificate: 'SECRET', requestHeaders: { token: 'SECRET' } },
};

test('preserves native identity and router config without publishing build-only/private fields', () => {
  const result = buildOtaExpoConfig(config, '0.1.33', 'android');
  expect(result).toMatchObject({ scheme: 'leaderproduct', runtimeVersion: '0.1.33',
    android: { package: 'com.leaderproduct.app', versionCode: 32 },
    extra: { router: {}, eas: { projectId: 'test-project' } } });
  expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE_PATH|plugins|_internal|hooks/);
});

test('reproduces the production expo-linking error and resolves navigation with the repaired manifest', () => {
  mockManifest = { extra: { expoClient: {} } };
  expect(() => resolveScheme({})).toThrow('expo-linking needs access');
  mockManifest.extra.expoClient = buildOtaExpoConfig(config, '0.1.33', 'android');
  expect(resolveScheme({})).toBe('leaderproduct');
});

test('cannot publish a new bundle under an older native runtime', () => {
  expect(() => buildOtaExpoConfig(config, '0.1.26', 'android')).toThrow('older APK');
});

test.each([undefined, '', [], ['bad scheme'], 42])('rejects missing/invalid scheme %j', (scheme) => {
  expect(() => buildOtaExpoConfig({ ...config, scheme }, '0.1.33', 'android')).toThrow('scheme');
});

test('rejects missing platform identity', () => {
  expect(() => buildOtaExpoConfig({ ...config, android: {} }, '0.1.33', 'android')).toThrow('android.package');
  expect(() => buildOtaExpoConfig({ ...config, ios: {} }, '0.1.33', 'ios')).toThrow('ios.bundleIdentifier');
});

test('allows registered scheme arrays', () => {
  expect(buildOtaExpoConfig({ ...config, scheme: ['leaderproduct', 'com.leaderproduct.app'] }, '0.1.33', 'android').scheme)
    .toEqual(['leaderproduct', 'com.leaderproduct.app']);
});

test('post-publication check detects an old API serving an empty expoClient', () => {
  const expoClient = buildOtaExpoConfig(config, '0.1.33', 'android');
  const release = { updateId: 'new-id', runtimeVersion: '0.1.33', launchAssetHash: 'hash', metadata: { expoClient } };
  const manifest = { id: 'new-id', runtimeVersion: '0.1.33', launchAsset: { hash: 'hash' }, extra: { expoClient } };
  expect(() => verifyManifest(manifest, release)).not.toThrow();
  expect(() => verifyManifest({ ...manifest, extra: { expoClient: {} } }, release)).toThrow('expoClient');
  expect(() => verifyManifest({ ...manifest, id: 'old-id' }, release)).toThrow('different');
  expect(() => verifyManifest({ ...manifest, launchAsset: { hash: 'other' } }, release)).toThrow('launch asset');
});

test('metadata CLI includes config from the real project without uploading or publishing', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leader-ota-config-'));
  const output = path.join(dir, 'release.json');
  const version = require('../scripts/readNativeVersion').readVersion();
  try {
    fs.writeFileSync(path.join(dir, 'bundle.hbc'), 'test-fixture-not-a-publishable-bundle');
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({
      version: 0, bundler: 'metro', fileMetadata: { android: { bundle: 'bundle.hbc', assets: [] } },
    }));
    execFileSync(process.execPath, ['scripts/createOtaMetadata.js', dir, '--out', output,
      '--platform', 'android', '--channel', 'dev', '--runtimeVersion', version.versionName], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test', EXPO_PUBLIC_SENTRY_ENABLED: 'false' },
      stdio: 'pipe', timeout: 60000,
    });
    const release = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(release.metadata.expoConfigSchemaVersion).toBe(1);
    expect(release.metadata.expoClient).toMatchObject({
      scheme: 'leaderproduct', runtimeVersion: version.versionName, version: version.versionName,
      android: { package: 'com.leaderproduct.app', versionCode: version.versionCode },
    });
    mockManifest = { extra: { expoClient: release.metadata.expoClient } };
    expect(resolveScheme({})).toBe('leaderproduct');
  } finally {
    for (const file of ['bundle.hbc', 'metadata.json', 'release.json']) {
      const target = path.join(dir, file);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(dir);
  }
}, 70000);
