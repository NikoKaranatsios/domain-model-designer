const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const fixture = require('./fixtures/model.cjs');

const source = readFileSync(resolve(__dirname, '../src/ui/state.js'), 'utf8');
const indexes = source.slice(
  source.indexOf('function rebuildIndexes()'),
  source.indexOf('\nrebuildIndexes();')
);
const notation = readFileSync(resolve(__dirname, '../src/uml-notation.js'), 'utf8');
function lines(model) {
  return JSON.parse(
    vm.runInNewContext(
      `
    ${notation}
    const { CTX, ENT, RELS } = model;
    let CTXBY, ENTBY, LINES, ROUTED, LOOPS;
    ${indexes}
    rebuildIndexes();
    JSON.stringify(LINES);
  `,
      { model }
    )
  );
}

test('every UML relationship is visible regardless of interface names or selection', () => {
  const result = lines(fixture.model);
  assert.equal(result.length, fixture.model.RELS.length);
  const realization = result.find((line) => line.r.k === 'real');
  assert.equal(realization.src, 'Resource');
  assert.equal(realization.tgt, 'Identifiable');
});

test('whole-part connections preserve the standard diamond end and multiplicities', () => {
  const result = lines(fixture.model);
  const composition = result.find((line) => line.r.k === 'comp');
  assert.equal(composition.src, 'CollectionEntry');
  assert.equal(composition.tgt, 'Collection');
  assert.equal(composition.ms, '0..*');
  assert.equal(composition.mt, '1');
});
