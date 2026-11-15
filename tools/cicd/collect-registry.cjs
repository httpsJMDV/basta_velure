const config=require('./config.cjs');
const fs=require('node:fs'),{api,token}=require('./github-client.cjs');
const output=config.resolveRepo(".local/artifacts/cicd/evidence");
(async()=>{
 const root='/repos/httpsJMDV/basta_velure',runs=(await api(root+'/actions/runs?per_page=25')).workflow_runs.filter(r=>r.name==='Loved-IT CI-CD Pipeline'&&r.conclusion==='success');
 for(const run of runs){
  for(const artifact of (await api(root+'/actions/runs/'+run.id+'/artifacts')).artifacts.filter(a=>a.name.startsWith('loved-it-ghcr-evidence-'))){
   const file=output+'/registry-'+run.id+'.zip';if(fs.existsSync(file))continue;
   const r=await fetch('https://api.github.com'+root+'/actions/artifacts/'+artifact.id+'/zip',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});if(!r.ok)throw Error('Artifact download HTTP '+r.status);
   fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));console.log(JSON.stringify({run:run.id,artifact:artifact.name,file}));
  }
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
