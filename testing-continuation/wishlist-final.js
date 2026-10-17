const {api,put,m,b,evidence,save}=require('./audit-lib');
(async()=>{
 let rows=(await api('buyer1','GET','/wishlist')).data.data;if(rows.some(x=>x.product?.id===2))await api('buyer1','POST','/wishlist/toggle',{product_id:2});
 const br=await b.launch();try{
  const p=await b.page(br);await p.evaluateOnNewDocument(t=>localStorage.setItem('token',t),await m.tok('buyer1'));await p.goto(b.WEB+'/products/2',{waitUntil:'networkidle2'});await p.waitForFunction(()=>document.body.innerText.includes('Hi, Juan Miguel'),{timeout:20000});await p.waitForSelector('button[aria-label="Add to wishlist"]');
  const addResponse=p.waitForResponse(r=>r.url().includes('/wishlist/toggle')&&r.request().method()==='POST',{timeout:20000});await p.click('button[aria-label="Add to wishlist"]');const add=await addResponse;const addBody=await add.json();await p.waitForSelector('button[aria-label="Remove from wishlist"]');
  const saved=(await api('buyer1','GET','/wishlist')).data.data;
  const delResponse=p.waitForResponse(r=>r.url().includes('/wishlist/toggle')&&r.request().method()==='POST',{timeout:20000});await p.click('button[aria-label="Remove from wishlist"]');const del=await delResponse;const delBody=await del.json();await p.waitForSelector('button[aria-label="Add to wishlist"]');const removed=(await api('buyer1','GET','/wishlist')).data.data;
  const added=saved.filter(x=>x.product?.id===2).length,gone=!removed.some(x=>x.product?.id===2);
  evidence.push({kind:'browser wishlist',addStatus:add.status(),addResponse:addBody,removeStatus:del.status(),removeResponse:delBody,savedCount:added,removed:gone});save();
  put('Buyer','BUY-WISH-001',added===1&&gone&&addBody.wishlisted&&!delBody.wishlisted?'Pass':'Fail',`P-02 heart add response ${add.status()} (${JSON.stringify(addBody)}), saved rows ${added}; remove ${del.status()} (${JSON.stringify(delBody)}), removed ${gone}. Heart labels matched both completed responses.`,'Edge clicks were awaited until their actual API responses completed, then persistence was checked independently.');
 }finally{await br.close();save();}
})().catch(console.error);
