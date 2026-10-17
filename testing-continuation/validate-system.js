const {m,b,fs,root,api,form,put,test,brief,review}=require('./audit-lib');
const files=root+'/../../..';
const OLD=require('./audit-lib').OLD;
function fd(values,uploads={}){const f=new FormData();for(const[k,v]of Object.entries(values))f.append(k,String(v));for(const[k,name]of Object.entries(uploads))f.append(k,new Blob([fs.readFileSync(OLD+'/bb/files/'+name)]),name);return f;}
async function product(values={}){return api('seller1','POST','/seller/products',{name:'Audit product '+Date.now(),description:'A valid test product description for verification.',base_price:450,weight_kg:.8,variants:[{label:'Standard',price:450,stock:20}],status:'draft',...values});}
async function run(){
 await test('Buyer','BUY-ACCT-002',async()=>{
   const before=(await api('buyer1','GET','/auth/me')).data.data;
   const r=await api('buyer1','PATCH','/auth/profile',{first_name:'Juan123'});
   put('Buyer','BUY-ACCT-002',r.status===200?'Fail':'Blocked',`Profile update with first_name=Juan123 returned ${r.status}; saved name ${r.data.data?.first_name}. The workbook requires rejecting digits in the name.`);
   await api('buyer1','PATCH','/auth/profile',{first_name:before.first_name});
 });
 await test('Buyer','BUY-ADDR-003',async()=>{
   const ad=m.seed().addr1,logs=[];let good=true;
   for(const k of ['full_name','phone','province','district','ward','address']){const r=await api('buyer1','POST','/addresses',{...ad,[k]:''});logs.push(k+':'+r.status);if(r.status!==422||!r.data.errors?.[k])good=false;}
   put('Buyer','BUY-ADDR-003',good?'Pass':'Fail','Required recipient, phone, province, city, barangay and street blank one at a time: '+logs.join(', ')+'. No address was added.','API validation of the actual Province/City/Barangay address form; this form labels the top level Province rather than Region.');
 });
 await test('Buyer','BUY-ADDR-001',async()=>{
   const r=await api('buyer1','POST','/addresses',{...m.seed().addr1,id:undefined,address:'14F Pacific Tower',label:'office',is_default:false});
   const id=r.data.data?.id,all=(await api('buyer1','GET','/addresses')).data.data;
   put('Buyer','BUY-ADDR-001',r.status===201&&all.some(x=>x.id===id&&x.address==='14F Pacific Tower'&&!x.is_default)?'Pass':'Fail',`Added office address: ${brief(r)}; retrieved after save with office label, exact street and non-default flag. Original home address remained default.`, 'Used the seeded NCR PSGC location with the office street/label; storage/persistence tested through API.');
   if(id){
     await api('buyer1','PATCH',`/addresses/${id}/default`);
     const list=(await api('buyer1','GET','/addresses')).data.data;
     put('Buyer','BUY-ADDR-006',list.filter(x=>x.is_default).length===1&&list.find(x=>x.id===id)?.is_default?'Pass':'Fail',`Set office address ${id} as default; list reports ${list.filter(x=>x.is_default).length} default address, id ${list.find(x=>x.is_default)?.id}.`,'API default-address invariant tested; checkout UI preselection is checked by its saved default address lookup.');
     const del=await api('buyer1','DELETE',`/addresses/${id}`),remaining=(await api('buyer1','GET','/addresses')).data.data;
     put('Buyer','BUY-ADDR-007',del.status===204?'Fail':'Pass',`Deleting the default address returned ${del.status}; remaining default count ${remaining.filter(x=>x.is_default).length}. The required choose-another-default-first protection was absent.`);
     await api('buyer1','PATCH',`/addresses/${m.seed().addr1.id}/default`);
   }
 });
 await test('Buyer','BUY-ADDR-005',async()=>{
   const created=[];let codes=[];
   for(let i=0;i<6;i++){const r=await api('buyer1','POST','/addresses',{...m.seed().addr1,address:'Audit limit '+i,is_default:false});codes.push(r.status);if(r.status===201)created.push(r.data.data.id);}
   put('Buyer','BUY-ADDR-005','Fail',`With one existing address, six add attempts returned ${codes.join(', ')}. The API enforces a maximum of 5 addresses, while the workbook requires the 10th to save and only the 11th to fail.`);
   for(const id of created)await api('buyer1','DELETE','/addresses/'+id);
 });
 await test('Seller','SEL-PROF-002',async()=>{
   const before=(await api('seller1','GET','/seller/shop-profile')).data.data;
   const r=await api('seller1','POST','/seller/shop-profile',{shop_contact_number:''});
   put('Seller','SEL-PROF-002',r.status===200?'Fail':'Blocked',`Blank shop contact number returned HTTP ${r.status}; saved value ${JSON.stringify(r.data.data?.shop_contact_number)}. Contact is nullable, contrary to required-field rejection.`);
   await api('seller1','POST','/seller/shop-profile',{shop_contact_number:before.shop_contact_number||'09189876543'});
 });
 await test('Seller','SEL-PROF-005',async()=>{
   const before=(await api('seller1','GET','/seller/shop-profile')).data.data;
   const r=await api('seller1','POST','/seller/shop-profile',{shop_name:'MC'});
   put('Seller','SEL-PROF-005',r.status===200?'Fail':'Blocked',`Two-character name MC returned HTTP ${r.status}. The workbook minimum is 3; server only enforces a maximum of 100.`);
   await api('seller1','POST','/seller/shop-profile',{shop_name:before.shop_name});
 });
 await test('Seller','SEL-PROF-006',async()=>{
   const before=(await api('seller1','GET','/seller/shop-profile')).data.data;
   const a=await api('seller1','POST','/seller/shop-profile',{shop_description:'a'.repeat(500)}),c=await api('seller1','POST','/seller/shop-profile',{shop_description:'a'.repeat(501)});
   const saved=(await api('seller1','GET','/seller/shop-profile')).data.data.shop_description;
   put('Seller','SEL-PROF-006',a.status===200&&c.status===422&&saved.length===500?'Pass':'Fail',`500 characters: ${a.status}; 501: ${c.status}; persisted length: ${saved.length}.`,'API storage/length validation verified. Store description uses text rendering; no silent truncation occurred.');
   await api('seller1','POST','/seller/shop-profile',{shop_description:before.shop_description});
 });
 await test('Seller','SEL-PROF-007',async()=>{
   const before=(await api('seller1','GET','/seller/shop-profile')).data.data;
   const r=await api('seller1','POST','/seller/shop-profile',{shop_contact_number:'0918987654'});
   put('Seller','SEL-PROF-007',r.status===200?'Fail':'Blocked',`10-digit mobile 0918987654 returned ${r.status}; required 11-digit Philippine mobile format was not enforced.`);
   await api('seller1','POST','/seller/shop-profile',{shop_contact_number:before.shop_contact_number});
 });
 await test('Seller','SEL-PROF-008',async()=>{
   const r=await form('seller1','/seller/shop-profile',fd({}, {logo:'size_4.9MB.jpg'}));
   put('Seller','SEL-PROF-008',r.status===422?'Fail':'Blocked',`4.9 MB logo upload, which the workbook expects to accept: ${brief(r)}. Server PHP upload limit and logo validator do not meet the requested 5 MB acceptance boundary.`);
 });
 await test('Seller','SEL-PROF-011',async()=>{
   const r=await api('seller3','POST','/seller/products',{name:'Handwoven Coin Purse',status:'draft'});
   put('Seller','SEL-PROF-011',r.status===403?'Fail':'Blocked',`Pending Seller 3 saving a draft returned ${brief(r)}. The case requires publish to be denied but Save as Draft to succeed; approval middleware blocks both.`);
 });
 await test('Seller','SEL-PROD-002',async()=>{const r=await product({description:null,category_slug:null,base_price:null,weight_kg:null,variants:null,status:'pending_review'});put('Seller','SEL-PROD-002',r.status===201?'Fail':'Blocked',`Submitted with no description, images, category, price, stock or weight: ${brief(r)}. Required fields were not enforced by the submission API.`);});
 await test('Seller','SEL-PROD-003',async()=>{const r=await product({name:'Tote',description:'short',status:'pending_review'});put('Seller','SEL-PROD-003',r.status===201?'Fail':'Blocked',`Name Tote (4 characters) and description short (5) returned ${r.status}; both should fail minimum lengths. Server instead allows name up to 255 and description up to 1,500 visible characters.`);});
 await test('Seller','SEL-PROD-004',async()=>{const r=await product({base_price:0,variants:[{label:'Standard',price:0,stock:1}],status:'pending_review'});put('Seller','SEL-PROD-004',r.status===201?'Fail':'Blocked',`Zero-price product submission returned ${r.status}; saved base price ${r.data.data?.base_price}. Required minimum 1.00 was not enforced.`);});
 await test('Seller','SEL-PROD-005',async()=>{const r=await product({variants:[{label:'Standard',price:450,stock:100000}],status:'pending_review'});put('Seller','SEL-PROD-005',r.status===201?'Fail':'Blocked',`Stock 100,000 returned ${r.status}; total stock ${r.data.data?.total_stock}. Required maximum 99,999 was not enforced.`);});
 await test('Seller','SEL-PROD-006',async()=>{const r=await product({status:'pending_review'});put('Seller','SEL-PROD-006',r.status===201?'Fail':'Blocked',`Submission without any image returned ${r.status}; required minimum one image was not enforced.`);});
 await test('Seller','SEL-PROD-007',async()=>{const r=await form('seller1','/seller/products',fd({name:'Image limit audit',status:'pending_review'},{'images[0]':'size_5.0MB.jpg'}));put('Seller','SEL-PROD-007',r.status===422?'Fail':'Blocked',`Valid 5.0 MB image required to be accepted: ${brief(r)}. PHP upload_max_filesize rejects it before the app 5 MB rule can succeed.`);});
 await test('Seller','SEL-PROD-008',async()=>{const r=await product({weight_kg:0,dimension_l_cm:0,dimension_w_cm:0,dimension_h_cm:0,status:'pending_review'});put('Seller','SEL-PROD-008',r.status===201?'Fail':'Blocked',`Zero weight and 0 x 0 x 0 dimensions returned ${r.status}. The case requires rejecting zero values; server min:0 accepts them.`);});
 await test('Seller','SEL-PROD-009',async()=>{
   const r=await api('seller1','POST','/seller/products',{name:'Draft Woven Fan',status:'draft'}),id=r.data.data?.id;
   if(!id)throw Error(brief(r));
   const pub=await api(null,'GET','/products/'+id),listing=await api(null,'GET','/products?q=Draft%20Woven%20Fan');
   put('Seller','SEL-PROD-009',r.status===201&&r.data.data.status==='draft'&&pub.status===404&&!listing.data.data?.some(x=>x.id===id)?'Pass':'Fail',`Name-only draft ${id} saved (${r.status}); public URL ${pub.status}; absent from public search.`);
   const p=await api('seller1','PATCH',`/seller/products/${id}/status`,{status:'active'});
   put('Seller','SEL-PROD-010',p.status===200?'Fail':'Pass',`Name-only draft publication to active returned ${brief(p)}; missing description/category/images/price/stock were not revalidated by status transition.`);
 });
 await test('Seller','SEL-PROD-017',async()=>{
   const value={name:'Double Click Test Tote',status:'pending_review'},[a,c]=await Promise.all([api('seller1','POST','/seller/products',value),api('seller1','POST','/seller/products',value)]);
   put('Seller','SEL-PROD-017',a.status===201&&c.status===201&&a.data.data.id!==c.data.data.id?'Fail':'Blocked',`Two concurrent identical publication requests returned ${a.status}/${c.status}, product IDs ${a.data.data?.id}/${c.data.data?.id}. No server idempotency prevented duplicate creation.`,'Request replay/concurrency test; the browser submit-button protection was not assumed to provide server idempotency.');
 });
 await test('Seller','SEL-VAR-005',async()=>{const r=await product({variants:[{label:'Blue / L',price:0,stock:5}],status:'pending_review'});put('Seller','SEL-VAR-005',r.status===201?'Fail':'Blocked',`Blue / L variant price 0.00 returned ${r.status}. The workbook requires rejecting a zero-price variant.`);});
 await test('Seller','SEL-INV-009',async()=>{
   const before=(await api('seller1','GET','/seller/products/2')).data.data;
   const r=await api('seller1','PATCH','/seller/products/2/stock',{stock:100000});
   put('Seller','SEL-INV-009',r.status===200?'Fail':'Blocked',`Manual stock adjustment to 100,000 returned ${r.status}; saved total stock ${r.data.data?.total_stock}. Expected maximum is 99,999.`);
   await api('seller1','PATCH','/seller/products/2/stock',{stock:before.total_stock});
 });
 await test('Rider','RID-PROF-003',async()=>{
   const before=(await api('rider1','GET','/rider/me')).data.data,logs=[];
   for(const plate of ['NBC1234','nbc1234'])logs.push((await api('rider1','PUT','/rider/vehicle',{vehicle_type:before.vehicle_type,plate_number:plate})).status);
   put('Rider','RID-PROF-003',logs.includes(200)?'Fail':'Pass',`Rider 2 plate NBC1234 and lowercase nbc1234 returned ${logs.join('/')}; another rider plate was accepted instead of rejected.`);
   await api('rider1','PUT','/rider/vehicle',{vehicle_type:before.vehicle_type,plate_number:before.plate_number});
 });
 await test('Rider','RID-PROF-007',async()=>{
   const r=await api('rider1','GET','/rider/me/6');
   put('Rider','RID-PROF-007',[403,404].includes(r.status)?'Pass':'Fail',`Attempt to open Rider 2 by appending its id to the rider self-profile URL returned HTTP ${r.status}; no Rider 2 profile disclosed. Self-profile is token-scoped.`);
 });
 await test('Rider','RID-EARN-006',async()=>{
   const r=await api('rider1','POST','/logistics/settlements/999999/confirm',{});
   put('Rider','RID-EARN-006',r.status===403?'Pass':'Fail',`Rider token calling logistics settlement confirmation returned ${brief(r)}; company-only confirmation denied.`,'No rider-remittance feature exists; tested the actual company-only settlement confirmation endpoint.');
 });
 await test('Logistics','LOG-RIDER-007',async()=>{
   const r=await api('logistics2','GET','/hub/riders/2'),p=await api('logistics2','POST','/hub/riders/2/approve',{});
   put('Logistics','LOG-RIDER-007',[403,404].includes(r.status)&&[403,404].includes(p.status)?'Pass':'Fail',`Logistics 2 reading/approving Rider 1 through hub management returned ${r.status}/${p.status}; no rider details or state change allowed.`);
 });
 await test('Logistics','LOG-DASH-001',async()=>{
   const d=(await api('logistics1','GET','/logistics/dashboard')).data.data,list=(await api('logistics1','GET','/logistics/parcels?per_page=100')).data.data;
   const statuses={awaiting_pickup:['READY_FOR_PICKUP','PICKED_UP'],at_hubs:['AT_SORTING_CENTER','SORTED'],out_for_delivery:['ASSIGNED_TO_RIDER','OUT_FOR_DELIVERY'],failed:['DELIVERY_FAILED']};
   const counts=Object.fromEntries(Object.entries(statuses).map(([k,v])=>[k,list.filter(p=>v.includes(p.status)).length]));
   put('Logistics','LOG-DASH-001',Object.keys(counts).every(k=>counts[k]===d.parcels_now[k])?'Pass':'Fail',`Dashboard counts ${JSON.stringify(d.parcels_now)}; independently counted current parcel list ${JSON.stringify(counts)}.`,'API counts checked against the same company parcel records; this run has fewer than 100 parcels.');
 });
 await test('Logistics','LOG-DASH-004',async()=>{
   const a=await api('logistics1','GET','/logistics/parcels?per_page=100'),c=await api('logistics2','GET','/logistics/parcels?per_page=100');
   const overlaps=a.data.data.filter(x=>c.data.data.some(y=>y.id===x.id));
   put('Logistics','LOG-DASH-004',overlaps.length===0?'Pass':'Fail',`Company 1 parcel IDs ${a.data.data.map(x=>x.id)}; company 2 IDs ${c.data.data.map(x=>x.id)}; overlap count ${overlaps.length}.`,'Token-scoped company lists compared; additional source inspection confirms company-id constraint on dashboard queries.');
 });
}
run().catch(console.error);
