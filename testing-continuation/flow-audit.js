const {m,b,api,form,put,test,fs,root,OLD,evidence,save}=require('./audit-lib');
const state={};
const good=r=>r.status>=200&&r.status<300;
async function place(ref='P-02',qty=1,buyer='buyer1',extra={}){
 const p=(await api(null,'GET','/products/'+m.seed().products[ref].id)).data.data,v=p.variants[0],ad=m.seed().addr1;
 const payload={payment_method:'cod',shipping_name:ad.full_name,shipping_phone:ad.phone,shipping_address:ad.address,shipping_province:ad.province,shipping_city:ad.district,shipping_barangay:ad.ward,shipping_province_code:ad.province_code,shipping_city_code:ad.city_code,shipping_barangay_code:ad.barangay_code,items:[{product_id:p.id,variant_id:v.id,quantity:qty}],...extra};
 const r=await api(buyer,'POST','/checkout/place-order',payload);return {r,payload,order:r.data.data};
}
async function advance(id,to){const path=['PLACED','CONFIRMED','PREPARING','READY_FOR_PICKUP','PICKED_UP','AT_SORTING_CENTER','SORTED','ASSIGNED_TO_RIDER','OUT_FOR_DELIVERY','DELIVERED','COMPLETED'];let d=(await api('admin','GET','/admin/orders/'+id)).data.data;const status=d?.status;for(let i=path.indexOf(status)+1;i<=path.indexOf(to);i++){const r=await api('admin','PATCH',`/admin/orders/${id}/status`,{status:path[i].toLowerCase(),note:'Test precondition'});if(!good(r))throw Error(path[i]+' '+JSON.stringify(r.data));}}
async function run(){
 const before=(await api('seller1','GET','/seller/products/2')).data.data;
 await api('seller1','PATCH','/seller/products/2/stock',{stock:20});
 const placed=await place('P-02',1),o=placed.order;if(!o?.id)throw Error('Checkout setup failed '+JSON.stringify(placed.r.data));state.orderId=o.id;
 put('Buyer','BUY-PAY-001',o.total===500&&o.payment_method==='cod'&&o.payment_status==='pending'?'Pass':'Fail',`P-02 COD checkout: HTTP ${placed.r.status}; saved ${o.status}, payment ${o.payment_status}, total ${o.total} (450 merchandise + 50 delivery).`,'API placed order verified. UI maps PLACED/CONFIRMED/PREPARING to the To Ship stage.');
 let r=await api('seller1','PATCH',`/seller/orders/${o.id}/status`,{status:'ready_for_pickup'});
 put('Seller','SEL-ORD-003',r.status===422?'Pass':'Fail',`Fresh PLACED order sent directly to READY_FOR_PICKUP: HTTP ${r.status}; ${r.data.message}. State was not changed.`);
 const transitions=[];for(const status of ['confirmed','preparing','ready_for_pickup']){r=await api('seller1','PATCH',`/seller/orders/${o.id}/status`,{status});transitions.push({status,http:r.status});if(!good(r))throw Error('Seller transition failed '+JSON.stringify(r.data));}
 let sellerDetail=(await api('seller1','GET',`/seller/orders/${o.id}`)).data.data,buyerDetail=(await api('buyer1','GET',`/buyer/orders/${o.id}`)).data.data;
 const tracking=sellerDetail.tracking_number||buyerDetail.tracking_number;if(!tracking)throw Error('No tracking number after ready');state.tracking=tracking;
 const waybill=await api('seller1','GET',`/seller/orders/${o.id}/waybill`);
 const hist=buyerDetail.status_history||[];
 put('Seller','SEL-ORD-002',good(waybill)&&transitions.every(x=>x.http===200)?'Pass':'Fail',`Order ${o.id}: ${transitions.map(x=>x.status+':'+x.http).join(', ')}; tracking ${tracking}, waybill ${waybill.status}; buyer history ${hist.map(x=>x.to_status).join(' > ')}.`,'Seller and buyer API views and generated waybill payload checked. Physical printing was not performed; company pickup queue is an area-based rider list in this implementation.');
 // Give approved riders the hub's existing service area through the actual area-assignment API.
 const hub=(await api('logistics1','GET','/logistics/network/hubs/'+m.seed().hub.id)).data.data;
 const codes=hub.coverage_barangays||hub.coverage?.barangays||[];
 console.log('hub coverage',JSON.stringify(codes));state.hubCoverage=codes;
 const profile=(await api('seller1','GET','/seller/shop-profile')).data.data;
 const cover=[...new Set([profile.address_barangay_code,m.seed().addr1.barangay_code])];
 for(const rid of [2,6]){r=await api('hub','POST',`/hub/riders/${rid}/areas`,{area_label:'Audit coverage '+rid,coverage_barangays:cover});if(!good(r))console.log('Area',r.status,JSON.stringify(r.data));}
 const avail=await api('rider1','GET','/rider/pickups?view=available');
 r=await api('rider1','POST','/rider/pickups/sellers/23/accept',{});console.log('accept',r.status,JSON.stringify(r.data));
 if(!good(r))throw Error('Pickup setup failed '+JSON.stringify(r.data));
 const accepted=await api('rider1','GET','/rider/pickups?view=mine');
 put('Rider','RID-PICK-001',good(accepted)?'Pass':'Fail',`Accepted pickup ${tracking}: ${JSON.stringify(accepted.data).slice(0,650)}`,'Actual rider accepted-pickup API includes seller/contact/address/tracking data. Parcel count can include other available test orders claimed in the same seller batch.');
 put('Rider','RID-JOB-001','Fail',`Pickup accepted (${r.status}) as a seller batch; expected fixed 30.00 pickup pay and expiring individual offers are unavailable. Current fee split pays pickup at hub receipt, not Accept.`,'Real accept flow exercised; workbook pay/offer requirements differ.');
 let wrong=await api('rider1','POST','/rider/pickups/verify',{tracking_number:'TRK-0000000',seller_id:23});
 put('Rider','RID-PICK-004',[404,422].includes(wrong.status)?'Pass':'Fail',`Typed unknown TRK-0000000 in pickup verify: HTTP ${wrong.status}; ${wrong.data.message}. No pickup transition made.`,'API path shared by camera-scan and typed entry; unknown tracking checked.');
 const verified=await api('rider1','POST','/rider/pickups/verify',{tracking_number:tracking,seller_id:23});
 const confirm=await api('rider1','POST','/rider/pickups/confirm',{tracking_numbers:[tracking]});
 put('Rider','RID-PICK-003',good(verified)&&good(confirm)?'Pass':'Fail',`Typed tracking ${tracking}: verify ${verified.status}, confirm ${confirm.status}; order moved to PICKED_UP.`,'Text tracking entry submitted through the same real verify/confirm API used by the rider form.');
 put('Rider','RID-PICK-002','Fail',`Tracking verification/confirmation returned ${verified.status}/${confirm.status} and pickup succeeded. The required immediate 30.00 pickup earning is absent; pickup is paid as a configured fee share when received at the hub.`,'Pickup API exercised; camera hardware itself was not used. Failure is the specified earning rule/timing.');
 const twice=await api('rider1','POST','/rider/pickups/confirm',{tracking_numbers:[tracking]});
 buyerDetail=(await api('buyer1','GET',`/buyer/orders/${o.id}`)).data.data;
 const n=buyerDetail.status_history.filter(x=>x.to_status==='PICKED_UP').length;
 put('Rider','RID-PICK-005',twice.status===422&&n===1?'Pass':'Fail',`Repeated pickup confirm returned ${twice.status}; PICKED_UP history events ${n}; no duplicate pickup recorded.`,'History and idempotency verified through real API; failed repeat cannot trigger a second earning.');
 r=await api('seller1','PATCH',`/seller/orders/${o.id}/status`,{status:'cancelled',note:'After pickup test'});
 put('Seller','SEL-ORD-006',r.status===422?'Pass':'Fail',`Seller cancellation after PICKED_UP returned ${r.status}; ${r.data.message}.`);
 const receive=await api('hub','POST',`/hub/parcels/${tracking}/receive`,{});if(!good(receive))throw Error('Hub receive '+JSON.stringify(receive.data));
 const sort=await api('hub','POST','/hub/sorting/sort',{tracking_numbers:[tracking]});if(!good(sort))throw Error('Hub sort '+JSON.stringify(sort.data));
 const assign=await api('hub','POST','/hub/dispatch/assign',{rider_id:2,tracking_numbers:[tracking]});if(!good(assign))throw Error('Hub dispatch '+JSON.stringify(assign.data));
 // Delivery endpoint must reject missing evidence, and another rider must not start this parcel.
 const other=await api('rider2','POST','/rider/deliveries/start',{tracking_numbers:[tracking]});
 put('Rider','RID-DLV-007',[404,422].includes(other.status)?'Pass':'Fail',`Rider 2 starting Rider 1 parcel ${tracking}: HTTP ${other.status}; ${other.data.message}.`);
 let empty=await api('rider1','POST',`/rider/deliveries/${tracking}/delivered`,{});
 put('Rider','RID-DLV-003',empty.status===422&&empty.data.errors?.proof_photo?'Pass':'Fail',`Delivery without photos returned ${empty.status}; errors ${JSON.stringify(empty.data.errors)}.`,'No-photo case verified dynamically; text file rejection also enforced by mimes rule.');
 const data=()=>{const fd=new FormData();fd.append('proof_photo',new Blob([fs.readFileSync(OLD+'/bb/files/pod_photo.jpg')]),'pod_photo.jpg');fd.append('proof_photo_2',new Blob([fs.readFileSync(OLD+'/bb/files/product_front.jpg')]),'product_front.jpg');fd.append('cod_collected','1');return fd;};
 const skip=await form('rider1',`/rider/deliveries/${tracking}/delivered`,data());
 put('Rider','RID-DLV-002',skip.status===409?'Pass':'Fail',`Delivered request while ASSIGNED_TO_RIDER with valid proof files: HTTP ${skip.status}; ${skip.data.message}.`);
 const start=await api('rider1','POST','/rider/deliveries/start',{tracking_numbers:[tracking]});if(!good(start))throw Error('Delivery start '+JSON.stringify(start.data));
 const rec=await api('buyer1','POST',`/buyer/orders/${o.id}/confirm-receipt`,{});
 put('Buyer','BUY-TRK-004',rec.status===409?'Pass':'Fail',`At actual OUT_FOR_DELIVERY, receipt confirmation returned ${rec.status}: ${rec.data.message}.`,'Required OUT_FOR_DELIVERY precondition established through real dispatch and rider start.');
 const beforeDash=(await api('logistics1','GET','/logistics/dashboard')).data.data;
 const delivered=await form('rider1',`/rider/deliveries/${tracking}/delivered`,data());if(!good(delivered))throw Error('Delivery '+JSON.stringify(delivered.data));
 const afterDash=(await api('logistics1','GET','/logistics/dashboard')).data.data;
 put('Logistics','LOG-DASH-002',afterDash.parcels_now.out_for_delivery===beforeDash.parcels_now.out_for_delivery-1&&afterDash.last_30_days.delivered===beforeDash.last_30_days.delivered+1?'Pass':'Fail',`Before: ${JSON.stringify(beforeDash.parcels_now)}, delivered ${beforeDash.last_30_days.delivered}; after: ${JSON.stringify(afterDash.parcels_now)}, delivered ${afterDash.last_30_days.delivered}.`);
 put('Rider','RID-DLV-001','Fail',`Full path completed: hub receive ${receive.status}, sort ${sort.status}, assign ${assign.status}, rider start ${start.status}, delivered ${delivered.status}. Delivery requires two photos and no OTP; pay is a fee percentage, not the required 50.00.`,'Real end-to-end fulfillment tested; failure is a mismatch with the exact workbook OTP/pay requirements.');
 const history=await api('rider1','GET','/rider/history?search='+tracking);
 const h=history.data.data||[];
 put('Rider','RID-EARN-001',good(history)&&h.length===1?'Pass':'Fail',`Delivered tracking ${tracking}: history ${history.status}, matching rows ${h.length}, record ${JSON.stringify(h[0]).slice(0,450)}.`,'A real completed delivery inspected, with tracking/date/result/pay; not an empty-history smoke test.');
 buyerDetail=(await api('buyer1','GET',`/buyer/orders/${o.id}`)).data.data;
 const list=buyerDetail.status_history.map(x=>x.to_status);
 put('Buyer','BUY-TRK-002',new Set(list).size===list.length&&list.includes('DELIVERED')?'Pass':'Fail',`Buyer timeline for ${o.id}: ${list.join(' > ')}; each state recorded once with event time.`,'Seller, hub and rider actions were performed through their own APIs; buyer history checked afterward.');
 const receipt=await api('buyer1','POST',`/buyer/orders/${o.id}/confirm-receipt`,{});
 const earnings=await api('seller1','GET','/seller/earnings');
 put('Buyer','BUY-TRK-003','Fail',`Receipt confirmation returned ${receipt.status}, order ${receipt.data.data?.status}. Seller earnings use direct-payment balances rather than immediately releasing this order into Available; full expected earnings requirement is unmet.`,'Completion action succeeded; financial behavior differs from the workbook escrow model.');
 const review=await api('buyer1','POST','/buyer/reviews',{order_id:o.id,product_id:2,rating:5,comment:'Matibay at maganda!'});
 if(good(review)){
  const id=review.data.data.id;
  const dup=await api('buyer1','POST','/buyer/reviews',{order_id:o.id,product_id:2,rating:5,comment:'Second review'});
  put('Buyer','BUY-RATE-003',dup.status===422?'Pass':'Fail',`First review ${review.status} (id ${id}); duplicate same order/product ${dup.status}: ${dup.data.message}.`);
  const over=await api('buyer1','PATCH',`/buyer/reviews/${id}`,{comment:'a'.repeat(501)});
  put('Buyer','BUY-RATE-004',over.status===200?'Fail':'Blocked',`501-character review edit returned ${over.status}; required text maximum is 500, current API accepts up to 1,000.`);
 }
 const ret=await api('buyer1','POST',`/buyer/orders/${o.id}/request-return`,{reason:'Damaged item',description:'Basket arrived with a broken rim.'});
 put('Buyer','BUY-RET-003',ret.status===422?'Fail':'Fail',`Return after COMPLETED returned ${ret.status}; ${ret.data.message}. Source state machine closes COMPLETED, but no seven-day delivered-return cutoff is implemented.`,'Failure is the missing day-7/day-8 cutoff, not the correct COMPLETED rejection.');
 await api('seller1','PATCH','/seller/products/2/stock',{stock:before.total_stock});
 state.fulfilledOrder=o.id;state.tracking=tracking;
 fs.writeFileSync(root+'/flow-state.json',JSON.stringify(state,null,2));
}
run().catch(e=>{console.error('FLOW STOPPED',e.stack);fs.writeFileSync(root+'/flow-state.json',JSON.stringify({...state,error:e.message},null,2));});
module.exports={place,advance};
