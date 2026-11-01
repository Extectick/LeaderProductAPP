const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);
config.maxWorkers = 2;
config.watchFolders = [root];
// Native rebuilds produce thousands of files outside this fixture's JS graph.
// Watching them stalls Hermes diagnostics and Fast Refresh during emulator QA.
const previousBlockList = config.resolver.blockList || [];
config.resolver.blockList = [
  ...(Array.isArray(previousBlockList) ? previousBlockList : [previousBlockList]),
  /[/\\](?:\.cxx|\.gradle)[/\\]/,
  /[/\\]android[/\\](?:app[/\\])?build[/\\]/,
  /[/\\](?:tmp|dev-builds|dist-help-android|dist-help-web)[/\\]/,
];
config.resolver.nodeModulesPaths = [path.join(root, 'node_modules')];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath.replace(/\\/g, '/');
  if (platform === 'web' && (moduleName === 'expo-media-library' || moduleName.startsWith('expo-media-library/') || origin.includes('/node_modules/expo-media-library/') && moduleName.includes('ExpoMediaLibraryNext'))) {
    return context.resolveRequest(context, path.join(__dirname, 'mediaLibraryModuleFixture.ts'), platform);
  }
  if (platform === 'web' && origin.includes('/src/features/help/') && moduleName.endsWith('helpPhotoLibrary')) {
    return context.resolveRequest(context, path.join(__dirname, 'photoLibraryFixture.ts'), platform);
  }
  if (platform === 'web' && origin.endsWith('/src/features/help/components/HelpPhotoCamera.tsx') && moduleName === 'expo-camera') {
    return context.resolveRequest(context, path.join(__dirname, 'cameraFixture.tsx'), platform);
  }
  if (origin.endsWith('/src/features/services/ui/ServicesCatalogScreen.tsx')) {
    if (moduleName === '../hooks/useServicesData' || moduleName === '@/hooks/useIsAdmin' || moduleName === '@/src/shared/network/useServerStatus') {
      return context.resolveRequest(context, path.join(__dirname, 'catalogFixture.ts'), platform);
    }
    if (moduleName === 'expo-router') return context.resolveRequest(context, path.join(__dirname, 'routerFixture.ts'), platform);
  }
  if (origin.endsWith('/components/ui/AppScreenBlur.tsx') && moduleName === 'expo-router/react-navigation') {
    return context.resolveRequest(context, path.join(__dirname, 'routerFixture.ts'), platform);
  }
  if (origin.endsWith('/src/features/help/HelpScreen.tsx')) {
    const fixture = moduleName === './useHelpService' ? 'serviceFixture.ts' : (moduleName === 'expo-router' || moduleName === 'expo-router/react-navigation') ? 'routerFixture.ts' : null;
    if (fixture) return context.resolveRequest(context, path.join(__dirname, fixture), platform);
  }
  const target = moduleName.startsWith('@/') ? path.join(root, moduleName.slice(2)) : moduleName;
  return context.resolveRequest(context, target, platform);
};
module.exports = config;
