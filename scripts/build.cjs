const { readFileSync, writeFileSync } = require('node:fs');
const { resolve, sep } = require('node:path');
const { securityPolicy, checkHTML } = require('./security-policy.cjs');

const root = resolve(__dirname, '..');
const sourceRoot = resolve(root, 'src');

function readSource(name) {
  const path = resolve(sourceRoot, name);
  if (!path.startsWith(sourceRoot + sep)) throw new Error('Source must stay inside src: ' + name);
  return readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
}

function inlineSources(source, stack = []) {
  return source.replace(/\/\* @source ([^\s*]+) \*\//g, (_, name) => {
    if (stack.includes(name)) throw new Error('Circular source include: ' + name);
    return inlineSources(readSource(name).trim(), [...stack, name]);
  });
}

function dataConstant(identifier, name) {
  // JSON is embedded as script data, so a description cannot close its script tag.
  const value = JSON.stringify(JSON.parse(readSource(name))).replace(/<\//g, '<\\/');
  return 'const ' + identifier + '=' + value + ';';
}

function render(template) {
  let html = inlineSources(readSource(template));
  html = html.replace(
    '/* @defaults */',
    dataConstant('DM', 'default-model.json') + '\n' + dataConstant('LAYOUT', 'default-layout.json')
  );
  html = html.replace('@security-policy', securityPolicy(html));
  if (/\/\* @source|@security-policy|\/\* @defaults/.test(html)) {
    throw new Error('Unresolved source marker in ' + template);
  }
  checkHTML(html, template);
  return html;
}

function build({ check = false } = {}) {
  for (const [template, filename] of [
    ['index.html', 'index.html'],
    ['template.html', 'FCP Domain Model.html'],
  ]) {
    const path = resolve(root, filename);
    const html = render(template);
    if (check) {
      if (readFileSync(path, 'utf8') !== html) {
        throw new Error(filename + ' is out of date. Run node scripts/build.cjs.');
      }
    } else {
      writeFileSync(path, html);
    }
  }
}

module.exports = { build, render };
if (require.main === module) {
  build({ check: process.argv.includes('--check') });
  console.log(
    process.argv.includes('--check') ? 'Generated HTML is current.' : 'Built standalone HTML.'
  );
}
