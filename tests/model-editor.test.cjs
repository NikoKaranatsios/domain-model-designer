const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = readFileSync(resolve(__dirname, '../model.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const context = vm.createContext({
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  CompressionStream,
  DecompressionStream,
  Blob,
  Response,
  btoa,
  atob,
});
vm.runInContext(
  scripts.find((s) => /const\s+DM\s*=/.test(s)),
  context
);
vm.runInContext(
  scripts.find((s) => /const\s+DesignURL\s*=/.test(s)),
  context
);
vm.runInContext(
  scripts.find((s) => /const\s+ModelEditor\s*=/.test(s)),
  context
);
const config = JSON.parse(JSON.stringify(require('./fixtures/model.cjs')));
const editor = vm.runInContext('ModelEditor', context);
const codec = vm.runInContext('DesignURL', context);
const clone = (value) => JSON.parse(JSON.stringify(value));
const apply = (c, action) => clone(editor.apply(c, action));
const field = (n, k = '') => ({ n, t: 'UUID', m: '1', k, note: '' });
const addClass = (c, id, f = [], extra = {}) =>
  apply(c, { type: 'class', data: { id, ctx: c.model.CTX[0].id, desc: '', f, ...extra } });
const relation = (c, a, b, k = 'assoc', extra = {}) =>
  apply(c, {
    type: 'relationship',
    data: { a, b, k, l: '', m1: '1', m2: '0..*', nav: 'none', ...extra },
  });

test('equivalent custom multiplicities normalize and composition keeps valid singleton bounds', () => {
  assert.equal(editor.multiplicity('0001..0001'), '1');
  assert.equal(editor.multiplicity('00..05'), '0..5');
  assert.equal(editor.wholeMultiplicity('0..0'), '0');
  assert.equal(editor.wholeMultiplicity('0..01'), '0..1');
  assert.equal(editor.wholeMultiplicity('1..1'), '1');
  assert.throws(() => editor.wholeMultiplicity('1..2'), /at most one/);
  const c = relation(config, 'Collection', 'BaseRecord', 'comp', { m1: '1..1', nav: 'both' });
  assert.equal(c.model.RELS.at(-1).m1, '1');
  assert.equal(c.model.RELS.at(-1).nav, 'both');
});

test('view filtering clears hidden selections and supports valid imported control ranges', () => {
  const input = clone(config);
  input.view.selected = 'BaseRecord';
  const c = apply(input, {
    type: 'view',
    width: 224,
    gx: 130,
    gy: 110,
    attributes: 'keys',
    labels: true,
    hidden: ['records', 'records'],
  });
  assert.deepEqual(c.view.hidden, ['records']);
  assert.equal(c.view.selected, null);
  assert.equal(input.view.selected, 'BaseRecord');
  assert.throws(
    () =>
      apply(input, {
        type: 'view',
        width: 224,
        gx: 130,
        gy: 110,
        attributes: 'keys',
        labels: true,
        hidden: ['missing'],
      }),
    /valid domain areas/
  );
  const empty = apply(config, { type: 'new-model' }),
    wide = apply(empty, {
      type: 'view',
      width: 900,
      gx: 700,
      gy: 700,
      attributes: 'all',
      labels: true,
    });
  assert.equal(wide.layout.nodes.NewClass.w, 900);
  assert.equal(wide.layout.gx, 700);
});

test('creating classes assigns distinct cells and survives a shared-link round trip', async () => {
  const c = addClass(config, 'Workspace', [
    field('workspace_id', 'PK'),
    { n: 'label', t: 'String', m: '0..1', k: '', note: 'Müller & family <notes>' },
  ]);
  assert.equal(c.model.ENT.length, config.model.ENT.length + 1);
  assert.equal(new Set(c.layout.cell).size, c.layout.cell.length);
  assert.equal(c.view.selected, 'Workspace');
  assert.deepEqual(clone(await codec.decode(await codec.encode(c))), c);
  assert.equal(
    config.model.ENT.some((e) => e.id === 'Workspace'),
    false,
    'commands must not mutate their inputs'
  );
});

test('class renames update inheritance, connection endpoints, foreign keys, and attribute types', () => {
  let c = addClass(config, 'Parent', [field('parent_id', 'PK')]);
  c = addClass(c, 'Child', [
    field('parent_id', 'FK:Parent'),
    { n: 'parent', t: 'Parent', m: '0..1', k: '', note: '' },
  ]);
  c = relation(c, 'Child', 'Parent', 'gen');
  const parent = c.model.ENT.find((e) => e.id === 'Parent');
  c = apply(c, { type: 'class', id: 'Parent', data: { ...parent, id: 'BaseClass' } });
  const child = c.model.ENT.find((e) => e.id === 'Child');
  assert.equal(child.ext, 'BaseClass');
  assert.equal(child.f[0].k, 'FK:BaseClass');
  assert.equal(child.f[1].t, 'BaseClass');
  assert.equal(c.model.RELS.at(-1).b, 'BaseClass');
  assert.equal(c.layout.nodes.Parent, undefined);
  assert.ok(c.layout.nodes.BaseClass);
});

test('attribute edits, ordering, deletion, and key constraints remain in the model', () => {
  let c = addClass(config, 'Workspace', [
    field('workspace_id', 'PK'),
    field('owner_id', 'FK:Collection'),
  ]);
  const e = c.model.ENT.at(-1);
  c = apply(c, {
    type: 'class',
    id: e.id,
    data: {
      ...e,
      f: [{ ...e.f[1], m: '0..1', note: 'Optional owner' }],
      uk: ['(owner_id)'],
      checks: ['owner_id is valid'],
    },
  });
  assert.equal(c.model.ENT.at(-1).f.length, 1);
  assert.equal(c.model.ENT.at(-1).f[0].n, 'owner_id');
  assert.equal(c.model.ENT.at(-1).f[0].m, '0..1');
  assert.deepEqual(c.model.ENT.at(-1).uk, ['(owner_id)']);
});

test('data relationships preserve roles, multiplicities, and UML navigation', async () => {
  let c = addClass(config, 'Workspace');
  c = relation(c, 'Workspace', 'Collection', 'assoc', {
    l: 'belongs to',
    role1: 'workspaces',
    role2: 'owner',
    m1: '*',
    m2: '1',
    nav: 'b',
  });
  const r = c.model.RELS.at(-1);
  assert.equal(r.m1, '0..*');
  assert.equal(r.m2, '1');
  assert.equal(r.nav, 'b');
  assert.equal(r.role1, 'workspaces');
  assert.equal(r.role2, 'owner');
  assert.deepEqual(clone(await codec.decode(await codec.encode(c))).model.RELS.at(-1), r);
  c = apply(c, { type: 'delete-relationship', id: r.i });
  assert.equal(
    c.model.RELS.some((other) => other.i === r.i),
    false
  );
});

test('invalid cardinalities and inheritance cycles are rejected; recursive composition types are valid', () => {
  assert.throws(() => editor.multiplicity('3..1'), /upper bound/);
  assert.throws(() => editor.multiplicity('many'), /UML multiplicity/);
  let c = addClass(config, 'A');
  c = addClass(c, 'B');
  c = relation(c, 'A', 'B', 'gen');
  assert.throws(() => relation(c, 'A', 'B', 'gen', { l: 'another name' }), /already exists/);
  assert.throws(() => relation(c, 'B', 'A', 'gen'), /cycle/);
  assert.throws(() => relation(c, 'A', 'A', 'gen'), /itself/);
  assert.throws(() => relation(c, 'A', 'B', 'comp', { m1: '0..*' }), /at most one/);
  c = relation(c, 'A', 'B', 'comp');
  c = relation(c, 'B', 'A', 'comp', { m1: '0..1' });
  c = relation(c, 'A', 'A', 'comp', { m1: '0..1', role1: 'parent', role2: 'children' });
  assert.equal(c.model.RELS.at(-1).a, c.model.RELS.at(-1).b);
  assert.throws(() => relation(c, 'A', 'B', 'dep'), /data-model/);
});

test('deleting a class removes its connections, inheritance, and foreign-key references', () => {
  let c = addClass(config, 'Parent', [field('parent_id', 'PK')]);
  c = addClass(c, 'Child', [field('parent_id', 'PK FK:Parent')]);
  c = relation(c, 'Child', 'Parent', 'gen');
  c = apply(c, { type: 'delete-class', id: 'Parent' });
  const child = c.model.ENT.at(-1);
  assert.equal(child.ext, undefined);
  assert.equal(child.f[0].k, 'PK');
  assert.equal(
    c.model.RELS.some((r) => r.a === 'Parent' || r.b === 'Parent'),
    false
  );
  assert.equal(c.layout.cell.length, c.model.ENT.length);
});

test('duplicate identifiers and unsafe type deletion leave the original snapshot intact', () => {
  assert.throws(() => addClass(config, 'Collection'), /already exists/);
  assert.throws(() => addClass(config, '__proto__'), /class name/);
  assert.throws(() => addClass(config, 'Workspace', [field('id'), field('id')]), /unique/);
  let c = addClass(config, 'Referenced');
  c = addClass(c, 'Referencing', [{ n: 'value', t: 'Referenced', m: '1', k: '', note: '' }]);
  const before = JSON.stringify(c);
  assert.throws(() => apply(c, { type: 'delete-class', id: 'Referenced' }), /attribute type/);
  assert.equal(JSON.stringify(c), before);
});

test('view settings, enumerations, and a fresh model round-trip without relying on defaults', async () => {
  let c = apply(config, {
    type: 'view',
    width: 300,
    gx: 120,
    gy: 80,
    attributes: 'all',
    labels: true,
  });
  c = apply(c, {
    type: 'enum',
    name: 'WorkspaceState',
    values: ['active', 'closed'],
    note: 'Allowed workspace states',
  });
  assert.ok(c.model.ENT.every((e) => c.layout.nodes[e.id].w === 300));
  assert.deepEqual(clone(await codec.decode(await codec.encode(c))), c);
  c = apply(c, { type: 'new-model' });
  assert.equal(c.model.ENT.length, 1);
  assert.equal(c.model.RELS.length, 0);
  assert.equal(c.view.attributes, 'all');
  assert.deepEqual(clone(await codec.decode(await codec.encode(c))), c);
});

test('a full grid expands and an empty model can be shared and populated again', async () => {
  let c = apply(config, { type: 'new-model' });
  c.layout.C = 1;
  c.layout.R = 1;
  c = addClass(c, 'Second');
  assert.equal(c.layout.R, 2);
  assert.deepEqual(c.layout.cell, [0, 1]);
  c = apply(c, { type: 'delete-class', id: 'Second' });
  c = apply(c, { type: 'delete-class', id: 'NewClass' });
  assert.deepEqual(c.model.ENT, []);
  assert.deepEqual(c.layout.cell, []);
  assert.deepEqual(c.layout.nodes, {});
  assert.equal(c.view.selected, null);
  assert.equal(c.layout.cardWidth, 280);
  assert.deepEqual(clone(await codec.decode(await codec.encode(c))), c);
  c = addClass(c, 'First');
  assert.deepEqual(c.layout.cell, [0]);
  assert.equal(c.layout.nodes.First.w, 280);
});

test('delete everything clears the full design atomically and can be repopulated or restored', async () => {
  const input = clone(config);
  input.model.PRIMS.push(['PrivatePrimitive', 'Custom type to remove.']);
  input.view.selected = 'BaseRecord';
  input.view.search = 'Record';
  input.view.hidden = ['files'];
  const before = JSON.stringify(input),
    cleared = apply(input, { type: 'clear-model' });
  assert.equal(JSON.stringify(input), before, 'the undo snapshot stays intact');
  assert.deepEqual(cleared.model.ENT, []);
  assert.deepEqual(cleared.model.RELS, []);
  assert.deepEqual(cleared.model.ENUMS, {});
  assert.deepEqual(cleared.model.ENUMNOTES, {});
  assert.deepEqual(cleared.model.TYPES, []);
  assert.deepEqual(cleared.model.CTX, [{ id: 'model', name: 'Domain model', desc: '' }]);
  assert.equal(
    cleared.model.PRIMS.some(([name]) => name === 'PrivatePrimitive'),
    false
  );
  assert.deepEqual(cleared.layout.nodes, {});
  assert.deepEqual(cleared.layout.routes, {});
  assert.deepEqual(cleared.layout.cell, []);
  assert.equal(cleared.view.selected, null);
  assert.equal(cleared.view.search, '');
  assert.deepEqual(cleared.view.hidden, []);
  assert.deepEqual(clone(await codec.decode(await codec.encode(cleared))), cleared);
  const populated = addClass(cleared, 'FirstClass', [field('id', 'PK')]);
  assert.equal(populated.model.ENT.length, 1);
  assert.deepEqual(populated.layout.cell, [0]);
  assert.deepEqual(clone(editor.apply(cleared, { type: 'import-design', config: input })), input);
});

test('typing a domain area creates it once and reuses it regardless of case', async () => {
  let c = apply(config, {
    type: 'class',
    data: { id: 'Workspace', areaName: 'Müller & partners', desc: '', f: [] },
  });
  const area = c.model.CTX.at(-1);
  assert.equal(area.id, 'muller_partners');
  assert.equal(area.name, 'Müller & partners');
  assert.match(area.color, /^#[0-9A-F]{6}$/i);
  c = apply(c, {
    type: 'class',
    data: { id: 'WorkspaceItem', areaName: 'MÜLLER & PARTNERS', desc: '', f: [] },
  });
  assert.equal(c.model.CTX.length, config.model.CTX.length + 1);
  assert.equal(c.model.ENT.at(-1).ctx, area.id);
  c = apply(c, { type: 'area', name: 'Muller partners', description: '', color: '#386C97' });
  assert.equal(c.model.CTX.at(-1).id, 'muller_partners_2');
  c = apply(c, { type: 'area', name: '客户', description: '', color: '#386C97' });
  assert.equal(c.model.CTX.at(-1).id, 'area');
  assert.deepEqual(clone(await codec.decode(await codec.encode(c))), c);
});

test('area renames preserve identifiers and deletion moves classes and updates hidden areas', () => {
  let c = addClass(config, 'Workspace');
  const id = c.model.ENT.at(-1).ctx;
  c = apply(c, { type: 'area', id, name: 'People', description: 'All people', color: '#123456' });
  assert.equal(c.model.ENT.at(-1).ctx, id);
  assert.equal(c.model.CTX.find((area) => area.id === id).name, 'People');
  c.view.selected = null;
  c.view.hidden = [id, 'collections'];
  c = apply(c, { type: 'delete-area', id, moveTo: 'collections' });
  assert.equal(
    c.model.CTX.some((area) => area.id === id),
    false
  );
  assert.ok(
    c.model.ENT.filter((e) => e.id === 'Workspace' || e.id === 'BaseRecord').every(
      (e) => e.ctx === 'collections'
    )
  );
  assert.deepEqual(c.view.hidden, []);
  assert.throws(
    () => apply(c, { type: 'area', name: 'RESOURCES', description: '', color: '#123456' }),
    /already exists/
  );
  assert.throws(
    () => apply(c, { type: 'area', name: 'Other', description: '', color: 'red' }),
    /color/
  );
  c = apply(c, { type: 'new-model' });
  assert.throws(
    () => apply(c, { type: 'delete-area', id: 'model', moveTo: 'model' }),
    /at least one/
  );
});

test('confirmed class deletion cleans typed attributes, constraints, value types, and foreign keys', () => {
  let c = addClass(config, 'Referenced');
  c = addClass(
    c,
    'Referencing',
    [
      { n: 'value', t: 'Referenced', m: '1', k: '', note: '' },
      field('reference_id', 'FK:Referenced'),
      field('id', 'PK'),
    ],
    { uk: ['(value, id)', '(id)'], checks: ['value is valid', 'id > 0'] }
  );
  c.model.TYPES.push({
    n: 'ReferenceValue',
    d: '',
    f: [
      { n: 'value', t: 'Referenced', m: '1', k: '', note: '' },
      field('reference_id', 'FK:Referenced'),
    ],
  });
  c = apply(c, { type: 'delete-class', id: 'Referenced', removeReferences: true });
  const e = c.model.ENT.at(-1);
  assert.deepEqual(
    e.f.map((f) => f.n),
    ['reference_id', 'id']
  );
  assert.equal(e.f[0].k, '');
  assert.deepEqual(e.uk, ['(id)']);
  assert.deepEqual(e.checks, ['id > 0']);
  assert.equal(c.model.TYPES.at(-1).f.length, 1);
  assert.equal(c.model.TYPES.at(-1).f[0].k, '');
});

test('shared models reject arbitrary multiplicities and malformed type definitions', () => {
  for (const invalid of ['many', '-1', '5..2', '1000001', '1..1000001']) {
    const c = clone(config);
    c.model.ENT[0].f[0].m = invalid;
    assert.throws(() => codec.validate(c), /multiplicity/);
    c.model.ENT[0].f[0].m = '1';
    c.model.RELS[10].m2 = invalid;
    assert.throws(() => codec.validate(c), /multiplicity/);
  }
  const c = clone(config);
  c.model.TYPES[0].f[0].m = 'many';
  assert.throws(() => codec.validate(c), /value-type attribute/);
  assert.throws(() => addClass(config, 'String'), /another data type/);
  assert.throws(
    () => apply(config, { type: 'enum', name: 'FileResource', values: ['one'], note: '' }),
    /another data type/
  );
});

test('import validates before replacement and creates an independent recoverable snapshot', () => {
  const c = apply(config, { type: 'new-model' });
  const imported = apply(c, { type: 'import-design', config });
  assert.deepEqual(imported, config);
  assert.equal(c.model.ENT.length, 1);
  imported.model.ENT[0].desc = 'Changed after import';
  assert.notEqual(imported.model.ENT[0].desc, config.model.ENT[0].desc);
  const invalid = clone(config);
  invalid.layout.cell[0] = invalid.layout.cell[1];
  assert.throws(() => apply(c, { type: 'import-design', config: invalid }), /positions/);
  const cycle = clone(config);
  cycle.model.RELS.push({
    i: 89,
    a: 'BaseRecord',
    b: 'TextRecord',
    k: 'gen',
    l: '',
    m1: '',
    m2: '',
  });
  assert.throws(() => apply(c, { type: 'import-design', config: cycle }), /cycle/);
  assert.equal(c.model.ENT.length, 1);
});
