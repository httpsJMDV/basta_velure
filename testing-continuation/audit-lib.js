const fs=require('fs'),path=require('path');
const OLD='C:/Users/JM/AppData/Local/Temp/claude/c--Projects/51cc287e-feed-4aae-86f3-7d50f44ec823/scratchpad';
const m=require(OLD+'/bb/runner/mod'),b=require(OLD+'/bb/runner/bb');
const root=__dirname, results={},cases={};
for(const role of ['Buyer','Seller','Logistics','Rider']){
 cases[role]=require(`./cases/Blackbox_Test_Cases_${role}_Modules-1.json`);
 results[role]=require(`./bb/results/${role}_Modules.json`);
}
const evidence=fs.existsSync(root+'/full-evidence.json')?JSON.parse(fs.readFileSync(root+'/full-evidence.json')):[];
function save(){for(const [r,d]of Object.entries(results))fs.writeFileSync(`${root}/bb/results/${r}_Modules.json`,JSON.stringify(d,null,2));fs.writeFileSync(root+'/full-evidence.json',JSON.stringify(evidence,null,2));}
function put(role,id,status,actual,remarks){if(!results[role][id])throw Error('Unknown '+id);results[role][id]={status,actual,remarks:remarks||'Tested through the local system API on isolated velure_blackbox; judged against the workbook expected result.'};console.log(id,status);save();}
async function api(key,method,route,json){let r=key?await m.api(key,method,route,json===undefined?{}:{json}):await b.api(method,route,json===undefined?{}:{json});evidence.push({kind:'API',account:key||'anonymous',method,route,request:json,status:r.status,response:r.data});save();return r;}
async function form(key,route,data){const r=await b.api('POST',route,{token:await m.tok(key),form:data});evidence.push({kind:'multipart API',account:key,route,fields:[...data.keys()],status:r.status,response:r.data});save();return r;}
function review(role,ids,actual,file,marker){const text=fs.readFileSync(path.resolve(root,'..',file),'utf8');if(marker&&!text.includes(marker))throw Error('Source marker missing '+file+' '+marker);const line=marker?text.slice(0,text.indexOf(marker)).split('\n').length:1;evidence.push({kind:'source review',file,line,marker,finding:actual,cases:ids});for(const id of ids)put(role,id,'Fail',actual,`Implementation review: ${file}:${line}. Required behavior in this case is absent or differs. This finding is not a claimed browser execution.`);}
function ids(role,re){return cases[role].filter(c=>re.test(c.id)).map(c=>c.id);}
const brief=r=>`HTTP ${r.status}; ${JSON.stringify(r.data).slice(0,340)}`;
async function test(role,id,fn){try{await fn();}catch(e){put(role,id,'Blocked','Execution stopped: '+e.message.slice(0,220),'Test setup/runtime problem; no product verdict assigned. This case must be rerun.');}}
module.exports={fs,path,OLD,m,b,root,results,cases,evidence,save,put,api,form,review,ids,brief,test};
