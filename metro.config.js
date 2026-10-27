// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const crypto = require('node:crypto');

const sentryEnabled = process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true';
// Expo returns serialized assets, not the plain Metro { code, map } format.
// Use its asset plugin integration instead of wrapping customSerializer.
const config = sentryEnabled
  ? require('@sentry/react-native/metro').getSentryExpoConfig(__dirname, {
    getDefaultConfig,
    includeWebReplay: false,
  })
  : getDefaultConfig(__dirname);

// Native builds generate thousands of headers, objects and archives. They are
// not JS inputs; indexing their changes makes Metro crawl during a local build.
const previousBlockList = config.resolver.blockList || [];
const generatedDirectories = ['tmp', 'dev-builds', 'dist-help-android', 'dist-help-web'];
config.resolver.blockList = [
  ...(Array.isArray(previousBlockList) ? previousBlockList : [previousBlockList]),
  /[/\\](?:\.cxx|\.gradle)[/\\]/,
  /[/\\]android[/\\](?:app[/\\])?build[/\\]/,
  ...generatedDirectories.map(directory => new RegExp(
    '^' + path.resolve(__dirname, directory).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[/\\\\]|$)'
  )),
];

// Expo inlines EXPO_PUBLIC_* into production bundles. Its CI embed command
// disables --reset-cache, so dev/local/prod must not share transformed modules.
const publicEnvironment = Object.keys(process.env)
  .filter((key) => key.startsWith('EXPO_PUBLIC_'))
  .sort()
  .map((key) => [key, process.env[key]]);
const environmentHash = crypto
  .createHash('sha256')
  .update(JSON.stringify([process.env.NODE_ENV, publicEnvironment]))
  .digest('hex');
config.cacheVersion = `${config.cacheVersion || '1'}:public-env-${environmentHash}`;

// --- нужен ТОЛЬКО если импортируешь .svg как компоненты ---
// npm i -D react-native-svg-transformer (у тебя уже стоит)
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
config.resolver = {
  ...config.resolver,
  // expo-sqlite's web worker imports its WASM binary as an asset.
  assetExts: [...new Set([...config.resolver.assetExts.filter((ext) => ext !== 'svg'), 'wasm'])],
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

// --- ваш shim для tslib ---
const shimPath = path.resolve(__dirname, 'tslib-default-shim.js');
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'tslib' ||
    moduleName === 'tslib/tslib.js' ||
    moduleName === '../tslib.js' ||
    moduleName.startsWith('tslib/modules')
  ) {
    return context.resolveRequest(context, shimPath, platform);
  }
  if (typeof defaultResolveRequest === 'function') {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
