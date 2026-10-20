// Check repository files without printing model contents or encoded share links.
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const approvedModels = new Map([['src/default-model.json', 'Events platform example']]);

function inspectFile(name, text) {
  if (/(?:^|\/)designs\//i.test(name) || /\.(?:design\.json|model\.json|ai\.md|share-link\.txt)$/i.test(name)) {
    return 'exported designs and share-link files must stay outside the repository';
  }
  if (/[?#&]model=[A-Za-z0-9_%-]{100,}/.test(text)) return 'encoded model link';
  // Recognize exports even when renamed to an innocuous filename.
  let data;
  try { data = JSON.parse(text); } catch { /* Source code is checked below. */ }
  if (data && typeof data === 'object') {
    const isModel = Array.isArray(data.ENT) && Array.isArray(data.CTX);
    const isExport = data.format === 'uml-data-model' || (data.model && data.layout && data.v === 1);
    if (isExport || (isModel && approvedModels.get(name) !== data.title)) return 'unapproved serialized model';
  }
  // A previous private example must never be restored into the shipped source or HTML.
  if (/\b(?:title|name)\s*["']?\s*:\s*["'][^"'\n]*\bFCP\b/i.test(text)) return 'private example marker';
  return null;
}

function checkRepository() {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const failures = [];
  for (const name of new Set(files)) {
    let content;
    try { content = readFileSync(resolve(root, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const reason = inspectFile(name, content.toString('utf8'));
    if (reason) failures.push(`${name}: ${reason}`);
  }
  if (failures.length) throw new Error('Public-content check failed:\n' + failures.join('\n'));
}

module.exports = { inspectFile, checkRepository };
if (require.main === module) {
  checkRepository();
  console.log('Public-content check passed. Only the fictional shipped example is approved.');
}
