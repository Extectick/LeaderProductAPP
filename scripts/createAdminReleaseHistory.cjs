/** Read-only Git/build snapshot for the isolated design preview; never publishes a release. */
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function git(...args){return execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();}
function exists(ref){try{git('cat-file','-e',`${ref}^{commit}`);return true;}catch{return false;}}
function ancestor(from,to){try{git('merge-base','--is-ancestor',from,to);return true;}catch{return false;}}
function commits(from,to){
  if(!from||!exists(from)||!exists(to)||!ancestor(from,to))return [];
  return git('log','--no-merges','--topo-order','--format=%H%x1f%aI%x1f%s%x1e',`${from}..${to}`).split('\x1e').map(record=>record.trim()).filter(Boolean).map(record=>{
    const [sha,date,subject]=record.split('\x1f');return {sha,date,subject};
  });
}
function generateHistory(){
  const base=path.join(root,'dev-builds/releases');
  const metadata=fs.existsSync(base)?fs.readdirSync(base).map(name=>path.join(base,name,'release-metadata.json')).filter(file=>fs.existsSync(file)).map(file=>JSON.parse(fs.readFileSync(file,'utf8'))).filter(item=>item.commitSha&&exists(item.commitSha)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)):[];
  const output=path.join(root,'qa/admin-preview/releaseHistory.generated.json');
  if(!metadata.length&&fs.existsSync(output)){console.log('Admin history: keeping the saved snapshot; no local build metadata found');return;}
  const releases=metadata.map((item,index)=>({
    id:`${item.platform}:${item.channel}:${item.versionCode}`,version:item.versionName,build:item.versionCode,platform:item.platform,channel:item.channel,
    builtAt:item.createdAt,publishedAt:null,commitSha:item.commitSha,
    commits:commits(metadata[index-1]?.commitSha??'f809763',item.commitSha),otaUpdates:[],
  }));
  const latest=releases.at(-1),pivot='6e7b4b1';
  // The local checkout has APK metadata, but no verified OTA publication ledger.
  // Examples demonstrate grouping while retaining real, bounded Git comments.
  if(latest&&exists(pivot)&&ancestor(latest.commitSha,pivot)&&ancestor(pivot,'HEAD')){
    const ends=[pivot,git('rev-parse','HEAD')];let previous=latest.commitSha;
    latest.otaUpdates=ends.map((end,index)=>{
      const changes=commits(previous,end);previous=end;
      return {id:`preview-ota-${index+1}`,version:`${latest.version}.${index+1}`,publishedAt:null,changesAt:git('show','-s','--format=%aI',end),previewOnly:true,commits:changes};
    }).filter(item=>item.commits.length).reverse();
  }
  fs.writeFileSync(output,JSON.stringify({generatedAt:new Date().toISOString(),source:'local-git-and-build-metadata',releases:releases.reverse()},null,2)+'\n');
  console.log(`Admin history: ${releases.length} APK versions, ${releases.reduce((sum,item)=>sum+item.commits.length+item.otaUpdates.reduce((count,ota)=>count+ota.commits.length,0),0)} Git comments`);
}
module.exports={generateHistory};
if(require.main===module)generateHistory();
