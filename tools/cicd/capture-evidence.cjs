const config=require('./config.cjs');
const {chromium}=require('playwright');
const fs=require('node:fs'),{api}=require('./github-client.cjs');
const output=config.resolveRepo(".local/artifacts/cicd/evidence");fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch(config.browserOptions());
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1050},deviceScaleFactor:1});
  const runs=(await api('/repos/httpsJMDV/basta_velure/actions/runs?per_page=25')).workflow_runs.filter(r=>r.name==='Loved-IT CI-CD Pipeline'&&r.status==='completed');
  for(const run of runs){
   const path=output+'/run-'+run.id+'-summary.png';if(fs.existsSync(path))continue;
   await page.goto(run.html_url,{waitUntil:'domcontentloaded',timeout:60000});
   await page.getByRole('heading',{name:'Jobs',exact:true}).waitFor({timeout:10000}).catch(()=>{});
   const text=await page.locator('body').innerText();
   if(!text.includes('Loved-IT CI-CD Pipeline'))throw Error('GitHub run page did not load: '+run.id);
   await page.screenshot({path,clip:{x:0,y:70,width:1400,height:575}});console.log(JSON.stringify({run:run.id,screenshot:path}));
  }
  await page.goto('https://github.com/httpsJMDV/basta_velure/pull/63',{waitUntil:'domcontentloaded',timeout:60000});
  await page.screenshot({path:output+'/pull-request-63.png',fullPage:false});
  await page.goto('https://github.com/httpsJMDV/basta_velure/pull/64',{waitUntil:'domcontentloaded',timeout:60000});
  await page.screenshot({path:output+'/pull-request-64.png',fullPage:false});
  await page.goto('https://github.com/users/httpsJMDV/packages/container/package/basta_velure',{waitUntil:'domcontentloaded',timeout:60000});
  const packageText=await page.locator('body').innerText();
  if(!packageText.includes('docker pull'))throw Error('Public GHCR package page did not load');
  await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{});
  await page.screenshot({path:output+'/ghcr-package.png',fullPage:false});
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
