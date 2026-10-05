const assert = require('node:assert/strict');
const {
  readFileSync,
  cpSync,
  mkdtempSync,
  appendFileSync,
  writeFileSync,
  rmSync,
} = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const { test } = require('node:test');
const { build } = require('../scripts/build.cjs');

const root = resolve(__dirname, '..');
const defaults = (html) => {
  const source = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((source) => /const\s+DM\s*=/.test(source));
  return JSON.parse(vm.runInNewContext(source + '\nJSON.stringify({model:DM,layout:LAYOUT})'));
};

test('the standalone build preserves its structured source model and layout', () => {
  build({ check: true });
  const compiled = defaults(readFileSync(join(root, 'model.html'), 'utf8'));
  assert.deepEqual(compiled.model, JSON.parse(readFileSync(join(root, 'src/default-model.json'))));
  assert.deepEqual(
    compiled.layout,
    JSON.parse(readFileSync(join(root, 'src/default-layout.json')))
  );
});

test('source changes require rebuilding and script-shaped model descriptions remain data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-model-build-test-'));
  try {
    for (const name of ['src', 'scripts', 'index.html', 'model.html']) {
      cpSync(join(root, name), join(directory, name), { recursive: true });
    }
    const command = join(directory, 'scripts/build.cjs');
    appendFileSync(join(directory, 'src/model-export.js'), '\n/* source update */\n');
    assert.throws(
      () => execFileSync(process.execPath, [command, '--check'], { stdio: 'pipe' }),
      (error) => /out of date/.test(error.stderr.toString())
    );
    const path = join(directory, 'src/default-model.json');
    const model = JSON.parse(readFileSync(path));
    const description = '</script><script>alert(1)</script>';
    model.ENT[0].desc = description;
    writeFileSync(path, JSON.stringify(model));
    execFileSync(process.execPath, [command]);
    execFileSync(process.execPath, [join(directory, 'scripts/security-policy.cjs')]);
    const html = readFileSync(join(directory, 'model.html'), 'utf8');
    assert.equal(defaults(html).model.ENT[0].desc, description);
    assert.equal([...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].length, 7);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
