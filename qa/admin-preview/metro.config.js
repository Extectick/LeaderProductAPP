const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');
const root = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);
config.maxWorkers = 2;
config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.join(root, 'node_modules')];
config.resolver.blockList = [/[/\\](?:\.cxx|\.gradle)[/\\]/, /[/\\]android[/\\](?:app[/\\])?build[/\\]/, /[/\\]build[/\\](?:classes|kotlin|tmp|intermediates|generated|outputs|reports)[/\\]/, /[/\\](?:dev-builds|dist-admin-web|dist-admin-native)[/\\]/];
config.resolver.resolveRequest = (context, name, platform) => {
  const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : name;
  const normalized = target.replace(/\\/g, '/');
  const fixture = name === 'expo-router' || name === 'expo-router/react-navigation' ? 'navigationFixture.tsx'
    : /(?:^|\/)utils\/apiClient$/.test(normalized) || name === './apiClient' || name === '../apiClient' ? 'apiFixture.ts'
    : normalized.endsWith('/hooks/useIsAdmin') ? 'navigationFixture.tsx'
    : normalized.endsWith('/context/AuthContext') ? 'authFixture.tsx'
    : null;
  return context.resolveRequest(context, fixture ? path.join(__dirname, fixture) : target, platform);
};
module.exports = config;
