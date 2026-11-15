const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs'))) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  if (/[A-Z]:[\\/](?:Users|Projects)[\\/]/i.test(source)) throw new Error(`Machine-specific source path: ${file}`);
  const result = spawnSync(process.execPath, ['--check', path.join(__dirname, file)], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Invalid JavaScript: ${file}\n${result.stderr}`);
}
const result = spawnSync(process.execPath, [path.join(__dirname, 'validate-workflow.cjs')], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
console.log('Tool syntax, portable paths and workflow structure verified.');
