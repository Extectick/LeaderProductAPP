const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Путь к нашему шиму
const shimPath = path.resolve(__dirname, 'tslib-default-shim.js');

// Сохраняем дефолтный резолвер (если есть)
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Любые обращения к tslib (включая её внутренние относительные импорты)
  if (
    moduleName === 'tslib' ||
    moduleName === 'tslib/tslib.js' ||
    moduleName === '../tslib.js' ||               // то самое из modules/index.js
    moduleName.startsWith('tslib/modules')        // на всякий случай
  ) {
    return context.resolveRequest(context, shimPath, platform);
  }

  // Фолбэк
  if (typeof defaultResolveRequest === 'function') {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
