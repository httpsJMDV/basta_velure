const config=require('./config.cjs');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=config.resolveRepo(".local/artifacts/cicd"),evidence=root+'/evidence';
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(path.join(dir,f.name)):[path.join(dir,f.name)]);}
const packageFiles=files(evidence).filter(f=>path.basename(f)==='loved-it-package.json').sort();
const versionFiles=files(evidence).filter(f=>path.basename(f)==='loved-it-package-versions.json').sort();
const runs=fs.readdirSync(evidence).filter(f=>/^run-\d+\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(path.join(evidence,f),'utf8'))).sort((a,b)=>a.id-b.id);
const pkg=packageFiles.length?JSON.parse(fs.readFileSync(packageFiles.at(-1),'utf8')):null;
const versions=versionFiles.length?JSON.parse(fs.readFileSync(versionFiles.at(-1),'utf8')):[];
const main=versions.find(v=>v.metadata?.container?.tags?.includes('main'));
const tagged=versions.find(v=>v.metadata?.container?.tags?.includes('1.0.0-cicd-lab.1'));
const source=spawnSync('git',['rev-parse','HEAD'],{cwd:config.resolveRepo(""),encoding:'utf8',windowsHide:true}).stdout.trim();
const image={name:'ghcr.io/httpsjmdv/basta_velure',visibility:pkg?.visibility??'Not yet recorded',package_url:pkg?.html_url??'https://github.com/users/httpsJMDV/packages/container/package/basta_velure',main_digest:main?.name??'Not yet recorded',version_tag:'1.0.0-cicd-lab.1',version_digest:tagged?.name??'Not yet recorded'};
const manifest={project:'Loved-IT',section:'BSIT 3C',subject:'ITEL 304',instructor:'Jeremy Reyes',submission_date:'2026-11-16',source_commit:source,generated_at:new Date().toISOString(),image,runs:runs.map(r=>({id:r.id,sha:r.head_sha,event:r.event,result:r.conclusion,url:r.html_url})),limitations:['Docker execution was verified on GitHub-hosted Ubuntu, not on the development PC.','Individual reflection drafts and actual contributions must be reviewed by their members.','Registry delivery does not deploy the container to the live marketplace.']};
fs.writeFileSync(evidence+'/evidence-manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({source,runs:runs.length,image}));
