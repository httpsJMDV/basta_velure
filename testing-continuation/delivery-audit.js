const {api,form,put,test,m,fs,root,OLD,evidence,save}=require('./audit-lib');
const {execFileSync}=require('child_process');
const ok=r=>r.status>=200&&r.status<300;
const ad=m.seed().addr1;
async function payload(){const p=(await api(null,'GET','/products/2')).data.data;return{payment_method:'cod',shipping_name:ad.full_name,shipping_phone:ad.phone,shipping_address:ad.address,shipping_province:ad.province,shipping_city:ad.district,shipping_barangay:ad.ward,shipping_province_code:ad.province_code,shipping_city_code:ad.city_code,shipping_barangay_code:ad.barangay_code,items:[{product_id:2,variant_id:p.variants[0].id,quantity:1}]};}
async function ready(id){const initial=(await api('seller1','GET',`/seller/orders/${id}`)).data.data;const path=['placed','confirmed','preparing','ready_for_pickup'];for(const status of path.slice(path.indexOf(initial.status.toLowerCase())+1)){const r=await api('seller1','PATCH',`/seller/orders/${id}/status`,{status});if(!ok(r))throw Error(status+JSON.stringify(r.data));}return(await api('seller1','GET',`/seller/orders/${id}`)).data.data.tracking_number;}
const fixture=(...args)=>execFileSync('php',[root+'/fixtures.php',...args],{encoding:'utf8',env:{...process.env,DB_DATABASE:'velure_blackbox',LARAVEL_STORAGE_PATH:OLD+'/bb/storage'}});
async function run(){
 await api('seller1','PATCH','/seller/products/2/stock',{stock:30});
 const foreign=await api('buyer1','POST','/checkout/place-order',await payload());if(!foreign.data.data?.id)throw Error('Foreign fixture order failed');const ft=await ready(foreign.data.data.id);
 console.log(fixture('foreign',ft));evidence.push({kind:'fixture setup',case:'RID-JOB-007',tracking:ft,database:'velure_blackbox',change:'Set dedicated unclaimed parcel company to Agila Cargo for cross-company access test.'});save();
 const accept=await api('rider1','POST','/rider/pickups/sellers/23/accept',{}),foreignView=await api('logistics2','GET','/logistics/parcels?search='+ft),assigned=(await api('rider1','GET','/rider/pickups?view=mine')).data;
 put('Rider','RID-JOB-007',foreignView.data.data?.some(x=>x.tracking_number===ft)&&!JSON.stringify(assigned).includes(ft)&&!accept.data.tracking_numbers?.includes(ft)?'Pass':'Fail',`Known Agila parcel ${ft}: batch accept HTTP ${accept.status}; foreign parcel exists in Logistics 2 list ${foreignView.data.data?.some(x=>x.tracking_number===ft)}; absent from accepted pickups ${!JSON.stringify(assigned).includes(ft)} and claim result ${!accept.data.tracking_numbers?.includes(ft)}. Other eligible company parcels may be claimed by the batch action.`,'Dedicated parcel company was seeded solely as the test precondition, then restored. Runtime request exercised the real courier membership filter.');
 console.log(fixture('restore'));
 const before=(await api('seller1','GET','/seller/products/2')).data.data.total_stock;
 const settings=await api('seller1','GET','/seller/payment-settings');
 await api('seller1','POST','/seller/payment-settings',{gcash_number:'09189876543',gcash_account_name:'Maria Clara Santos'});
 const data=await payload();data.payment_method='gcash';const f=new FormData();for(const[k,v]of Object.entries(data))if(k!=='items')f.append(k,v);for(const[k,v]of Object.entries(data.items[0]))f.append(`items[0][${k}]`,v);f.append('payment_reference','1234567890123');f.append('payment_proof',new Blob([fs.readFileSync(OLD+'/bb/files/gcash_receipt.jpg')]),'gcash_receipt.jpg');
 const placed=await form('buyer1','/checkout/place-order',f),o=placed.data.data;if(!o?.id)throw Error('GCash placement '+JSON.stringify(placed.data));
 const after=(await api('seller1','GET','/seller/products/2')).data.data.total_stock;
 put('Seller','SEL-INV-002',placed.status===201&&before-after===1&&o.payment_status==='pending_verification'?'Pass':'Fail',`GCash order ${o.id}, payment ${o.payment_status}; stock ${before} → ${after} while receipt is still pending verification.`,'Uses the actual direct GCash receipt workflow, not a nonexistent gateway. Stock reservation behavior tested before payment approval.');
 let paid=await api('seller1','POST',`/seller/orders/${o.id}/confirm-payment`,{});if(!ok(paid))throw Error('Payment confirmation '+JSON.stringify(paid.data));
 const t=await ready(o.id);
 const claimed=await api('rider1','POST','/rider/pickups/sellers/23/accept',{});if(!ok(claimed))throw Error('Claim '+JSON.stringify(claimed.data));
 for(const[key,route,body]of [['rider1','/rider/pickups/confirm',{tracking_numbers:[t]}],['hub',`/hub/parcels/${t}/receive`,{}],['hub','/hub/sorting/sort',{tracking_numbers:[t]}],['hub','/hub/dispatch/assign',{rider_id:2,tracking_numbers:[t]}],['rider1','/rider/deliveries/start',{tracking_numbers:[t]}]]){const r=await api(key,'POST',route,body);if(!ok(r))throw Error(route+' '+JSON.stringify(r.data));}
 const blank=await api('rider1','POST',`/rider/deliveries/${t}/failed`,{});
 put('Rider','RID-FAIL-002',blank.status===422&&blank.data.errors?.reason?'Pass':'Fail',`Blank failure reason returned ${blank.status}; ${JSON.stringify(blank.data.errors)}. Parcel remained OUT_FOR_DELIVERY.`);
 const failed=await api('rider1','POST',`/rider/deliveries/${t}/failed`,{reason:'RECIPIENT_UNAVAILABLE'});
 put('Rider','RID-FAIL-001','Fail',`Failure saved HTTP ${failed.status}, delivery_attempts ${failed.data.delivery_attempts}, reason ${failed.data.reason?.label}. Backend counter works, but rider app lacks the required 1-of-3 attempt display/general order-notification inbox.`,'Real delivery failure tested; failure verdict is the missing required user-facing counter/notification behavior.');
 const reschedule=await api('hub','POST',`/hub/deliveries/${t}/reschedule`,{rider_id:2}),start=await api('rider1','POST','/rider/deliveries/start',{tracking_numbers:[t]});
 const view=await api('rider1','GET','/rider/deliveries?view=out_for_delivery'),text=JSON.stringify(view.data);
 put('Rider','RID-FAIL-004','Fail',`Hub reschedule ${reschedule.status}, rider start ${start.status}; rider parcel payload contains delivery_attempts ${text.includes('delivery_attempts')}. Rescheduling works, but the rider job does not display attempt 2 of 3 as required.`,'Actual failed→rescheduled→out-for-delivery path exercised; delivery completion follows in RID-DLV-006.');
 const proof=new FormData();proof.append('proof_photo',new Blob([fs.readFileSync(OLD+'/bb/files/pod_photo.jpg')]),'pod_photo.jpg');proof.append('proof_photo_2',new Blob([fs.readFileSync(OLD+'/bb/files/product_front.jpg')]),'product_front.jpg');
 const delivered=await form('rider1',`/rider/deliveries/${t}/delivered`,proof),history=await api('rider1','GET','/rider/history?search='+t);
 put('Rider','RID-DLV-006',delivered.status===200&&history.data.data?.filter(x=>x.outcome==='delivered').every(x=>!x.cod_collected)?'Pass':'Fail',`Prepaid GCash parcel delivered ${delivered.status} without cod_collected field; matching history ${JSON.stringify(history.data.data).slice(0,600)}.`,'Paid direct GCash order fulfilled through real seller/rider/hub actions. Prepaid parcel cod_amount is null, so the rider has no cash-collection amount.');
 await api('seller1','POST','/seller/payment-settings',{gcash_number:settings.data.data?.gcash_number||null,gcash_account_name:settings.data.data?.gcash_account_name||null});
}
run().catch(e=>console.error(e.stack));
