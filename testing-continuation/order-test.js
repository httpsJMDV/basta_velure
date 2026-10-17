const fs=require('fs');
const OLD='C:/Users/JM/AppData/Local/Temp/claude/c--Projects/51cc287e-feed-4aae-86f3-7d50f44ec823/scratchpad';
const m=require(OLD+'/bb/runner/mod');
const ev=JSON.parse(fs.readFileSync(__dirname+'/api-evidence.json'));
const all={};for(const role of ['Buyer','Seller','Logistics','Rider'])all[role]=require('./bb/results/'+role+'_Modules.json');
function put(role,id,status,actual,remarks='Expedited API test; browser controls not exercised.') {all[role][id]={status,actual,remarks};console.log(id,status);}
async function call(key,method,route,json){const r=await m.api(key,method,route,json===undefined?{}:{json});ev.push({account:key,method,route,request:json,status:r.status,response:r.data});return r;}
const ok=r=>r.status>=200&&r.status<300;
async function run(){
 const s=m.seed(), ad=s.addr1;
 const product=await call('buyer1','GET','/products/1');
 const p=product.data.data,variant=p.variants?.find(v=>Number(v.stock_quantity??v.stock)>0)||p.variants?.[0];
 if(!variant)throw Error('No stocked variant is available.');
 const payload={payment_method:'cod',shipping_name:ad.full_name,shipping_phone:ad.phone,shipping_address:ad.address,shipping_province:ad.province,shipping_city:ad.district,shipping_barangay:ad.ward,shipping_province_code:ad.province_code,shipping_city_code:ad.city_code,shipping_barangay_code:ad.barangay_code,items:[{product_id:1,variant_id:variant.id,quantity:1}]};
 const before=await m.stock('seller1','P-01');
 const r=await call('buyer1','POST','/checkout/place-order',{...payload,total:0,subtotal:0,items:[{...payload.items[0],unit_price:0,price:0}]});
 const created=m.orders(r),o=created[0];
 if(!ok(r)||!o?.id)throw Error('Order setup failed: '+JSON.stringify(r.data).slice(0,250));
 const detail=await call('buyer1','GET','/buyer/orders/'+o.id),d=detail.data.data;
 const after=await m.stock('seller1','P-01');
 const stockChanges=Object.keys(before).filter(k=>Number(before[k])-Number(after[k])===1);
 put('Seller','SEL-INV-001',stockChanges.length===1?'Pass':'Fail',`COD order ${o.id} placed. Stock before: ${JSON.stringify(before)}; after: ${JSON.stringify(after)}.`);
 put('Buyer','BUY-CHK-011',Number(d.total)>0?'Pass':'Fail',`Client sent total=0 and item price=0; server saved total=${d.total}, subtotal=${d.subtotal}.`);
 put('Buyer','BUY-PAY-001','Not Run',`COD order ${o.id} accepted; HTTP ${r.status}, saved state ${d.status}, payment ${d.payment_status}.`,'Partial COD placement check; full workbook totals, notifications and fulfillment unverified.');
 let x=await call('buyer2','GET','/buyer/orders/'+o.id);
 put('Buyer','BUY-TRK-006',[403,404].includes(x.status)?'Pass':'Fail',`Buyer 2 opening Buyer 1 order ${o.id}: HTTP ${x.status}.`);
 x=await call('seller2','GET','/seller/orders/'+o.id);
 put('Seller','SEL-ORD-008',[403,404].includes(x.status)?'Pass':'Fail',`Seller 2 opening Seller 1 order ${o.id}: HTTP ${x.status}.`);
 x=await call('buyer1','POST',`/buyer/orders/${o.id}/confirm-receipt`,{});
 put('Buyer','BUY-TRK-004',x.status===422?'Pass':'Fail',`Confirm receipt while ${d.status}: HTTP ${x.status}, ${x.data.message}.`);
 x=await call('buyer1','POST',`/buyer/orders/${o.id}/request-return`,{reason:'Quick test before delivery',description:'Item has not arrived'});
 put('Buyer','BUY-RET-002',x.status===422?'Pass':'Fail',`Return request before delivery: HTTP ${x.status}, ${x.data.message}.`);
 x=await call('seller1','PATCH',`/seller/orders/${o.id}/status`,{status:'ready_for_pickup'});
 put('Seller','SEL-ORD-003',x.status===422?'Pass':'Fail',`Skip from PLACED directly to READY_FOR_PICKUP: HTTP ${x.status}, ${x.data.message}.`);
 const transitions=[];
 for(const status of ['confirmed','preparing','ready_for_pickup']){x=await call('seller1','PATCH',`/seller/orders/${o.id}/status`,{status});transitions.push(status+':'+x.status);if(!ok(x))break;}
 const waybill=await call('seller1','GET',`/seller/orders/${o.id}/waybill`);
 put('Seller','SEL-ORD-002','Not Run',`Order ${o.id}: ${transitions.join(', ')}; waybill HTTP ${waybill.status}.`,'Partial API workflow only; printing, browser and all expected fields not verified.');
 for(const [id,patch] of [['BUY-CHK-005',{notes:'x'.repeat(501)}],['BUY-CHK-006',{payment_method:''}],['BUY-CHK-009',{items:[{...payload.items[0],quantity:999999}]}]]){
   x=await call('buyer1','POST','/checkout/place-order',{...payload,...patch});
   put('Buyer',id,x.status===422?'Not Run':'Fail',`Checkout invalid input returned HTTP ${x.status}: ${JSON.stringify(x.data).slice(0,250)}`,'One API boundary/sample checked; full workbook scenario remains unverified.');
 }
 // Unsupported workflows: source review evidence, explicitly separate from executed tests.
 const routes=fs.readFileSync(__dirname+'/../backend/routes/api.php','utf8');
 const missing=[
 ['Buyer',/^BUY-CAN-/,'Buyer order cancellation','buyer/orders/{order}/cancel'],
 ['Buyer',/^BUY-ACCT-00[3-8]$/,'Signed-in password change or email OTP update','auth/change-password'],
 ['Rider',/^RID-AVAIL-/,'Explicit rider Online/Offline status','rider/availability'],
 ['Logistics',/^LOG-RATE-/,'Logistics zone and shipping-rate editor','logistics/rates']
 ];
 for(const [role,re,feature,route]of missing)if(!routes.includes(route))for(const id of Object.keys(all[role]).filter(id=>re.test(id)))put(role,id,'Blocked',feature+' has no registered route in backend/routes/api.php.','Source review only; requested workflow not executed.');
}
run().catch(e=>console.error(e.message)).finally(()=>{for(const[role,data]of Object.entries(all))fs.writeFileSync(__dirname+'/bb/results/'+role+'_Modules.json',JSON.stringify(data,null,2));fs.writeFileSync(__dirname+'/api-evidence.json',JSON.stringify(ev,null,2));});
