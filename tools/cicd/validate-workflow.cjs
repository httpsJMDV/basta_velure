const config=require('./config.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),yaml=require('yaml');
const workflow=yaml.parse(fs.readFileSync(config.resolveRepo(".github/workflows/ci-cd.yml"),'utf8'));
assert.equal(workflow.jobs.docker.needs,'ci');assert.ok(workflow.on.push);assert.ok(workflow.on.pull_request);
assert.equal(workflow.jobs.ci.env.DB_DATABASE,'velure_test');assert.equal(workflow.jobs.docker.permissions.packages,'write');
console.log('Workflow YAML parsed; test database and CI delivery gate verified.');
