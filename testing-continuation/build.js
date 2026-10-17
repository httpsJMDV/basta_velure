// Build the answered copies: results/<key>.json + extras/<key>.json -> docs2/answered/<same file name>.xlsx
// usage: node build.js <key> [<key> ...]   (key = workbook name without "Blackbox_Test_Cases_" and ".xlsx")
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SP = __dirname;
const DOCS = 'C:/Projects/basta_velure/docs2';
const OUT = process.env.BB_OUTPUT_DIR || path.join(DOCS, 'answered');
fs.mkdirSync(OUT, { recursive: true });

const RESULT_KEY = {
  'Account_Creation-Buyer': 'Account_Creation-Buyer', 'Account_Creation-Seller1': 'Account_Creation-Seller',
  'Account_Creation-Logistics': 'Account_Creation-Logistics', 'Account_Creation-Rider': 'Account_Creation-Rider',
  'Buyer_Modules-1': 'Buyer_Modules', 'Seller_Modules-1': 'Seller_Modules', 'Logistics_Modules-1': 'Logistics_Modules', 'Rider_Modules-1': 'Rider_Modules',
};

function colWidths(xml) {
  const widths = {};
  for (const m of xml.matchAll(/<col ([^>]*)\/>/g)) {
    const min = +(m[1].match(/min="(\d+)"/) || [])[1], max = +(m[1].match(/max="(\d+)"/) || [])[1], w = +(m[1].match(/width="([\d.]+)"/) || [])[1];
    for (let i = min; i <= max; i++) widths[i] = w;
  }
  return widths;
}
const colIndex = (letters) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** Lines a text needs in a wrapped cell of the given width (characters). */
function lines(text, width) {
  const perLine = Math.max(8, Math.floor((width || 12) * 1.15));
  return String(text).split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
}

for (const key of process.argv.slice(2)) {
  const name = `Blackbox_Test_Cases_${key}`;
  const dir = path.join(SP, 'xl', name);
  const cases = JSON.parse(fs.readFileSync(path.join(SP, 'cases', `${name}.json`), 'utf8'));
  const rkey = RESULT_KEY[key];
  const results = JSON.parse(fs.readFileSync(path.join(SP, 'bb', 'results', `${rkey}.json`), 'utf8'));
  const extrasFile = path.join(SP, 'extras', `${rkey}.json`);
  const extras = fs.existsSync(extrasFile) ? JSON.parse(fs.readFileSync(extrasFile, 'utf8')) : {};

  const sheets = {};
  const sheetXml = {};
  const touch = (file) => {
    if (!sheets[file]) { sheets[file] = { cells: {}, rows: {} }; sheetXml[file] = fs.readFileSync(path.join(dir, file), 'utf8'); }
    return sheets[file];
  };
  const missing = [];

  for (const c of cases) {
    const r = results[c.id];
    if (!r) { missing.push(c.id); continue; }
    const sh = touch(c.file);
    sh.cells[`K${c.row}`] = r.actual;
    sh.cells[`L${c.row}`] = r.status;
    sh.cells[`M${c.row}`] = r.remarks || '';
    const xml = sheetXml[c.file];
    const widths = colWidths(xml);
    const orig = +((xml.match(new RegExp(`<row r="${c.row}"[^>]*ht="([\\d.]+)"`)) || [])[1] || 15);
    const need = Math.max(lines(r.actual, widths[11]), lines(r.remarks || '', widths[13]));
    sh.rows[c.row] = Math.min(409, Math.max(orig, Math.ceil(need * 14.5 + 6)));
  }

  // Summary sheet run details (B5..B9) and Assumptions column D, located by their labels.
  const wbXml = fs.readFileSync(path.join(dir, 'xl/workbook.xml'), 'utf8');
  const rels = fs.readFileSync(path.join(dir, 'xl/_rels/workbook.xml.rels'), 'utf8');
  const shared = fs.existsSync(path.join(dir, 'xl/sharedStrings.xml')) ? [...fs.readFileSync(path.join(dir, 'xl/sharedStrings.xml'), 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')) : [];
  const fileOf = (sheetName) => {
    const m = [...wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find((x) => x[1] === sheetName);
    const rel = [...rels.matchAll(/<Relationship [^>]*>/g)].map((x) => x[0]).find((x) => x.includes(`Id="${m[2]}"`));
    return 'xl/' + rel.match(/Target="([^"]+)"/)[1].replace(/^\/?xl\//, '');
  };
  const cellText = (xml, ref) => {
    const m = xml.match(new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`));
    if (!m) return '';
    const inner = m[2] || '';
    if (/t="s"/.test(m[1])) return shared[+(inner.match(/<v>(\d+)<\/v>/) || [])[1]] || '';
    return [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('') || (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
  };

  if (extras.summary) {
    const file = fileOf('Summary');
    const sh = touch(file);
    const xml = sheetXml[file];
    for (let r = 4; r <= 12; r++) {
      const label = cellText(xml, `A${r}`);
      if (extras.summary[label] !== undefined) sh.cells[`B${r}`] = extras.summary[label];
    }
  }
  if (extras.assumptions) {
    const file = fileOf('Assumptions');
    const sh = touch(file);
    const xml = sheetXml[file];
    const widths = colWidths(xml);
    for (const m of xml.matchAll(/<row r="(\d+)"/g)) {
      const r = +m[1];
      const ref = cellText(xml, `A${r}`);
      if (extras.assumptions[ref] !== undefined) {
        sh.cells[`D${r}`] = extras.assumptions[ref];
        const orig = +((xml.match(new RegExp(`<row r="${r}"[^>]*ht="([\\d.]+)"`)) || [])[1] || 15);
        sh.rows[r] = Math.min(409, Math.max(orig, Math.ceil(lines(extras.assumptions[ref], widths[4]) * 14.5 + 6)));
      }
    }
  }

  if (missing.length) console.log(`${key}: no result yet for ${missing.length} case(s): ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`);
  const spec = path.join(SP, `fill-${rkey}.json`);
  fs.writeFileSync(spec, JSON.stringify({ sheets }));
  const out = execFileSync('php', [path.join(SP, 'fill.php'), path.join(DOCS, `${name}.xlsx`), path.join(OUT, `${name}.xlsx`), spec], { encoding: 'utf8' });
  process.stdout.write(out);
}
