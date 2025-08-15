// const { getDefaultConfig } = require('expo/metro-config');

// const config = getDefaultConfig(__dirname);

// config.resolver.alias = {
//   '@': __dirname + '/app',
// };

// module.exports = config;

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// alias: заставим все импорты 'tslib' отдавать наш shim
config.resolver = config.resolver || {};
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  tslib: path.resolve(__dirname, 'tslib-default-shim.js'),
};

module.exports = config;
