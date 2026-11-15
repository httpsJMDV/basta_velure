const config=require('./config.cjs');
async function check(tag){
 const root='https://ghcr.io',name='httpsjmdv/basta_velure';
 const auth=await fetch(root+'/token?service=ghcr.io&scope='+encodeURIComponent('repository:'+name+':pull'));
 if(!auth.ok)return {anonymous_pull:false,auth_http:auth.status,tag};
 const {token}=await auth.json();
 const manifest=await fetch(root+'/v2/'+name+'/manifests/'+tag,{method:'HEAD',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json'}});
 return {anonymous_pull:manifest.ok,manifest_http:manifest.status,tag,digest:manifest.headers.get('docker-content-digest')};
}
module.exports={check};
if(require.main===module)check(process.argv[2]??'1.0.0-cicd-lab.1').then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1});
