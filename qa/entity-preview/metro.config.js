const {getDefaultConfig}=require('expo/metro-config');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const config=getDefaultConfig(__dirname);
config.maxWorkers=2;
config.watchFolders=[root];
config.resolver.nodeModulesPaths=[path.join(root,'node_modules')];
const previous=config.resolver.blockList||[];
config.resolver.blockList=[...(Array.isArray(previous)?previous:[previous]),/[/\\](?:\.cxx|\.gradle)[/\\]/,/[/\\]android[/\\](?:app[/\\])?build[/\\]/,/[/\\](?:tmp|dev-builds|dist-help-android|dist-help-web)[/\\]/];
// Every alias is local to this fixture graph; ordinary APP/OTA Metro config is unchanged.
config.resolver.resolveRequest=(context,moduleName,platform)=>{
 const origin=context.originModulePath.replace(/\\/g,'/');
 let fixture;
 if(moduleName==='@/context/AuthContext')fixture='fixtureAuth.tsx';
 else if(moduleName==='@/context/ThemeContext')fixture='fixtureTheme.tsx';
 else if(moduleName==='@/hooks/usePresence')fixture='fixturePresence.ts';
 else if(moduleName==='@/utils/config')fixture='fixtureConfig.ts';
 else if(moduleName==='@/src/shared/api/httpClient')fixture='fixtureHttp.ts';
 else if(origin.endsWith('/src/features/entityCards/entityRegistry.tsx')&&moduleName==='./entityApi')fixture='fixtureApi.ts';
 if(fixture)return context.resolveRequest(context,path.join(__dirname,fixture),platform);
 const target=moduleName.startsWith('@/')?path.join(root,moduleName.slice(2)):moduleName;
 return context.resolveRequest(context,target,platform);
};
module.exports=config;
