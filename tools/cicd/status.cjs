const config=require('./config.cjs');
const fs=require('node:fs');const {api}=require('./github-client.cjs');
(async()=>{
 const root='/repos/httpsJMDV/basta_velure';
 const runs=(await api(root+'/actions/runs?per_page=12')).workflow_runs;
 for(const run of runs.filter(r=>r.name==='Loved-IT CI-CD Pipeline'&&r.id>=Number(process.argv[2]??0))){
  const jobs=(await api(root+'/actions/runs/'+run.id+'/jobs')).jobs;
  console.log(JSON.stringify({id:run.id,event:run.event,sha:run.head_sha,status:run.status,conclusion:run.conclusion,url:run.html_url,jobs:jobs.map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion,current_or_failed_steps:j.steps.filter(s=>s.status==='in_progress'||s.conclusion==='failure').map(s=>s.name)}))}));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
