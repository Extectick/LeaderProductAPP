/** Public Git subjects/ancestry only; no environment, files or credentials. */
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
function generate(){
  const root=path.resolve(__dirname,'..');
  const log=execFileSync('git',['log','-1200','--format=%H%x1f%P%x1f%aI%x1f%s%x1e','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true});
  const commits=Object.fromEntries(log.split('\x1e').map(line=>line.trim()).filter(Boolean).map(line=>{const [sha,parents,date,subject]=line.split('\x1f');return [sha,{parents:parents?parents.split(' '):[],date,subject}];}));
  fs.writeFileSync(path.join(root,'src/features/admin/redesign/releaseGit.generated.json'),JSON.stringify({commits})+'\n');
  console.log(`Admin release Git catalog: ${Object.keys(commits).length} commits`);
}
module.exports={generate};if(require.main===module)generate();
