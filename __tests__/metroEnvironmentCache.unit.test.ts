import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.join(__dirname, '../metro.config.js'), 'utf8');

function cacheVersion(env: Record<string, string>) {
  const load: any = (name: string) => name === 'expo/metro-config' ? {
    getDefaultConfig: () => ({ cacheVersion: 'base', transformer: {}, resolver: { assetExts: ['svg', 'png'], sourceExts: ['js'] } }),
  } : require(name);
  load.resolve = () => 'svg-transformer';
  const sandbox = { module: { exports: {} as any }, require: load, __dirname, process: { env } };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports.cacheVersion;
}

it('isolates cached transforms between dev and production API endpoints', () => {
  expect(cacheVersion({ EXPO_PUBLIC_API_URL_DEV: 'https://dev.leader-product.ru' }))
    .not.toBe(cacheVersion({ EXPO_PUBLIC_API_URL_DEV: 'https://api.leader-product.ru' }));
});

it('changes the cache key when the update channel or map settings change', () => {
  expect(cacheVersion({ EXPO_PUBLIC_UPDATE_CHANNEL: 'dev' }))
    .not.toBe(cacheVersion({ EXPO_PUBLIC_UPDATE_CHANNEL: 'prod' }));
  expect(cacheVersion({ EXPO_PUBLIC_MAP_STYLE_URL: 'https://maps.example/first' }))
    .not.toBe(cacheVersion({ EXPO_PUBLIC_MAP_STYLE_URL: 'https://maps.example/second' }));
});

it('is deterministic regardless of environment variable insertion order', () => {
  expect(cacheVersion({ EXPO_PUBLIC_UPDATE_CHANNEL: 'dev', EXPO_PUBLIC_API_URL_DEV: 'https://dev.example' }))
    .toBe(cacheVersion({ EXPO_PUBLIC_API_URL_DEV: 'https://dev.example', EXPO_PUBLIC_UPDATE_CHANNEL: 'dev' }));
});

it('does not include private environment values and distinguishes compilation modes', () => {
  expect(cacheVersion({ NODE_ENV: 'production', PRIVATE_BUILD_SECRET: 'one' }))
    .toBe(cacheVersion({ NODE_ENV: 'production', PRIVATE_BUILD_SECRET: 'two' }));
  expect(cacheVersion({ NODE_ENV: 'production' })).not.toBe(cacheVersion({ NODE_ENV: 'development' }));
});

it('uses the Expo asset integration without wrapping its serializer in plain Metro format', () => {
  const expoSerializer = jest.fn();
  const getDefaultConfig = jest.fn(() => ({
    cacheVersion: 'base', transformer: {},
    resolver: { assetExts: ['svg', 'png'], sourceExts: ['js'] },
    serializer: { customSerializer: expoSerializer },
  }));
  const getSentryExpoConfig = jest.fn((root, options) => options.getDefaultConfig(root));
  const load: any = (name: string) => {
    if (name === 'expo/metro-config') return { getDefaultConfig };
    if (name === '@sentry/react-native/metro') return { getSentryExpoConfig };
    return require(name);
  };
  load.resolve = () => 'svg-transformer';
  const sandbox = {
    module: { exports: {} as any }, require: load, __dirname,
    process: { env: { EXPO_PUBLIC_UPDATE_CHANNEL: 'dev', EXPO_PUBLIC_SENTRY_ENABLED: 'true' } },
  };
  vm.runInNewContext(source, sandbox);
  expect(getSentryExpoConfig).toHaveBeenCalledWith(__dirname, {
    getDefaultConfig, includeWebReplay: false,
  });
  expect(sandbox.module.exports.serializer.customSerializer).toBe(expoSerializer);
});
