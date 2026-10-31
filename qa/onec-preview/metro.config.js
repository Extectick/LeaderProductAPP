const {getDefaultConfig}=require('expo/metro-config');
const path=require('node:path');
const root=path.resolve(__dirname,'../..'), config=getDefaultConfig(__dirname);
config.maxWorkers=2;config.watchFolders=[root];config.resolver.nodeModulesPaths=[path.join(root,'node_modules')];
config.resolver.blockList=[/[/\\](?:\.cxx|\.gradle|tmp|dev-builds|dist-help-android|dist-help-web|output)[/\\]/,/[/\\]android[/\\](?:app[/\\])?build[/\\]/];
config.resolver.resolveRequest=(context,name,platform)=>context.resolveRequest(context,name.startsWith('@/')?path.join(root,name.slice(2)):name,platform);
module.exports=config;
