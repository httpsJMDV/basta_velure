const config=require('./config.cjs');
const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const cwd=config.resolveRepo("");
const suppliedToken=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
const c=suppliedToken?null:spawnSync('git',['credential','fill'],{cwd,input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},windowsHide:true});
const token=suppliedToken||c?.stdout?.split('\n').find(l=>l.startsWith('password='))?.slice(9).trim();
if(!token)throw Error('GitHub authentication unavailable');
async function api(path,method='GET',body){const r=await fetch('https://api.github.com'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();let j;try{j=JSON.parse(t);}catch{j=t;}if(!r.ok)throw Error('GitHub '+r.status+': '+(j.message??'Request failed'));return j;}
module.exports={api,token};
if(require.main===module)(async()=>{
 const repo='/repos/httpsJMDV/basta_velure',info=await api(repo);
 console.log(JSON.stringify({repository:info.full_name,private:info.private,permissions:info.permissions,default_branch:info.default_branch}));
 console.log(JSON.stringify({actions:await api(repo+'/actions/permissions')}));
 for(const [owner,name,tag]of [['actions','checkout','v6'],['actions','setup-node','v6'],['actions','upload-artifact','v4'],['docker','login-action','v3'],['docker','metadata-action','v6'],['docker','setup-buildx-action','v3'],['docker','build-push-action','v6'],['shivammathur','setup-php','v2']]){
  let ref=(await api('/repos/'+owner+'/'+name+'/git/ref/tags/'+tag)).object;while(ref.type==='tag')ref=(await api('/repos/'+owner+'/'+name+'/git/tags/'+ref.sha)).object;
  console.log(JSON.stringify({action:owner+'/'+name,tag,sha:ref.sha}));
 }
 console.log(JSON.stringify({tags:(await api(repo+'/tags?per_page=10')).map(x=>x.name)}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
