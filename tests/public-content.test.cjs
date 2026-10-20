const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectFile } = require('../scripts/check-public-content.cjs');

test('public-content guard rejects exports, renamed backups, and encoded share links', () => {
  for (const name of ['client.design.json', 'client.model.json', 'client.ai.md', 'client.share-link.txt', 'designs/client.json']) {
    assert.ok(inspectFile(name, '{}'));
  }
  assert.ok(inspectFile('notes.json', JSON.stringify({ v: 1, model: {}, layout: {} })));
  assert.ok(inspectFile('notes.json', JSON.stringify({ format: 'uml-data-model', classes: [] })));
  assert.ok(inspectFile('README.md', 'https://example.test/#model=' + 'A'.repeat(120)));
});

test('public-content guard permits only the named fictional source model', () => {
  const model = { title: 'Events platform example', ENT: [], CTX: [] };
  assert.equal(inspectFile('src/default-model.json', JSON.stringify(model)), null);
  assert.ok(inspectFile('other.json', JSON.stringify(model)));
  assert.ok(inspectFile('src/default-model.json', JSON.stringify({ ...model, title: 'Private model' })));
  assert.ok(inspectFile('model.html', 'const DM=' + JSON.stringify({ ...model, title: 'F' + 'CP domain model' })));
});
