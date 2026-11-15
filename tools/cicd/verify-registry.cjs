const config=require('./config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),{check}=require('./registry-image.cjs');
(async()=>{
 const checks=await Promise.all(['1.0.0-cicd-lab.1','main','0.0.0-cicd-failure-demo.1'].map(check));
 assert.equal(checks[0].manifest_http,200);assert.equal(checks[1].manifest_http,200);assert.equal(checks[2].manifest_http,404);
 const output=config.resolveRepo(".local/artifacts/cicd/evidence/registry-public-check.json");
 fs.writeFileSync(output,JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));console.log(JSON.stringify({published_images_public:true,failed_test_image_absent:true,checks}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
