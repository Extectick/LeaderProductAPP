// metro.config.js
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const crypto = require('crypto');

const config = getSentryExpoConfig(__dirname, { getDefaultConfig, includeWebReplay: false });
const publicEnv = Object.keys(process.env).filter(key => key.startsWith('EXPO_PUBLIC_')).sort()
  .map(key => [key, process.env[key]]);
config.cacheVersion = (config.cacheVersion || '1') + ':monitoring-' + crypto.createHash('sha256')
  .update(JSON.stringify([process.env.NODE_ENV, publicEnv])).digest('hex');

// --- нужен ТОЛЬКО если импортируешь .svg как компоненты ---
// npm i -D react-native-svg-transformer (у тебя уже стоит)
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
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
