const {fs,root,results,put,save,cases,evidence}=require('./audit-lib');
put('Seller','SEL-REV-006','Fail','Seller conversation initialization GET /my-conversation returned HTTP 500 (Server Error). The seller cannot open the required attachment workflow to send/check the files. Product buyer/seller conversation start also fails with Target user is not a registered seller.','Runtime application errors, not a skipped test. Buyer shared message validation was tested separately; no claim that seller attachments were uploaded successfully.');
for(const role of ['Buyer','Seller','Logistics','Rider']) {
 const file=`${root}/bb/results/Account_Creation-${role}.json`,d=JSON.parse(fs.readFileSync(file));
 const failIds={Buyer:['TC-BUY-022'],Seller:['TC-SEL-020','TC-SEL-039'],Logistics:['TC-LOG-020','TC-LOG-039'],Rider:['TC-RID-019']}[role];
 for(const id of failIds){
   d[id].status='Fail';
   d[id].remarks+=(id.endsWith('039')?' Final review: the case requires all application details to match; some required details are missing from the system/admin view.':' Final review: duplicate creation was prevented, but the case also requires one OTP/activation email; that required mechanism is absent, so the complete expected result fails.');
 }
 for(const r of Object.values(d)) {
   if(r.status==='Blocked'&&/no |not collect|does not|not in/i.test(r.actual+' '+r.remarks)){r.status='Fail';r.actual=r.actual.replace(/^Could not be run(?: as written)?:\s*/,'Required feature unavailable: ');r.remarks='Missing required workbook feature. '+r.remarks;}
   if(!r.remarks.includes('Recovered evidence'))r.remarks+=' Recovered evidence from the prior recorded browser run; reviewed in this continuation, not rerun as a fresh account test.';
 }
 fs.writeFileSync(file,JSON.stringify(d,null,2));
}
// Avoid ambiguous group reasons when separate requirements are involved.
put('Buyer','BUY-SRCH-011','Fail','There is no seller vacation-mode setting or vacation state on shop/checkout. Products cannot receive the On vacation label or be blocked from the cart by that missing setting.','Implementation review: SellerShopProfileController fields and BuyerOrderController checkout; not a claimed vacation-mode execution.');
put('Buyer','BUY-PDP-005','Fail','Products have stock quantities but no per-buyer lifetime purchase-limit field or enforcement. The required maximum-two-per-buyer purchase restriction for P-07 is unavailable.','Implementation review: checkout validates stock only; no accumulated per-buyer purchase count is checked.');
// Correct over-specific setup wording from the successful targeted follow-up runs.
results.Buyer['BUY-TRK-003'].actual='Buyer receipt confirmation succeeded and changed the delivered order to COMPLETED. The complete case fails because direct-payment order items do not release this order into the required immediately Available seller escrow balance.';
results.Buyer['BUY-TRK-003'].remarks='Actual receipt API executed; BuyerOrderController assigns payout_status=direct. Balance model does not implement the expected immediate release for new direct-payment orders.';
save();
let total=0,counts={};
for(const role of ['Buyer','Seller','Logistics','Rider']) {
 const module=results[role];
 for(const c of cases[role])if(!['Pass','Fail'].includes(module[c.id]?.status))throw Error('Unfinished case '+c.id+': '+module[c.id]?.status);
 for(const key of ['Account_Creation-'+role,role+'_Modules']){
  const d=JSON.parse(fs.readFileSync(`${root}/bb/results/${key}.json`));counts[key]=Object.values(d).reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});total+=Object.keys(d).length;
 }
}
fs.writeFileSync(root+'/final-counts.json',JSON.stringify(counts,null,2));
console.log(total,'case results',JSON.stringify(counts));
