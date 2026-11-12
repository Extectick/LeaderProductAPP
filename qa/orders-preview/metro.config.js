const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');
const root = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);
config.maxWorkers = 2;
config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.join(root, 'node_modules')];
config.resolver.blockList = [/[/\\](?:\.cxx|\.gradle)[/\\]/, /[/\\]android[/\\](?:app[/\\])?build[/\\]/, /[/\\]build[/\\](?:classes|kotlin|tmp|intermediates|generated|outputs|reports)[/\\]/, /[/\\](?:dev-builds|dist-orders-preview)[/\\]/];
config.resolver.resolveRequest = (context, name, platform) => {
  const origin = context.originModulePath;
  const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(origin), name) : name;
  const normalized = target.replace(/\\/g, '/').replace(/\.(tsx?|jsx?)$/, '');
  const fixture = name === 'expo-router' || name === 'expo-router/react-navigation' ? 'routerFixture.ts'
    : normalized.endsWith('/useClientOrdersWorkspace') ? 'workspaceFixture.ts'
    : normalized.endsWith('/useCustomerPurchaseHistory') ? 'purchaseFixture.ts'
    : normalized.endsWith('/useOrderShareActions') ? 'shareFixture.ts'
    : normalized.endsWith('/context/ThemeContext') ? 'themeFixture.tsx'
    : normalized.endsWith('/components/Navigation/useHeaderContentTopInset') ? 'headerFixture.ts'
    : normalized.endsWith('/utils/clientOrdersService') ? 'serviceFixture.ts'
    : normalized.endsWith('/utils/apiClient') || normalized.endsWith('/src/shared/api/httpClient') ? 'apiFixture.ts'
    : null;
  return context.resolveRequest(context, fixture ? path.join(__dirname, fixture) : target, platform);
};
module.exports = config;
