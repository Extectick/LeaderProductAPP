const {getDefaultConfig}=require('expo/metro-config');
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'../..'), config=getDefaultConfig(__dirname);
config.maxWorkers=2;config.watchFolders=[root];config.resolver.nodeModulesPaths=[path.join(root,'node_modules')];
config.resolver.blockList=[/[/\\](?:\.cxx|\.gradle)[/\\]/,/[/\\]android[/\\](?:app[/\\])?build[/\\]/,/[/\\](?:tmp|dev-builds|dist-help-android|dist-help-web)[/\\]/];
const aliases=['@/context/AuthContext','@/context/ThemeContext','@/utils/config','@/utils/tokenService','@/components/AppHeader'];
config.resolver.resolveRequest=(context,name,platform)=>context.resolveRequest(context,aliases.includes(name)?path.join(__dirname,'fixture.tsx'):name.startsWith('@/')?path.join(root,name.slice(2)):name,platform);
const stats={requests:0,downloads:0,unauthorized:0,missing:0,offline:0,versions:{}};let offline=false;let delay=0;
const original=config.server.enhanceMiddleware;
config.server.enhanceMiddleware=(middleware,server)=>{
 const next=original?original(middleware,server):middleware;
 return(req,res,done)=>{
  const url=new URL(req.url,'http://fixture');
  if(!url.pathname.startsWith('/avatar-fixture/'))return next(req,res,done);
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/avatar-fixture/stats'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...stats,offlineEnabled:offline,delayMs:delay}));}
  if(url.pathname==='/avatar-fixture/control'&&req.method==='POST'){offline=url.searchParams.get('offline')==='1';delay=Number(url.searchParams.get('delay')||0);return res.end('ok');}
  const m=url.pathname.match(/^\/avatar-fixture\/users\/(\d+)\/avatars\/EMPLOYEE\/([a-f0-9]{64})$/);
  if(!m){res.statusCode=404;return res.end();}
  stats.requests++;
  if(!['Bearer eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjF9.fixture','Bearer eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjJ9.fixture'].includes(req.headers.authorization)){stats.unauthorized++;res.statusCode=401;return res.end();}
  if(offline){stats.offline++;res.statusCode=503;return res.end();}
  const version=m[2]=== 'a'.repeat(64)?'v1':m[2]==='b'.repeat(64)?'v2':m[2]==='c'.repeat(64)?'v3':null;
  if(!version){stats.missing++;res.statusCode=404;return res.end();}
  const bytes=fs.readFileSync(path.join(__dirname,'assets',version+'.png'));
  const send=()=>{stats.downloads++;stats.versions[version]=(stats.versions[version]||0)+1;res.setHeader('Content-Type','image/png');res.setHeader('Content-Length',bytes.length);res.end(bytes);};
  if(delay)setTimeout(send,delay);else send();
 };
};
module.exports=config;
