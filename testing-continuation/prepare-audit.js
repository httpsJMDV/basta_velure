const {m,b,api,fs,root,evidence,save}=require('./audit-lib');
(async()=>{
 const hub=await api('hub','GET','/hub/riders');
 console.log('hub riders',JSON.stringify(hub.data).slice(0,1600));
 for(const key of ['rider1','rider2']){
   const user=(await api(key,'GET','/auth/me')).data.data;
   const list=hub.data.data||[];
   const r=list.find(x=>x.email===user.email||x.user?.email===user.email||x.user_id===user.id);
   if(r?.status==='PENDING')console.log('approve',key,(await api('hub','POST',`/hub/riders/${r.id}/approve`)).status);
 }
 for(const key of ['rider1','rider2'])console.log(key,JSON.stringify((await api(key,'GET','/rider/me')).data).slice(0,750));
 const br=await b.launch();
 try{
   for(const[key,route]of [['buyer1','/settings'],['seller1','/seller/products'],['logistics1','/logistics/riders'],['rider1','/rider']]){
     const p=await b.page(br);await p.evaluateOnNewDocument(t=>localStorage.setItem('token',t),await m.tok(key));
     await p.goto(b.WEB+route,{waitUntil:'domcontentloaded'});await b.sleep(1800);
     const text=await b.text(p);evidence.push({kind:'browser inspection',account:key,route,url:p.url(),text,errors:p.errors});
     console.log(route,p.url(),text.slice(0,500));await p.ctx.close();save();
   }
 }finally{await br.close();}
})().catch(console.error);
