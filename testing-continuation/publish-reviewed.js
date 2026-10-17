const fs=require('fs'),path=require('path');
const root=__dirname,src=path.join(root,'reviewed-workbooks'),target=path.resolve(root,'../docs2/answered-final/updated'),locked=[],updated=[];
for(const name of fs.readdirSync(src).filter(x=>x.endsWith('.xlsx'))){
 try{fs.copyFileSync(path.join(src,name),path.join(target,name));if(!fs.readFileSync(path.join(src,name)).equals(fs.readFileSync(path.join(target,name))))throw Error('Copied bytes differ');updated.push(name);console.log('UPDATED '+name);}
 catch(e){if(!['EBUSY','EACCES','EPERM'].includes(e.code))throw e;locked.push(name);console.log('LOCKED '+name);}
}
const review=JSON.parse(fs.readFileSync(root+'/status-review.json'));
fs.writeFileSync(root+'/delivery-status.json',JSON.stringify({target,updated,locked,counts:review.counts},null,2));
if(locked.length){
 fs.writeFileSync(target+'/PENDING_UPDATES.md','# Reviewed files ready\n\nThe following open/locked workbooks could not be replaced here:\n\n'+locked.map(x=>'- '+x).join('\n')+'\n\nTheir reviewed copies are ready in [reviewed-workbooks](../../../testing-continuation/reviewed-workbooks). Close those Excel windows before replacing them. All other workbook copies in this folder were updated.\n');
 console.log('Some targets remain locked; reviewed copies are ready at '+src);
}else{
 let report=fs.readFileSync(src+'/SYSTEM_TEST_REPORT.md','utf8');
 for(const entry of ['status-review.json','full-evidence.json','api-evidence.json','shots'])report=report.replaceAll('](../'+entry+')','](../../../testing-continuation/'+entry+')');
 fs.writeFileSync(target+'/SYSTEM_TEST_REPORT.md',report);
 fs.copyFileSync(src+'/QUICK_TEST_REPORT.md',target+'/QUICK_TEST_REPORT.md');
 fs.copyFileSync(src+'/workbook-verification.txt',target+'/workbook-verification.txt');
 console.log('All 8 target workbooks match the reviewed verified copies.');
}
