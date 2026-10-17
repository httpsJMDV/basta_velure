const fs=require('fs');let file='package-results.js',s=fs.readFileSync(file,'utf8');
const old='Missing OTP/activation, license, TIN, postal code and other required features were changed from Blocked to Fail.';
const next='Every original Blocked record was compared against its Actual Result, Remarks and required setup. Input/token/state-dependent tests that cannot be executed are Blocked; the base capability case records the missing feature as Fail.';
if(s.includes(old))s=s.replace(old,next);
s=s.replace('or a broken prerequisite workflow.','or a directly observed broken workflow. A dependent case prevented by that workflow is Blocked.');
s=s.replace('## Evidence\\n\\n- [Runtime','## Evidence\\n\\n- [Case-by-case status review and before/after reasons](../../testing-continuation/status-review.json)\\n- [Runtime');
s=s.replace("fs.writeFileSync(out+'/SYSTEM_TEST_REPORT.md',report);","fs.writeFileSync(out+'/SYSTEM_TEST_REPORT.md',report.replaceAll('../../testing-continuation',path.relative(out,root).split(path.sep).join('/')));");
fs.writeFileSync(file,s);
