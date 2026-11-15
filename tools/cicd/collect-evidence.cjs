const config=require('./config.cjs');
const fs=require('node:fs');const {api,token}=require('./github-client.cjs');
const output=config.resolveRepo(".local/artifacts/cicd");fs.mkdirSync(output+'/evidence',{recursive:true});
(async()=>{
 const root='/repos/httpsJMDV/basta_velure',runs=(await api(root+'/actions/runs?per_page=25')).workflow_runs.filter(r=>r.name==='Loved-IT CI-CD Pipeline');
 for(const run of runs){
  const jobs=(await api(root+'/actions/runs/'+run.id+'/jobs')).jobs;
  fs.writeFileSync(output+'/evidence/run-'+run.id+'.json',JSON.stringify({id:run.id,event:run.event,head_branch:run.head_branch,display_title:run.display_title,head_sha:run.head_sha,status:run.status,conclusion:run.conclusion,html_url:run.html_url,created_at:run.created_at,jobs:jobs.map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,html_url:j.html_url,steps:j.steps}))},null,2));
  for(const job of jobs.filter(j=>j.status==='completed'&&j.conclusion!=='skipped')){
   const path=output+'/evidence/job-'+job.id+'.log';if(fs.existsSync(path))continue;
   const r=await fetch('https://api.github.com'+root+'/actions/jobs/'+job.id+'/logs',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
   if(r.ok)fs.writeFileSync(path,await r.text());
  }
 }
 console.log(JSON.stringify({runs_saved:runs.length,path:output+'/evidence'}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
