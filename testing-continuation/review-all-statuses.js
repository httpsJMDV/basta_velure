const fs=require('fs'),path=require('path');
const root=__dirname,oldRoot='C:/Users/JM/AppData/Local/Temp/claude/c--Projects/51cc287e-feed-4aae-86f3-7d50f44ec823/scratchpad';
const books={},all=new Map(),changes=[],reviewed=[];
for(const role of ['Buyer','Seller','Logistics','Rider'])for(const kind of ['Account_Creation','Modules']){
 const key=kind==='Account_Creation'?kind+'-'+role:role+'_'+kind;
 const filename=kind==='Account_Creation'?kind+'-'+(role==='Seller'?'Seller1':role):role+'_Modules-1';
 const data=JSON.parse(fs.readFileSync(`${root}/bb/results/${key}.json`));
 const cases=JSON.parse(fs.readFileSync(`${root}/cases/Blackbox_Test_Cases_${filename}.json`));
 books[key]={key,filename,data,cases};
 for(const c of cases){if(!data[c.id]?.actual||!data[c.id]?.remarks)throw Error('Missing evidence '+c.id);all.set(c.id,{book:books[key],c,r:data[c.id]});reviewed.push(c.id);}
}
fs.mkdirSync(root+'/status-review-before',{recursive:true});
for(const book of Object.values(books)){const p=root+'/status-review-before/'+book.key+'.json';if(!fs.existsSync(p))fs.writeFileSync(p,JSON.stringify(book.data,null,2));}
function block(id,dependencies,reason,partial=''){
 const x=all.get(id);if(!x)throw Error('Unknown '+id);for(const dep of dependencies)if(!all.has(dep))throw Error('Unknown prerequisite '+dep);
 const before={...x.r};
 x.r.status='Blocked';
 x.r.actual=`Could not complete ${x.c.scenario.toLowerCase()}: ${reason}`+(partial?' Partial observation: '+partial:'');
 x.r.remarks=`Blocked prerequisite: ${dependencies.join(', ')}. The required setup/action was unavailable, so the dependent expected result was not verified. `+(before.remarks.includes('Recovered evidence')?'Based on the previous recorded browser evidence; not a fresh rerun.':'Evidence reviewed from the existing runtime/implementation findings; this status review did not rerun the system.');
 changes.push({id,workbook:x.book.key,from:before.status,to:'Blocked',dependencies,reason,before,after:{...x.r}});
}
function range(prefix,start,end){return Array.from({length:end-start+1},(_,i)=>prefix+String(i+start).padStart(3,'0'));}
function group(ids,deps,reason){for(const id of ids)block(id,deps,reason);}

// Revisit every originally blocked account test against its specific input/prerequisite.
for(const role of ['Buyer','Seller','Logistics','Rider']){
 const prior=JSON.parse(fs.readFileSync(`${oldRoot}/bb/results/Account_Creation-${role}.json`));
 const rootCase={Buyer:'TC-BUY-001',Seller:'TC-SEL-001',Logistics:'TC-LOG-001',Rider:'TC-RID-001'}[role];
 for(const [id,r]of Object.entries(prior))if(r.status==='Blocked'){
   const c=all.get(id).c;
   let reason;
   if(/OTP/i.test(c.scenario))reason='the required verification page and issued email OTP do not exist. A welcome email/admin review cannot supply the code needed for this test.';
   else if(/activation|password|activates/i.test(c.scenario)&&role==='Rider')reason='no activation email/link or Pending Activation state is produced. The required activation page/token cannot be opened for this case.';
   else if(/TIN/i.test(c.scenario))reason='the registration form has no TIN input. The specified format/duplicate values could not be entered and no TIN validation outcome was observed.';
   else if(/postal/i.test(c.scenario))reason='there is no postal-code input, so the specified length/format values cannot be entered for validation.';
   else if(/SEC registration/i.test(c.scenario))reason='there is no SEC registration-number input, so the specified malformed/duplicate number cannot be submitted for validation.';
   else if(/license/i.test(c.scenario))reason='there is no license-number/expiry input; only a document upload is available. The specified number/date validation cannot be exercised.';
   else if(/seller type/i.test(c.scenario))reason='the form has no Seller Type selector, so no type can be selected to trigger conditional required documents.';
   else if(/service area/i.test(c.scenario))reason='the courier registration form has no Service Areas multi-select, so the specified three selected regions cannot be submitted.';
   else if(id==='TC-RID-030')reason='the company Add Rider form does not exist, so the exact buyer/seller access test has no target form to open.';
   else throw Error('Unreviewed original blocked case '+id);
   block(id,[rootCase],reason,id==='TC-RID-030'?'Related hub/company rider-management URLs denied the buyer, but that is not execution of the missing Add Rider form test.':'');
 }
}

// Buyer: preserve directly observed failures; block follow-on assertions without their required setup.
group(['BUY-ACCT-004','BUY-ACCT-005'],['BUY-ACCT-003'],'the Change Password form/action is absent; current/new-password inputs cannot be submitted to this workflow.');
group(['BUY-ACCT-007','BUY-ACCT-008'],['BUY-ACCT-006'],'the email-change/OTP workflow is unavailable, so an email-change request and OTP cannot be created for the negative/duplicate tests.');
block('BUY-SRCH-002',['SEL-SCAT-001'],'CAT-1 to CAT-5 and the store Lamps category cannot be created; the category-browsing fixture does not exist.');
block('BUY-SRCH-011',['SEL-PROF-009'],'Seller 1 cannot be put On vacation because the vacation switch/state is absent. The required vacation-store prerequisite cannot be established.');
block('BUY-PDP-006',['SEL-FLASH-001','SEL-VOU-001'],'a live P-02 flash sale and claimable MCH50 cannot be created, so this combined promotional product-page fixture is unavailable.');
block('BUY-WISH-003',['SEL-PROD-015'],'the seller cannot delete the active P-05 product through the current workflow, so the combined sold-out/deleted wishlist setup cannot be completed.');
block('BUY-CART-010',['BUY-CART-008'],'there is no buyer-scoped server cart resource or Buyer 2 cart identifier to target; localStorage cannot provide the required cross-account API resource.');
group(range('BUY-VOU-',2,12),['SEL-VOU-001','BUY-VOU-001'],'the required voucher cannot be created/claimed/applied. The specified voucher limits, stacking, expiry, cap or restoration cannot be evaluated without that prerequisite.');
block('BUY-CHK-001',['SEL-VOU-001','BUY-VOU-001'],'the worked example requires three claimed vouchers, but no voucher workflow can produce them; the specified checkout fixture and total cannot be exercised.');
block('BUY-CHK-010',['BUY-VOU-002'],'MCH50 cannot first be applied at checkout, so it cannot subsequently become invalid during that checkout.');
group(range('BUY-PAY-',3,7),['BUY-PAY-002'],'the required gateway order/payment session is unavailable. Direct seller GCash receipts do not provide gateway failure, cancellation, callback or timed gateway-payment states.');
group(range('BUY-CAN-',2,6),['BUY-CAN-001'],'the buyer Cancel Order action is absent, so reason validation, post-shipment cancellation guards and repeated cancellation cannot be submitted through that workflow.');
block('BUY-RET-004',['BUY-RET-001'],'the return workflow has no evidence-photo upload; the specified photo count/type/size inputs cannot be submitted for this validation case.');
block('BUY-RET-005',['SEL-RET-004'],'seller rejection goes directly to mediation/in_progress, not the required Rejected state with a buyer Escalate action. The requested tracking state cannot be produced.');
block('BUY-CHAT-004',['SEL-FLASH-001'],'no flash-sale slot/reminder subscription can be created, so there is no scheduled reminder event to observe.');
block('BUY-CHAT-005',['BUY-CHAT-003'],'the general order-notification inbox cannot supply three unread notifications or per-item/Mark All Read actions. Chat unread counters are a different resource.');

// Seller: the base capability failure stays Fail; dependent cases use Blocked.
block('SEL-PROF-010',['SEL-PROF-009'],'vacation mode cannot first be enabled, so the required On vacation starting state cannot be reached.');
group(range('SEL-SCAT-',2,13),['SEL-SCAT-001'],'the store-category editor/records are absent. The named category or category-edit input required by this case cannot be created or opened.');
block('SEL-PROD-016',['SEL-PROD-015'],'active products with only completed orders cannot be deleted, so the required mixed-selection deletion result cannot be reached through the specified workflow.');
group(['SEL-INV-003'],['BUY-CAN-001'],'a buyer cancellation cannot be performed, so its stock-restoration side effect cannot be measured.');
group(['SEL-INV-004'],['BUY-PAY-006'],'the specified unpaid order auto-cancellation cannot occur, so stock restoration at that event cannot be observed.');
group(range('SEL-DISC-',2,10),['SEL-DISC-001'],'the scheduled-sale editor/record is unavailable. No Upcoming/Ongoing sale, sale timestamps or scheduled-sale validation input exists for this case.');
group(range('SEL-VOU-',2,11),['SEL-VOU-001'],'no seller voucher can be created/opened. The required voucher fields, existing/claimed voucher or usage record cannot be prepared.');
group(range('SEL-FLASH-',2,6),['SEL-FLASH-001'],'a flash-sale slot and allocated flash inventory cannot be created, preventing its boundary, depletion, expiry and overlap tests.');
block('SEL-ORD-007',['BUY-CHK-001'],'the voucher-based worked checkout order cannot be placed, so those exact line items, deductions and order totals are unavailable for comparison.');
block('SEL-RET-005',['SEL-RET-004'],'there is no separate Rejected return state and buyer escalation action to establish the required escalation prerequisite.');
block('SEL-RET-007',['SEL-RET-002'],'the system does not produce the specified approved-and-refunded return; no actual refund transaction exists whose earnings effect can be measured.','A RETURNED order is excluded from the earnings breakdown, but that does not verify a genuine refund.');
block('SEL-REV-003',['SEL-REV-002'],'a seller review reply cannot be created, so there is no existing reply for second-reply/edit testing.');
block('SEL-REV-005',['BUY-CHAT-001'],'the buyer-to-approved-seller conversation could not be opened; the required incoming buyer message/thread is unavailable for a seller reply.');
block('SEL-REV-006',['BUY-CHAT-001'],'no valid seller conversation could be initialized, so the invalid files could not be submitted in the required seller thread.','The alternative GET /my-conversation initialization returned HTTP 500.');
block('SEL-REV-007',['BUY-CHAT-001'],'no valid seller conversation could be initialized, preventing seller-specific empty/length boundary submissions.','The shared validator allows 2,000 characters and a buyer/admin thread accepted 1,001; that is not a completed seller-thread test.');
group(['SEL-EARN-001','SEL-EARN-002'],['BUY-CHK-001'],'the exact voucher-based worked example order cannot be created/completed, so its specified 616.55 earnings and balance transitions cannot be measured.');
block('SEL-EARN-003',['SEL-RET-007'],'the required genuinely refunded order is unavailable, so the combined cancelled/refunded comparison cannot be completed.','Cancellation was tested and gross decreased by 500.00; that verifies only the cancelled-order part.');

// Logistics: distinguish unavailable company actions from dependent state/validation checks.
block('LOG-RIDER-002',['LOG-RIDER-001'],'the company role cannot manage/approve/reject riders; its rider screen is read-only, preventing reason submission and rejection notification testing.');
group(['LOG-RIDER-004','LOG-RIDER-005'],['LOG-RIDER-003'],'the rider suspension workflow is absent, so suspension reason input and a Suspended rider for reactivation cannot be prepared.');
group(['LOG-DISP-003','LOG-DISP-004','LOG-DISP-007','LOG-DISP-008'],['LOG-DISP-002'],'the company Manual Assign action is absent; the specified eligibility/capacity/bulk/not-ready assignment requests cannot be made as Logistics 1.');
block('LOG-DISP-006',['LOG-DISP-005'],'company reassignment is unavailable, so its after-pickup refusal cannot be exercised as the specified role.');
group(range('LOG-HUB-',4,7),['LOG-HUB-001'],'the company role has no inbound scan action. Duplicate, unknown, out-of-order and cross-company scans cannot be submitted through the required Logistics 1 workflow.');
block('LOG-TRK-003',['LOG-TRK-002'],'a successful manual override cannot be performed as Logistics 1; no resulting override audit entry exists for inspection.');
block('LOG-RTS-003',['LOG-RTS-002'],'the requested Returned to Sender / awaiting seller confirmation stage cannot be produced, so its seller-confirmed stock restoration cannot be measured.');
block('LOG-RTS-004',['LOG-RTS-002'],'no specified prepaid RTS refund transaction is initiated, so its refund amount and effect on earnings cannot be verified.');
group(['LOG-RATE-002','LOG-RATE-003','LOG-RATE-004'],['LOG-RATE-001'],'the company zone/rate editor is unavailable; no editable rate or configured zone matrix exists for the specified validation/serviceability/new-zone steps.');
group(['LOG-COD-002','LOG-COD-003'],['LOG-COD-001','RID-EARN-004'],'a rider-to-company remittance/pending confirmation record cannot be created, so shortfall matching and confirmation cannot be exercised.');
block('LOG-COD-005',['LOG-COD-004'],'the company report export action is absent, so no empty-data export request can be issued through that feature.');

// Rider: retain real runtime outcomes; block cases without the required field/state/action.
block('RID-PROF-004',['RID-PROF-001'],'there is no license-expiry input/value to set to yesterday or today; the date-boundary validation cannot be submitted.');
block('RID-PROF-005',['RID-PROF-002'],'the rider vehicle/account workflow has no replacement OR/CR/license upload, so the requested document replacement/type/size checks cannot be reached.');
block('RID-PROF-006',['LOG-RIDER-003'],'a rider-specific Suspended state cannot be established through the company workflow; account suspension is a separate action.');
group(range('RID-AVAIL-',2,4),['RID-AVAIL-001'],'the rider cannot first be placed Online using an availability control; Offline, active-job Offline and logout-to-Offline transitions have no required starting state.');
group(['RID-JOB-002','RID-JOB-003','RID-JOB-004'],['LOG-DISP-001'],'the system does not generate the specified sequential targeted offers. A valid offer/next-rider offer sequence cannot be prepared for decline/timeout tests.');
block('RID-JOB-005',['LOG-DISP-002'],'the company manual-assignment action is unavailable, so it cannot race against the rider offer acceptance in this case.');
block('RID-DLV-004',['RID-DLV-001'],'delivery uses proof photos instead of an OTP; no issued OTP, OTP input or wrong-entry/lockout sequence can be prepared.');
block('RID-DLV-005',['RID-DLV-001'],'the delivery form accepts only a collected-cash checkbox with a server-supplied amount; 499.99/500.00/500.01 cannot be entered for numeric mismatch validation.');
group(['RID-EARN-005','RID-EARN-006'],['RID-EARN-004'],'the rider remittance form/record is absent; no short remittance or pending own-remittance confirmation resource exists.');

for(const x of all.values()){
 if(!['Pass','Fail','Blocked'].includes(x.r.status))throw Error('Unresolved '+x.c.id);
 if(x.r.status==='Blocked'&&!changes.some(c=>c.id===x.c.id))throw Error('Blocked case missing review '+x.c.id);
}
for(const change of changes)for(const dep of change.dependencies)if(all.get(dep).r.status==='Pass')throw Error('Blocking dependency passed: '+change.id+' -> '+dep);
const counts={};for(const book of Object.values(books)){fs.writeFileSync(`${root}/bb/results/${book.key}.json`,JSON.stringify(book.data,null,2));counts[book.key]=Object.values(book.data).reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});}
fs.writeFileSync(root+'/status-review.json',JSON.stringify({reviewed:reviewed.length,policy:'Direct observed defect or absent base capability: Fail. A missing prerequisite preventing the dependent assertions: Blocked. Existing executed outcomes retained unless the record only proves a partial case.',originalAccountEvidence:oldRoot+'/bb/results',counts,changes},null,2));
console.log('Reviewed',reviewed.length,'cases across',Object.keys(books).length,'workbooks.');console.log(JSON.stringify(counts,null,2));
