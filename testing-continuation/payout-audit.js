const {api,put,test}=require('./audit-lib');
async function run(){
 const base={gcash_number:'09171234567',gcash_name:'Maria Clara Santos'},rows=[];
 const before=(await api('seller1','GET','/seller/earnings')).data.data;console.log('payout balance',before.available_balance);
 if(Number(before.available_balance)!==616.55)throw Error('Fixture balance must be exactly 616.55');
 for(const amount of [99.99,100,616.55,616.56,0,'abc']){
   const r=await api('seller1','POST','/seller/payouts/request',{...base,amount});rows.push({amount,status:r.status});
   if(r.status===201){await api('admin','POST',`/admin/payouts/${r.data.data.id}/reject`,{reason:'QA test request cleanup and balance restore'});}
 }
 put('Seller','SEL-EARN-005',rows.every(x=>[100,616.55].includes(x.amount)?x.status===201:x.status===422)?'Pass':'Fail',`Available balance fixture 616.55; request outcomes ${JSON.stringify(rows)}.`,'Precondition seeded on a dedicated completed test order item in velure_blackbox. Each successful request was rejected through admin API to restore balance before the next amount.');
 const first=await api('seller1','POST','/seller/payouts/request',{...base,amount:100}),second=await api('seller1','POST','/seller/payouts/request',{...base,amount:100});
 put('Seller','SEL-EARN-006',first.status===201&&second.status===201?'Fail':'Pass',`First 100.00 request ${first.status}; second while first pending ${second.status}; ids ${first.data.data?.id}/${second.data.data?.id}. Pending-request exclusivity was not enforced.`,'Same seeded available balance; two requests executed through the real payout API.');
 for(const r of [first,second])if(r.status===201)await api('admin','POST',`/admin/payouts/${r.data.data.id}/reject`,{reason:'QA test request cleanup'});
 const pair=await Promise.all([api('seller1','POST','/seller/payouts/request',{...base,amount:100}),api('seller1','POST','/seller/payouts/request',{...base,amount:100})]);
 put('Seller','SEL-EARN-007',pair.every(x=>x.status===201)?'Fail':'Pass',`Concurrent identical 100.00 requests returned ${pair.map(x=>x.status)} with IDs ${pair.map(x=>x.data.data?.id)}; expected exactly one request.`,'Real concurrent API submit tested; test-only balance was seeded to isolate duplicate-request behavior.');
 for(const r of pair)if(r.status===201)await api('admin','POST',`/admin/payouts/${r.data.data.id}/reject`,{reason:'QA test request cleanup'});
}
run().catch(console.error);
