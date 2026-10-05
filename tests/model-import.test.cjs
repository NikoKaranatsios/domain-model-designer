const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
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
for (const file of ['design-url', 'model-editor', 'model-analysis', 'model-export', 'model-import'])
  vm.runInContext(readFileSync(`${__dirname}/../src/${file}.js`, 'utf8'), context);
const { importer, exporter, codec, editor } = vm.runInContext(
  '({importer:ModelImport,exporter:ModelExport,codec:DesignURL,editor:ModelEditor})',
  context
);
const clone = (v) => JSON.parse(JSON.stringify(v));
const fixture = require('./fixtures/model.cjs');
const imported = (g) => clone(importer.read(clone(g)));
const graph = (c) => clone(exporter.readable(c));
const example = {
  model: JSON.parse(readFileSync(`${__dirname}/../src/default-model.json`)),
  layout: JSON.parse(readFileSync(`${__dirname}/../src/default-layout.json`)),
};
const small = () => ({
  format: 'uml-data-model',
  formatVersion: '1.0.0',
  name: 'Small model',
  classes: [
    {
      id: 'Team',
      primaryKey: ['team_id'],
      attributes: [
        { name: 'team_id', type: 'UUID' },
        { name: 'name', type: 'String' },
      ],
    },
    { id: 'Member', attributes: [{ name: 'team_id', type: 'UUID', references: ['Team'] }] },
  ],
  relationships: [
    {
      kind: 'association',
      name: 'members',
      from: { classId: 'Team', multiplicity: '1' },
      to: { classId: 'Member', multiplicity: { lowerBound: 0, upperBound: null } },
    },
  ],
});

test('Model JSON import preserves the complete events graph and shared-link round trips', async () => {
  const source = graph(example),
    c = imported(source);
  assert.deepEqual(graph(c), source);
  assert.equal(c.model.ENT.length, 28);
  assert.equal(new Set(c.layout.cell).size, 28);
  assert.equal(c.view.camera.fit, true);
  assert.deepEqual(clone(await codec.decode(await codec.encode(c))), c);
});

test('import reconstructs own, included and inherited attributes without duplicating them', () => {
  const before = graph(fixture),
    c = imported(before);
  assert.deepEqual(graph(c), before);
  assert.equal(
    c.model.ENT.find((e) => e.id === 'Collection').f.length,
    fixture.model.ENT.find((e) => e.id === 'Collection').f.length
  );
  assert.deepEqual(c.model.ENT.find((e) => e.id === 'Collection').includes, ['RecordMetadata']);
  const after = imported(graph(c));
  assert.deepEqual(graph(after), before, 'repeated imports must not expand derived fields again');
});

test('JSON uploads and paste accept backups, native models, BOM and simple model graphs', () => {
  const backup = clone(codec.validate(fixture));
  assert.deepEqual(clone(importer.parse('\uFEFF' + JSON.stringify(backup))), backup);
  assert.deepEqual(imported(example.model).model, example.model);
  const minimal = small(),
    c = imported(minimal);
  assert.equal(c.model.ENT[0].f[0].k, 'PK');
  assert.equal(c.model.RELS[0].m2, '0..*');
  assert.equal(c.model.RELS[0].nav, 'none');
  assert.equal(c.model.ENT[0].ctx, 'model');
  assert.deepEqual(clone(importer.parse(JSON.stringify(c))), c);
  assert.deepEqual(imported({ name: 'Empty', classes: [] }).model.ENT, []);
  assert.equal(JSON.stringify(minimal).includes('layout'), false, 'inputs stay independent');
});

test('inheritance declared on classes is displayed even without explicit relationship rows', () => {
  const c = imported({
    classes: [
      { id: 'Base', attributes: [{ name: 'id', type: 'UUID', isIdentifier: true }] },
      { id: 'Child', superclasses: ['Base'] },
    ],
  });
  assert.equal(c.model.RELS[0].k, 'gen');
  assert.equal(graph(c).classes[1].inheritedAttributes[0].name, 'id');
});

test('all UML kinds retain endpoints, navigation, roles and unspecified multiplicities', () => {
  let c = clone(
    editor.apply(fixture, {
      type: 'relationship',
      data: {
        a: 'TextRecord',
        b: 'ImageRecord',
        k: 'assoc',
        l: 'peers',
        m1: '1',
        m2: '0..*',
        nav: 'both',
        role1: 'source',
        role2: 'destination',
      },
    })
  );
  c.model.RELS.at(-1).m1 = '';
  c.model.RELS.at(-1).m2 = '';
  const g = graph(c);
  assert.deepEqual(graph(imported(g)), g);
  const bad = clone(g);
  bad.relationships.find((r) => r.kind === 'composition').wholeClassId = 'Unknown';
  assert.throws(() => imported(bad), /conflicts/);
});

test('invalid JSON, unknown formats, unsafe names and inconsistent bounds fail before replacement', () => {
  assert.throws(() => importer.parse('{broken'), /not valid JSON/);
  assert.throws(() => importer.parse(' '), /Choose a JSON/);
  assert.throws(() => imported([]), /JSON object/);
  assert.throws(() => imported({ records: [{}] }), /classes array/);
  assert.throws(() => imported({ ...small(), formatVersion: '2.0.0' }), /version/);
  let bad = small();
  bad.classes[0].id = '__proto__';
  assert.throws(() => imported(bad), /element/);
  bad = small();
  bad.classes[1].attributes[0].references = ['Missing'];
  assert.throws(() => imported(bad), /reference/);
  bad = small();
  bad.relationships[0].to.multiplicity = { notation: '0..*', lowerBound: 1, upperBound: null };
  assert.throws(() => imported(bad), /conflicts/);
  bad = small();
  bad.classes[0].primaryKey = ['unknown'];
  assert.throws(() => imported(bad), /primaryKey/);
  bad = small();
  bad.enumerations = [
    { name: 'State', values: ['one'] },
    { name: 'State', values: ['two'] },
  ];
  assert.throws(() => imported(bad), /duplicate/);
  bad = small();
  bad.classes[0].attributes[0].isIdentifier = 'false';
  assert.throws(() => imported(bad), /true or false/);
  assert.throws(() => importer.parse(' '.repeat(2 * 1024 * 1024) + '{}'), /too large/);
  assert.throws(
    () => imported({ classes: Array.from({ length: 257 }, (_, i) => ({ id: 'Class' + i })) }),
    /256/
  );
});

test('hostile descriptions stay data, missing references and cycles are rejected atomically', () => {
  const malicious = small();
  malicious.classes[0].description = '</script><img src=x onerror=alert(1)>';
  const c = imported(malicious);
  assert.equal(c.model.ENT[0].desc, malicious.classes[0].description);
  const before = JSON.stringify(fixture),
    bad = small();
  bad.relationships[0].to.classId = 'Missing';
  assert.throws(
    () => editor.apply(fixture, { type: 'import-design', config: importer.read(bad) }),
    /connection/
  );
  assert.equal(JSON.stringify(fixture), before);
  assert.throws(
    () =>
      imported({
        classes: [
          { id: 'A', superclasses: ['B'] },
          { id: 'B', superclasses: ['A'] },
        ],
      }),
    /cycle/
  );
});

test('class inheritance metadata must agree with explicit relationship rows', () => {
  assert.throws(
    () =>
      imported({
        classes: [{ id: 'A', superclasses: ['B'] }, { id: 'B' }, { id: 'C' }],
        relationships: [{ kind: 'generalization', from: { classId: 'A' }, to: { classId: 'C' } }],
      }),
    /conflicts/
  );
  assert.throws(
    () =>
      imported({
        classes: [{ id: 'A', superclasses: 'B' }, { id: 'B' }],
        relationships: [{ kind: 'generalization', from: { classId: 'A' }, to: { classId: 'B' } }],
      }),
    /must be an array/
  );
});

test('events schema defines every type and FK edge, separates buyers and holders, and prevents duplicate admission', () => {
  const g = graph(example),
    m = example.model;
  assert.deepEqual(g.unresolvedTypes, []);
  assert.ok(m.ENT.every((e) => e.f.some((f) => f.k.split(' ').includes('PK'))));
  for (const e of m.ENT)
    for (const f of e.f)
      for (const key of f.k.split(' '))
        if (key.startsWith('FK:')) {
          const parent = key.slice(3);
          assert.ok(
            m.RELS.some((r) => r.a === parent && r.b === e.id && r.m1 === f.m),
            `${e.id}.${f.n} needs its matching association`
          );
        }
  assert.equal(
    m.ENT.find((e) => e.id === 'CheckIn').f.find((f) => f.n === 'ticket_id').k,
    'UK FK:Ticket'
  );
  assert.ok(
    m.ENT.find((e) => e.id === 'Order').f.some((f) => f.n === 'buyer_account_id' && f.m === '0..1')
  );
  assert.ok(
    m.ENT.find((e) => e.id === 'Ticket').f.some((f) => f.n === 'attendee_id' && f.m === '0..1')
  );
  assert.ok(
    m.ENT.find((e) => e.id === 'TicketType').checks.some((rule) =>
      rule.includes('unexpired reservations')
    )
  );
  assert.equal(Object.keys(example.layout.routes).length, m.RELS.length);
});
