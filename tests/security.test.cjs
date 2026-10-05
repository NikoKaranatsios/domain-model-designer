const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { securityPolicy, checkHTML } = require('../scripts/security-policy.cjs');

for (const filename of ['index.html', 'model.html'])
  test(filename + ' permits only its exact scripts and keeps design URLs out of referrers', () => {
    const html = readFileSync(resolve(__dirname, '..', filename), 'utf8');
    assert.equal(checkHTML(html, filename), true);
    const policy = securityPolicy(html);
    assert.ok(policy.includes("default-src 'none'"));
    assert.ok(policy.includes("connect-src 'none'"));
    assert.ok(policy.includes("script-src-attr 'none'"));
    assert.ok(!/script-src[^;]*unsafe-(?:inline|eval)/.test(policy));
    assert.throws(
      () => checkHTML(html.replace(/(<script[^>]*>)/, '$1\n/* changed */'), filename),
      /hashes are out of date/
    );
  });
