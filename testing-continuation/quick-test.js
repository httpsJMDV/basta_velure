const fs = require('fs');
const path = require('path');
const OLD = 'C:/Users/JM/AppData/Local/Temp/claude/c--Projects/51cc287e-feed-4aae-86f3-7d50f44ec823/scratchpad';
const m = require(OLD + '/bb/runner/mod');
const b = require(OLD + '/bb/runner/bb');
const root = __dirname;
const results = {}, evidence = [];
for (const role of ['Buyer','Seller','Logistics','Rider']) {
  results[role] = {};
  for (const c of require(`./cases/Blackbox_Test_Cases_${role}_Modules-1.json`))
    results[role][c.id] = {actual:'Not executed in the expedited API smoke test.',status:'Not Run',remarks:'Full scenario remains unverified. See QUICK_TEST_REPORT.md for scope.'};
}
const put = (role,id,status,actual,remarks='API test on isolated velure_blackbox database. UI steps not executed.') => {
  results[role][id] = {status,actual,remarks}; console.log(id,status);
};
async function call(key,method,route,json) {
  const r = key ? await m.api(key,method,route,json===undefined?{}:{json}) : await b.api(method,route,json===undefined?{}:{json});
  evidence.push({account:key||'anonymous',method,route,request:json,status:r.status,response:r.data});
  return r;
}
const summary = r => `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0,450)}`;
async function test(role,id,fn) {
  try {await fn();} catch(e) {put(role,id,'Blocked','Test could not finish: '+e.message.slice(0,200),'Environment or test prerequisite failure; no application verdict.');}
}
async function run() {
  // Missing feature findings are source review only, never claimed as executed black-box cases.
  const routes = fs.readFileSync(path.join(root,'../backend/routes/api.php'),'utf8');
  const missing = [
    ['Seller',/^SEL-(SCAT|DISC|VOU|FLASH)-/,'Store categories, scheduled discounts, vouchers and flash-sale management','store-categories|flash-sales|vouchers|discounts'],
    ['Buyer',/^BUY-VOU-/,'Voucher wallet and voucher application','vouchers'],
  ];
  for (const [role,re,feature,routePattern] of missing) if(!new RegExp(routePattern,'i').test(routes)) {
    for(const id of Object.keys(results[role]).filter(id=>re.test(id)))
      put(role,id,'Blocked',feature+' has no registered API route in the current routes/api.php.','Source review only; black-box scenario not executed. Confirm implementation before rerunning.');
  }
  await test('Buyer','BUY-WISH-005',async()=>{
    const a=await call(null,'GET','/wishlist'), c=await call(null,'POST','/store-follows/toggle',{seller_id:23});
    put('Buyer','BUY-WISH-005',a.status===401&&c.status===401?'Pass':'Fail',`Anonymous wishlist read: ${a.status}; anonymous follow: ${c.status}. Both must require login.`);
  });
  await test('Buyer','BUY-WISH-001',async()=>{
    const a=await call('buyer1','POST','/wishlist/toggle',{product_id:1});
    const z=await call('buyer1','POST','/wishlist/toggle',{product_id:1});
    put('Buyer','BUY-WISH-001',a.status===200&&z.status===200&&a.data.wishlisted!==z.data.wishlisted?'Pass':'Fail',`Toggled product 1 twice; saved state changed from ${a.data.wishlisted} to ${z.data.wishlisted}.`);
  });
  await test('Buyer','BUY-WISH-004',async()=>{
    const a=await call('buyer1','POST','/store-follows/toggle',{seller_id:23});
    const z=await call('buyer1','POST','/store-follows/toggle',{seller_id:23});
    put('Buyer','BUY-WISH-004',a.status===200&&z.status===200?'Not Run':'Fail',`Follow toggle requests returned ${a.status} and ${z.status}.`,'Partial check: API responded; follower counts and complete scenario not verified.');
  });
  await test('Buyer','BUY-SRCH-005',async()=>{
    const r=await call(null,'GET','/products?search='+encodeURIComponent("' OR 1=1; <script>alert(1)</script>"));
    put('Buyer','BUY-SRCH-005',r.status>=500?'Fail':'Not Run',summary(r),'Partial API check: no browser rendering or full injection assertions performed.');
  });
  await test('Buyer','BUY-ADDR-003',async()=>{
    const ad={full_name:'Quick Test',phone:'09171234567',address:'12 Test St',province:'Bulacan',district:'Malolos',ward:'Atlag',province_code:'0301400000',city_code:'0301410000',barangay_code:'0301410001',label:'home'};
    const failures=[];
    for(const field of ['full_name','phone','address','province','district','ward']) {
      const r=await call('buyer1','POST','/addresses',{...ad,[field]:''});
      if(r.status!==422||!r.data.errors?.[field])failures.push(field+': '+r.status);
      if(r.status===201)await call('buyer1','DELETE','/addresses/'+r.data.data.id);
    }
    put('Buyer','BUY-ADDR-003',failures.length?'Fail':'Not Run',failures.length?'Blank fields accepted or missing validation: '+failures.join(', '):'Six blank required text fields each returned HTTP 422 with a field error.','API subset only; UI messages and all region selectors not tested.');
    const r=await call('buyer1','POST','/addresses',{...ad,phone:'abc'});
    if(r.status===201){put('Buyer','BUY-ADDR-004','Fail','Address accepted phone "abc" (HTTP 201). Invalid phone should be rejected.');await call('buyer1','DELETE','/addresses/'+r.data.data.id);}
    else put('Buyer','BUY-ADDR-004','Not Run',summary(r),'Only one invalid phone sample tested; full boundaries unverified.');
    const other=await call('buyer2','GET','/addresses');
    const id=other.data.data?.[0]?.id;
    if(id){
      const edit=await call('buyer1','PATCH','/addresses/'+id,{full_name:'Unauthorized test'});
      const del=await call('buyer1','DELETE','/addresses/'+id);
      put('Buyer','BUY-ADDR-009',edit.status===403&&del.status===403?'Pass':'Fail',`Buyer 1 editing Buyer 2 address: HTTP ${edit.status}; deleting: HTTP ${del.status}.`);
    }
  });
  await test('Seller','SEL-PROF-003',async()=>{
    const before=await call('seller1','GET','/seller/shop-profile');
    const r=await call('seller1','POST','/seller/shop-profile',{shop_name:'     '});
    const after=await call('seller1','GET','/seller/shop-profile');
    put('Seller','SEL-PROF-003',r.status===422&&after.data.data?.shop_name===before.data.data?.shop_name?'Pass':'Fail',`Spaces-only store name returned ${r.status}; saved name: ${JSON.stringify(after.data.data?.shop_name)}.`);
    if(r.status===200)await call('seller1','POST','/seller/shop-profile',{shop_name:before.data.data.shop_name});
  });
  await test('Seller','SEL-PROF-004',async()=>{
    const before=await call('seller1','GET','/seller/shop-profile');
    const other=await call('seller2','GET','/seller/shop-profile');
    const name=other.data.data.shop_name, codes=[];
    for(const value of [name,name.toLowerCase(),'  '+name+'  '])codes.push((await call('seller1','POST','/seller/shop-profile',{shop_name:value})).status);
    const after=await call('seller1','GET','/seller/shop-profile');
    put('Seller','SEL-PROF-004',codes.every(s=>s===422)&&after.data.data.shop_name===before.data.data.shop_name?'Pass':'Fail',`Duplicate store name, lowercase, padded: HTTP ${codes.join(', ')}; name unchanged: ${after.data.data.shop_name===before.data.data.shop_name}.`);
    if(after.data.data.shop_name!==before.data.data.shop_name)await call('seller1','POST','/seller/shop-profile',{shop_name:before.data.data.shop_name});
  });
  await test('Seller','SEL-PROD-018',async()=>{
    const r=await call('seller2','POST','/seller/products/1',{name:'Unauthorized test'});
    put('Seller','SEL-PROD-018',[403,404].includes(r.status)?'Pass':r.status===200?'Fail':'Not Run',summary(r),'API ownership check only. HTTP 422 alone does not prove authorization.');
  });
  for(const [role,id,key,route] of [
    ['Seller','SEL-ORD-001','seller1','/seller/orders'],['Seller','SEL-EARN-004','seller1','/seller/reports/summary?from=2026-10-01&to=2026-10-18'],
    ['Logistics','LOG-DASH-001','logistics1','/logistics/dashboard'],['Logistics','LOG-RIDER-006','logistics1','/logistics/riders'],
    ['Rider','RID-PROF-001','rider1','/rider/me'],['Rider','RID-EARN-001','rider1','/rider/history'],
    ['Rider','RID-EARN-002','rider1','/rider/earnings/summary'],['Buyer','BUY-TRK-001','buyer1','/buyer/orders']])
    await test(role,id,async()=>{const r=await call(key,'GET',route);put(role,id,r.status>=500?'Fail':'Not Run',summary(r),'Partial smoke check only: endpoint response recorded; scenario totals, UI, filters and cross-record accuracy unverified.');});
  await test('Rider','RID-PROF-003',async()=>{
    const first=await call('rider1','GET','/rider/me'), second=await call('rider2','GET','/rider/me');
    const a=first.data.data,z=second.data.data;
    if(!a?.plate_number||!z?.plate_number)throw Error('Two approved riders with plates are required.');
    const r=await call('rider1','PUT','/rider/vehicle',{vehicle_type:a.vehicle_type,plate_number:z.plate_number});
    put('Rider','RID-PROF-003',r.status===200?'Fail':'Not Run',summary(r),r.status===200?'Another rider plate was accepted; expected duplicate rejection.':'Duplicate sample only; case and whitespace boundaries not verified.');
    if(r.status===200)await call('rider1','PUT','/rider/vehicle',{vehicle_type:a.vehicle_type,plate_number:a.plate_number});
  });
}
run().catch(e=>console.error(e)).finally(()=>{
  for(const [role,data] of Object.entries(results))fs.writeFileSync(path.join(root,'bb/results',role+'_Modules.json'),JSON.stringify(data,null,2));
  fs.writeFileSync(path.join(root,'api-evidence.json'),JSON.stringify(evidence,null,2));
  console.log('Saved quick-run results and API evidence.');
});
