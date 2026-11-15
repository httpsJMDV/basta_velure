const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const artifactRoot = path.join(repoRoot, '.local/artifacts/cicd');
const evidenceRoot = path.join(artifactRoot, 'evidence');
const publishedEvidence = path.join(repoRoot, 'docs/cicd/evidence');
const pdfName = 'Loved-IT_CICD_Lab_Report_BSIT3C_ITEL304.pdf';

function prepareArtifacts() {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  // Only published, sanitized evidence is used to bootstrap a fresh checkout.
  for (const name of fs.readdirSync(publishedEvidence)) {
    if (!/^(run-\d+(?:-summary\.png|\.json)|ghcr-package\.png|evidence-manifest\.json|registry-public-check\.json)$/.test(name)) continue;
    const target = path.join(evidenceRoot, name);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(publishedEvidence, name), target);
  }
}

function browserOptions() {
  const chrome = process.env.LOVED_IT_CHROME || (process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe')
    : undefined);
  return { headless: true, ...(chrome && fs.existsSync(chrome) ? { executablePath: chrome } : {}) };
}

module.exports = {
  repoRoot, artifactRoot, evidenceRoot, pdfName, prepareArtifacts, browserOptions,
  publishedPdf: path.join(repoRoot, 'docs/cicd/submission', pdfName),
  resolveRepo: (...parts) => path.join(repoRoot, ...parts),
};
