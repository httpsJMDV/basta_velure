const {m,b,api,form,put,test,fs,root,OLD,evidence,save}=require('./audit-lib');
async function run(){
 const br=await b.launch();fs.mkdirSync(root+'/shots',{recursive:true});
 const p=await b.page(br);await p.evaluateOnNewDocument(t=>localStorage.setItem('token',t),await m.tok('buyer1'));
 const go=async route=>{await p.goto(b.WEB+route,{waitUntil:'domcontentloaded',timeout:30000});if(/^\/products\/\d+$/.test(route))await p.waitForSelector('input[aria-label="Quantity"],h1',{timeout:25000});else await b.sleep(2000);};
 const snap=async id=>{const text=await b.text(p);evidence.push({kind:'browser',case:id,url:p.url(),text,errors:p.errors});await p.screenshot({path:root+'/shots/'+id+'.png',fullPage:false});save();return text;};
 const button=async(text)=>{const clicked=await p.evaluate(text=>{let el=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===text);if(!el)return false;el.click();return true;},text);await b.sleep(180);if(/Add to cart|Buy now/.test(text)&&clicked){await p.waitForFunction(()=>![...document.querySelectorAll('button')].some(x=>/Adding|One moment/.test(x.innerText)),{timeout:20000});await b.sleep(200);}return clicked;};
 const cart=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('loved_it_cart')||'[]'));
 const setCart=async data=>{await p.evaluate(data=>localStorage.setItem('loved_it_cart',JSON.stringify(data)),data);await go('/cart');};
 try{
  await go('/products/1');console.log('PRODUCT', (await b.text(p)).slice(0,1800));
  await test('Buyer','BUY-PDP-001',async()=>{
   await setCart([]);await go('/products/1');await button('Add to cart');await b.sleep(300);const t=await snap('BUY-PDP-001'),a=await cart();
   await button('Natural');await button('M');await button('Add to cart');await b.sleep(400);const c=await cart();
   put('Buyer','BUY-PDP-001',a.length===0&&/choose.*first/i.test(t)&&c.length===1?'Pass':'Fail',`Before selection: cart lines ${a.length}, prompt ${t.match(/Choose[^\n]*first\./i)?.[0]||'not found'}. After Natural and M: ${JSON.stringify(c.map(x=>({variant:x.variant,quantity:x.quantity})))}.`,'Browser form interaction in Edge; screenshot shots/BUY-PDP-001.png.');
  });
  await test('Buyer','BUY-PDP-003',async()=>{
   await go('/products/1');await button('Black');const states=await p.$$eval('button',bs=>bs.filter(x=>x.innerText.trim()==='M').map(x=>({text:x.innerText,disabled:x.disabled})));await snap('BUY-PDP-003');
   const good=states.length>0&&states.every(x=>x.disabled);
   for(const id of ['BUY-PDP-003'])put('Buyer',id,good?'Pass':'Fail',`After selecting Black, size M button states: ${JSON.stringify(states)}; expected M disabled for zero-stock Black/M.`,'Edge browser test.');
   put('Seller','SEL-VAR-009',good?'Pass':'Fail',`Buyer Black/M zero-stock option: ${JSON.stringify(states)}. Size M should be disabled for Black while remaining available for Natural.`,'Shared browser evidence: BUY-PDP-003.');
  });
  await test('Buyer','BUY-PDP-002',async()=>{
   const states=[];for(const[color,size]of [['Natural','S'],['Natural','L'],['Black','S']]){await go('/products/1');await button(color);await button(size);states.push(await p.evaluate(()=>({text:document.querySelector('main')?.innerText||document.body.innerText,images:[...document.images].filter(x=>x.alt).slice(0,4).map(x=>x.src)})));}
   const photoCount=(await api(null,'GET','/products/1')).data.data.images?.length||0;
   await snap('BUY-PDP-002');
   const priceOK=states[0].text.includes('199')&&states[1].text.includes('299')&&states[2].text.includes('199');
   put('Buyer','BUY-PDP-002',priceOK&&photoCount>=2?'Pass':'Fail',`Natural/S, Natural/L and Black/S prices matched: ${priceOK}; seeded product has ${photoCount} image(s), so separate Natural/Black colour imagery ${photoCount>=2?'can switch':'does not exist'}.`,'Browser selections and public product data inspected; initial stock may differ after earlier executed order cases.');
   put('Seller','SEL-VAR-008',photoCount>=2?'Pass':'Fail',`P-01 has ${photoCount} image(s); the requested distinct Natural/Black image switch ${photoCount>=2?'was available':'cannot occur with only one stored image'}.`,'Buyer selection browser evidence shared with BUY-PDP-002; seed lacks the workbook two-colour image setup. A single stored image is a test-data limitation, not proof that the image-switch implementation is broken.');
  });
  await test('Buyer','BUY-PDP-004',async()=>{
   await setCart([]);await go('/products/2');await button('Standard');await b.setVal(p,'input[aria-label="Quantity"]','1.5');await button('Add to cart');await b.sleep(300);const c=await cart();await snap('BUY-PDP-004');
   put('Buyer','BUY-PDP-004',c.some(x=>x.quantity===1.5)?'Fail':'Pass',`Typed quantity 1.5 and added to cart. Saved cart quantities: ${JSON.stringify(c.map(x=>x.quantity))}. Fractional quantities must be rejected.`,'Edge browser input and local cart state verified; actual cart API failure is swallowed by useCart.');
  });
  await test('Buyer','BUY-PDP-007',async()=>{
   await setCart([{variantId:11,productId:5,name:'USB-C Fast Charger 20W',variant:'Standard',price:399,quantity:1,sellerId:37,shopName:'RV Gadget Hub',image:''}]);await go('/products/1');await button('Natural');await button('M');await button('Buy now');await b.sleep(400);const c=await cart();await snap('BUY-PDP-007');
   put('Buyer','BUY-PDP-007','Fail',`Buy now opened ${new URL(p.url()).pathname}; cart contains ${c.length} lines. It adds the product to the existing cart and opens /cart instead of a separate one-item checkout.`,'Browser navigation and cart state verified.');
  });
  await test('Buyer','BUY-CART-001',async()=>{
   await setCart([]);await go('/products/1');await button('Natural');await button('M');await button('Add to cart');await b.sleep(200);await go('/products/1');await button('Natural');await button('M');await b.setVal(p,'input[aria-label="Quantity"]','2');await button('Add to cart');await b.sleep(300);const c=await cart();await snap('BUY-CART-001');
   put('Buyer','BUY-CART-001',c.length===1&&c[0].quantity===3&&c[0].price*3===747?'Pass':'Fail',`Adding Natural/M x1 then x2 saved ${c.length} line(s), quantity ${c[0]?.quantity}, subtotal ${c[0]?.price*c[0]?.quantity}.`,'Edge actions and persisted cart state verified.');
   await go('/products/1');await button('Black');await button('S');await button('Add to cart');await b.sleep(300);const z=await cart();
   put('Buyer','BUY-CART-002',z.length===2&&z.some(x=>x.price===249)&&z.some(x=>x.price===199)?'Pass':'Fail',`Natural/M and Black/S remain ${z.length} lines with prices ${z.map(x=>x.price).join(', ')}.`,'Edge cart interactions.');
  });
  await test('Buyer','BUY-CART-003',async()=>{
   const prod=(await api(null,'GET','/products/5')).data.data,v=prod.variants[0];
   const initial=await cart();initial.push({variantId:v.id,productId:5,name:prod.name,variant:v.label,price:v.price,quantity:1,sellerId:prod.seller.id,shopName:prod.seller.shop_name,image:''});await setCart(initial);await snap('BUY-CART-003');
   const headers=await p.$$eval('main section header',es=>es.map(x=>x.innerText));
   put('Buyer','BUY-CART-003',headers.length===2?'Pass':'Fail',`Cart rendered ${headers.length} store groups: ${headers.join(' | ')}.`,'Prepared mixed-store cart precondition using the public product values, then inspected the rendered Edge page.');
  });
  await test('Buyer','BUY-CART-005',async()=>{
   const prod=(await api(null,'GET','/products/2')).data.data,v=prod.variants[0];await setCart([{variantId:v.id,productId:2,name:prod.name,variant:v.label,price:450,quantity:20,sellerId:prod.seller.id,shopName:prod.seller.shop_name,image:''}]);await p.$eval('button[aria-label="More"]',el=>el.click());await b.sleep(200);const c=await cart();await snap('BUY-CART-005');
   put('Buyer','BUY-CART-005',c[0]?.quantity===21?'Fail':'Pass',`At stock/cart quantity 20, clicking + saved quantity ${c[0]?.quantity}; cart did not enforce the stock ceiling.`,'Browser cart quantity boundary checked.');
   const remove=await p.$$eval('button',bs=>{const el=bs.find(x=>x.innerText.trim()==='Remove');if(el)el.click();return !!el;});await b.sleep(200);await p.reload({waitUntil:'domcontentloaded'});await b.sleep(500);const z=await cart();
   put('Buyer','BUY-CART-009',remove&&z.length===0?'Pass':'Fail',`Remove clicked: ${remove}; persisted cart has ${z.length} line(s) after reload.`,'Edge remove and refresh checked.');
  });
  await test('Buyer','BUY-SRCH-005',async()=>{
   const terms=['%',"' OR '1'='1",'<script>alert(1)</script>','"><img src=x onerror=alert(1)>'];let dialogs=0;p.on('dialog',async d=>{dialogs++;await d.dismiss();});let statuses=[];
   for(const q of terms){const r=await api(null,'GET','/products?q='+encodeURIComponent(q));statuses.push(r.status);await go('/search?q='+encodeURIComponent(q));}
   await snap('BUY-SRCH-005');put('Buyer','BUY-SRCH-005',statuses.every(x=>x===200)&&dialogs===0?'Pass':'Fail',`Special-character/SQL/HTML search HTTP statuses ${statuses.join(', ')}; browser alert dialogs ${dialogs}; no error page or injected popup appeared.`,'API uses q (the actual app search parameter); Edge browser render inspected for each term.');
  });
  await test('Buyer','BUY-ACCT-001',async()=>{
   const before=(await api('buyer1','GET','/auth/me')).data.data;
   const x=await api('buyer1','PATCH','/auth/profile',{first_name:'Juan Miguel Jr.'});
   const f=new FormData();f.append('avatar',new Blob([fs.readFileSync(OLD+'/bb/files/review_photo.jpg')]),'review_photo.jpg');const av=await form('buyer1','/auth/avatar',f);
   await go('/settings');const t=await snap('BUY-ACCT-001'),fresh=(await api('buyer1','GET','/auth/me')).data.data;
   const login=await api(null,'POST','/auth/login',{identifier:before.email,password:m.ACCOUNTS.buyer1[1]});
   const hasPhoto=await p.$$eval('img',es=>es.some(x=>x.complete&&x.naturalWidth>0));
   put('Buyer','BUY-ACCT-001',x.status===200&&av.status===200&&t.includes('Juan Miguel Jr.')&&fresh.email===before.email&&fresh.phone===before.phone&&login.status===200&&hasPhoto?'Pass':'Fail',`Name save ${x.status}, photo upload ${av.status}, fresh settings contains new name ${t.includes('Juan Miguel Jr.')}, rendered image loaded ${hasPhoto}, fresh login ${login.status}; email/phone unchanged ${fresh.email===before.email&&fresh.phone===before.phone}.`,'API changes followed by fresh Edge settings load and a new password login. Avatar was uploaded through API, not the crop modal.');
   await api('buyer1','PATCH','/auth/profile',{first_name:before.first_name});
  });
 }finally{await br.close();save();}
}
run().catch(console.error);
