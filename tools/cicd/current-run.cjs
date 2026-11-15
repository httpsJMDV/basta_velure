const config=require('./config.cjs');
const {api}=require('./github-client.cjs');
(async()=>{
 const runs=(await api('/repos/httpsJMDV/basta_velure/actions/runs?per_page=5')).workflow_runs;
 const r=runs.find(r=>r.name==='Loved-IT CI-CD Pipeline');if(!r)return;
 const jobs=(await api('/repos/httpsJMDV/basta_velure/actions/runs/'+r.id+'/jobs')).jobs;
 console.log(JSON.stringify({run:r.id,started:r.run_started_at,updated:r.updated_at,status:r.status,conclusion:r.conclusion,jobs:jobs.map(j=>({name:j.name,conclusion:j.conclusion,active:j.steps.filter(s=>s.status==='in_progress').map(s=>({name:s.name,started:s.started_at}))}))}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
