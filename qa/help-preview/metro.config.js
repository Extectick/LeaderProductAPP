const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);
config.maxWorkers = 2;
config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.join(root, 'node_modules')];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath.replace(/\\/g, '/').endsWith('/src/features/help/HelpScreen.tsx')) {
    const fixture = moduleName === './useHelpService' ? 'serviceFixture.ts' : (moduleName === 'expo-router' || moduleName === 'expo-router/react-navigation') ? 'routerFixture.ts' : null;
    if (fixture) return context.resolveRequest(context, path.join(__dirname, fixture), platform);
  }
  const target = moduleName.startsWith('@/') ? path.join(root, moduleName.slice(2)) : moduleName;
  return context.resolveRequest(context, target, platform);
};
module.exports = config;
