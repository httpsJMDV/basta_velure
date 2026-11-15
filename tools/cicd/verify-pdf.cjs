const config=require('./config.cjs');
config.prepareArtifacts();
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const base=config.artifactRoot,pdf=fs.existsSync(base+'/'+config.pdfName)?base+'/'+config.pdfName:config.publishedPdf;
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const {createCanvas}=require('@napi-rs/canvas');
 const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(pdf)),useSystemFonts:true}).promise;
 const texts=[];for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);const t=(await page.getTextContent()).items.map(i=>i.str).join(' ');assert.ok(t.length>45,'Unexpected empty page '+n);texts.push(t);}
 const full=texts.join('\n');for(const item of ['Jeremy Reyes','Jay Mark Del Valle','King Ordoña','Liam Rubiales','Amaru Jay Balmes','BSIT 3C','ITEL 304','Dockerfile','43682170954'])assert.ok(full.includes(item),'Missing '+item);
 assert.ok(full.includes('43684448555'),'Final successful run is missing');
 assert.ok(!full.includes('Not yet recorded'),'Registry evidence is incomplete');
 const samples=[1,texts.findIndex(t=>t.includes('Run 43682170954'))+1,texts.findIndex(t=>t.includes('Registry verification'))+1,texts.findIndex(t=>t.includes('Individual sheet 1'))+1,doc.numPages];
 for(const n of [...new Set(samples.filter(Boolean))]){const page=await doc.getPage(n),viewport=page.getViewport({scale:1.3}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport}).promise;fs.writeFileSync(base+'/evidence/pdf-page-'+n+'.png',canvas.toBuffer('image/png'));}
 fs.writeFileSync(base+'/evidence/pdf-text.txt',full);
 console.log(JSON.stringify({pages:doc.numPages,all_pages_have_text:true,names_and_subject:'verified',rendered_pages:samples,pdf_bytes:fs.statSync(pdf).size}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
