const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.cjs');

const source = path.join(config.artifactRoot, config.pdfName);
if (!fs.existsSync(source)) throw new Error('Generate and verify the report first: npm run report');
fs.mkdirSync(path.dirname(config.publishedPdf), { recursive: true });
fs.copyFileSync(source, config.publishedPdf);
console.log(`Project report exported: ${path.relative(config.repoRoot, config.publishedPdf)}`);
