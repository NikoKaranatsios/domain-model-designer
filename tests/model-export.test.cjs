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
for (const name of ['DM', 'DesignURL', 'ModelEditor', 'ModelExport'])
  vm.runInContext(
    scripts.find((s) => new RegExp('const\\s+' + name + '\\s*=').test(s)),
    context
  );
const config = JSON.parse(JSON.stringify(require('./fixtures/model.cjs')));
const exporter = vm.runInContext('ModelExport', context);
const editor = vm.runInContext('ModelEditor', context);
const codec = vm.runInContext('DesignURL', context);
const clone = (value) => JSON.parse(JSON.stringify(value));
const graph = (c) => JSON.parse(exporter.json(c));
const field = (n, k = '', extra = {}) => ({ n, t: 'String', m: '1', k, note: '', ...extra });
const apply = (c, command) => clone(editor.apply(c, command));
const addClass = (c, id, f = []) =>
  apply(c, { type: 'class', data: { id, ctx: c.model.CTX[0].id, desc: '', f } });
const inherit = (c, a, b) =>
  apply(c, { type: 'relationship', data: { a, b, k: 'gen', l: '', m1: '', m2: '' } });
const emptyModel = () =>
  apply(apply(config, { type: 'new-model' }), { type: 'delete-class', id: 'NewClass' });

test('readable export contains the complete graph with explicit, versioned properties', () => {
  const g = graph(config);
  assert.equal(g.format, 'uml-data-model');
  assert.equal(g.formatVersion, '1.0.0');
  assert.equal(g.classes.length, config.model.ENT.length);
  assert.equal(g.relationships.length, config.model.RELS.length);
  assert.equal(g.domainAreas.length, config.model.CTX.length);
  assert.equal(g.enumerations.length, Object.keys(config.model.ENUMS).length);
  assert.equal(g.valueTypes.length, config.model.TYPES.length);
  assert.equal(g.primitiveTypes.length, config.model.PRIMS.length);
  assert.equal(g.classes.find((c) => c.id === 'BaseRecord').kind, 'abstractClass');
  assert.equal(g.classes.find((c) => c.id === 'Identifiable').kind, 'interface');
  assert.deepEqual(g.classes.find((c) => c.id === 'FileResource').superclasses, ['Resource']);
  assert.deepEqual(g.classes.find((c) => c.id === 'Resource').interfaces, ['Identifiable']);
  assert.equal(g.model, undefined);
  assert.equal(g.ENT, undefined);
  assert.equal(g.layout, undefined);
});

test('attributes expose types, composite keys, references, and numeric UML bounds', () => {
  const g = graph(config),
    member = g.classes.find((c) => c.id === 'CollectionEntry');
  assert.deepEqual(member.primaryKey, ['collection_id', 'resource_id', 'valid_from']);
  assert.deepEqual(member.attributes[0].references, ['Collection']);
  const multiple = g.classes
    .find((c) => c.id === 'Selection')
    .attributes.find((a) => a.name === 'item_ids');
  assert.deepEqual(multiple.multiplicity, { notation: '0..*', lowerBound: 0, upperBound: null });
  const bounded = g.classes
    .find((c) => c.id === 'TextBlock')
    .attributes.find((a) => a.name === 'lines');
  assert.deepEqual(bounded.multiplicity, { notation: '1..4', lowerBound: 1, upperBound: 4 });
  assert.ok(
    g.classes.find((c) => c.id === 'FolderResource').attributes.find((a) => a.name === 'code')
      .isUnique
  );
});

test('included value-type fields are compiled once and retain their origin and references', () => {
  const g = graph(config),
    collection = g.classes.find((c) => c.id === 'Collection');
  assert.deepEqual(collection.includedValueTypes, ['RecordMetadata']);
  assert.equal(
    collection.attributes.find((a) => a.name === 'data_source').source,
    'RecordMetadata'
  );
  assert.deepEqual(collection.attributes.find((a) => a.name === 'source_batch_id').references, [
    'SourceBatch',
  ]);
  const document = g.classes.find((c) => c.id === 'Attachment');
  assert.equal(document.attributes.filter((a) => a.name === 'created_at').length, 1);
  const c = clone(config);
  c.model.ENT.find((e) => e.id === 'Collection').f.push({
    n: 'created_at',
    t: 'DateTime',
    m: '1',
    k: '',
    note: 'Own creation time',
  });
  const created = graph(c)
    .classes.find((e) => e.id === 'Collection')
    .attributes.filter((a) => a.name === 'created_at');
  assert.equal(created.length, 1);
  assert.equal(created[0].source, 'declared');
});

test('relationships preserve endpoint roles and whole, part, subclass, and interface direction', () => {
  const c = clone(config);
  c.model.RELS.push({
    i: 89,
    a: 'Collection',
    b: 'FileResource',
    k: 'agg',
    l: 'members',
    m1: '0..1',
    m2: '2..5',
    role1: 'collection',
    role2: 'members',
    nav: 'both',
  });
  const g = graph(c),
    aggregation = g.relationships.at(-1);
  assert.equal(aggregation.wholeClassId, 'Collection');
  assert.equal(aggregation.partClassId, 'FileResource');
  assert.equal(aggregation.from.role, 'collection');
  assert.equal(aggregation.to.role, 'members');
  assert.deepEqual(aggregation.to.multiplicity, { notation: '2..5', lowerBound: 2, upperBound: 5 });
  assert.equal(aggregation.navigability, 'both');
  for (const r of g.relationships) {
    if (r.kind === 'composition') {
      assert.equal(r.wholeClassId, r.from.classId);
      assert.equal(r.partClassId, r.to.classId);
    }
    if (r.kind === 'generalization') {
      assert.equal(r.subclassId, r.from.classId);
      assert.equal(r.superclassId, r.to.classId);
      assert.equal(r.from.multiplicity, null);
    }
    if (r.kind === 'realization') {
      assert.equal(r.implementingClassId, r.from.classId);
      assert.equal(r.interfaceId, r.to.classId);
    }
  }
  assert.equal(g.relationships.find((r) => r.kind === 'association').navigability, 'fromTo');
});

test('exports preserve descriptions and constraints and are independent of filters and layouts', () => {
  const c = clone(config);
  c.model.title = 'Müller & 客户';
  c.model.ENT[0].desc = 'Text <script> & "quotes"';
  const first = exporter.json(c),
    before = JSON.stringify(c);
  c.view.hidden = c.model.CTX.map((a) => a.id);
  c.view.search = 'nothing';
  c.view.attributes = 'keys';
  assert.equal(exporter.json(c), first);
  assert.equal(exporter.json(c), exporter.json(c));
  const g = graph(c);
  assert.equal(g.name, 'Müller & 客户');
  assert.equal(g.classes[0].description, 'Text <script> & "quotes"');
  assert.deepEqual(
    g.classes.find((e) => e.id === 'ResourceLink').constraints,
    c.model.ENT.find((e) => e.id === 'ResourceLink').checks
  );
  assert.equal(g.enumerations[0].description, config.model.ENUMNOTES[g.enumerations[0].name] || '');
  assert.equal(g.valueTypes[0].attributes[0].description, config.model.TYPES[0].f[0].note);
  c.view = config.view;
  assert.equal(JSON.stringify(c), before, 'export must not mutate the input');
});

test('full-design JSON round-trips exactly and empty models export both formats', async () => {
  const full = JSON.parse(exporter.json(config, 'design'));
  assert.deepEqual(full, config);
  assert.deepEqual(clone(await codec.decode(await codec.encode(full))), config);
  let c = clone(editor.apply(config, { type: 'new-model' }));
  c = clone(editor.apply(c, { type: 'delete-class', id: 'NewClass' }));
  assert.deepEqual(graph(c).classes, []);
  assert.deepEqual(graph(c).relationships, []);
  assert.deepEqual(JSON.parse(exporter.json(c, 'design')), c);
  assert.throws(() => exporter.json(config, 'unknown'), /format/);
});

test('inherited fields resolve recursively with original sources, immediate parents, and identifiers', () => {
  const g = graph(config),
    person = g.classes.find((c) => c.id === 'FileResource'),
    staff = g.classes.find((c) => c.id === 'TextRecord');
  assert.ok(
    person.inheritedAttributes.some(
      (a) =>
        a.name === 'data_source' &&
        a.declaredIn === 'RecordMetadata' &&
        a.inheritedFrom === 'Resource'
    )
  );
  assert.equal(
    person.inheritedAttributes.some((a) => a.name === 'resource_id'),
    false,
    'own fields override inherited names'
  );
  assert.ok(
    staff.inheritedAttributes.some(
      (a) => a.name === 'display_name' && a.declaredIn === 'BaseRecord'
    )
  );
  assert.equal(
    staff.inheritedAttributes.some((a) => a.name === 'record_id'),
    false
  );
  let c = addClass(emptyModel(), 'Root', [field('id', 'PK'), field('root_note')]);
  c = addClass(c, 'Parent');
  c = addClass(c, 'Child');
  c = inherit(inherit(c, 'Parent', 'Root'), 'Child', 'Parent');
  const child = graph(c).classes.find((c) => c.id === 'Child');
  assert.deepEqual(child.primaryKey, ['id']);
  assert.equal(child.inheritedAttributes.find((a) => a.name === 'id').declaredIn, 'Root');
  assert.equal(child.inheritedAttributes.find((a) => a.name === 'id').inheritedFrom, 'Parent');
  c.model.RELS = [];
  assert.equal(
    graph(c).classes.find((c) => c.id === 'Child').inheritedAttributes.length,
    2,
    'legacy ext inheritance still compiles'
  );
});

test('diamond inheritance deduplicates shared origins and exposes conflicting parent definitions', () => {
  let c = addClass(emptyModel(), 'Root', [field('id', 'PK')]);
  c = addClass(c, 'Left', [field('label')]);
  c = addClass(c, 'Right', [field('label', '', { t: 'UUID' })]);
  c = addClass(c, 'Leaf');
  for (const [a, b] of [
    ['Left', 'Root'],
    ['Right', 'Root'],
    ['Leaf', 'Left'],
    ['Leaf', 'Right'],
  ])
    c = inherit(c, a, b);
  const leaf = graph(c).classes.find((c) => c.id === 'Leaf');
  assert.equal(leaf.inheritedAttributes.filter((a) => a.name === 'id').length, 1);
  assert.deepEqual(leaf.inheritanceConflicts, [
    { attributeName: 'label', declaredIn: ['Left', 'Right'] },
  ]);
  assert.deepEqual(
    leaf.inheritedAttributes.filter((a) => a.name === 'label').map((a) => a.type),
    ['String', 'UUID']
  );
  c.model.ENT.find((c) => c.id === 'Leaf').f.push(field('label'));
  assert.deepEqual(graph(c).classes.find((c) => c.id === 'Leaf').inheritanceConflicts, []);
  c.model.ENT.find((c) => c.id === 'Root').ext = 'Leaf';
  assert.throws(() => exporter.brief(c), /Inheritance.*cycle/);
});

test('AI brief preserves all model structures and relationship semantics in a compact document', () => {
  const c = clone(config);
  c.model.RELS.push({
    i: 89,
    a: 'Collection',
    b: 'FileResource',
    k: 'agg',
    l: 'members',
    m1: '0..1',
    m2: '2..5',
    role1: 'collection',
    role2: 'members',
    nav: 'both',
  });
  const brief = exporter.brief(c);
  for (const e of c.model.ENT) assert.ok(brief.includes('### ' + e.id + '\n'));
  for (const r of c.model.RELS) assert.ok(brief.includes('| e' + r.i + ' | '));
  for (const name of Object.keys(c.model.ENUMS)) assert.ok(brief.includes('### ' + name + '\n'));
  for (const t of c.model.TYPES) assert.ok(brief.includes('### ' + t.n + '\n'));
  assert.ok(brief.includes('whole: Collection; part: FileResource; both directions'));
  assert.ok(brief.includes('Collection (role: collection) \\[0..1\\]'));
  assert.ok(brief.includes('subclass → superclass'));
  assert.ok(brief.includes('implementer → interface'));
  assert.ok(brief.includes('RecordMetadata via Resource'));
  assert.ok(brief.includes('FK: SourceBatch'));
  assert.ok(brief.includes('- Constraint: from\\_resource\\_id ≠ to\\_resource\\_id'));
  assert.ok(
    Buffer.byteLength(brief) < Buffer.byteLength(exporter.json(c)) / 2,
    'brief should materially reduce the AI input size'
  );
});

test('AI brief escapes descriptions, preserves Unicode, and names types with missing definitions', () => {
  const c = clone(config);
  c.model.title = 'Müller & 客户';
  c.model.ENT[0].desc = 'A | B <script> **bold**\nSecond line';
  c.model.ENT[0].f[0].note = 'a\\b | `value`';
  c.model.ENT[0].f[0].t = 'MissingType';
  const brief = exporter.brief(c);
  assert.ok(brief.startsWith('# Müller & 客户\n'));
  assert.ok(brief.includes('A \\| B &lt;script&gt; \\*\\*bold\\*\\*<br>Second line'));
  assert.ok(brief.includes('a\\\\b \\| \\`value\\`'));
  assert.ok(!brief.includes('<script>'));
  assert.deepEqual(graph(c).unresolvedTypes, ['MissingType']);
  assert.ok(brief.includes('Types without definitions'));
});

test('export documents provide safe Unicode filenames, content types, and accurate summaries', () => {
  const c = clone(config);
  c.model.title = '../Müller / 客户: model?';
  for (const [format, extension, mime] of [
    ['readable', '.model.json', 'application/json'],
    ['brief', '.ai.md', 'text/markdown'],
    ['design', '.design.json', 'application/json'],
  ]) {
    const doc = exporter.document(c, format);
    assert.equal(doc.filename, 'Müller---客户--model' + extension);
    assert.ok(doc.mimeType.startsWith(mime));
    assert.equal(doc.summary.classes, config.model.ENT.length);
    assert.equal(
      doc.summary.attributes,
      config.model.ENT.reduce((sum, e) => sum + e.f.length, 0)
    );
    assert.equal(doc.summary.relationships, config.model.RELS.length);
    assert.equal(doc.contents, format === 'brief' ? exporter.brief(c) : exporter.json(c, format));
  }
  c.model.title = 'CON';
  assert.equal(exporter.document(c).filename, 'model-CON.model.json');
  c.model.title = '.'.repeat(4);
  assert.equal(exporter.document(c).filename, 'domain-model.model.json');
  c.model.title = 'A'.repeat(79) + '🧩' + 'X';
  assert.equal(exporter.document(c, 'brief').filename, 'A'.repeat(79) + '🧩.ai.md');
  assert.throws(() => exporter.document(c, 'invalid'), /format/);
  const empty = exporter.document(emptyModel(), 'brief');
  assert.equal(empty.summary.classes, 0);
  assert.ok(empty.contents.includes('## Classes'));
});

test('all export formats are deterministic and do not mutate their model or view', () => {
  const c = clone(config),
    before = JSON.stringify(c),
    brief = exporter.brief(c);
  for (const format of ['readable', 'brief', 'design'])
    assert.equal(exporter.document(c, format).contents, exporter.document(c, format).contents);
  assert.equal(JSON.stringify(c), before);
  c.view.hidden = c.model.CTX.map((a) => a.id);
  c.view.attributes = 'keys';
  c.view.search = 'nothing';
  c.layout.gx += 10;
  assert.equal(exporter.brief(c), brief);
});

test('compiled identifiers combine own and inherited key attributes without duplicate overrides', () => {
  let c = addClass(emptyModel(), 'Base', [field('base_id', 'PK')]);
  c = addClass(c, 'Version', [field('version', 'PK')]);
  c = inherit(c, 'Version', 'Base');
  assert.deepEqual(graph(c).classes.find((e) => e.id === 'Version').primaryKey, [
    'version',
    'base_id',
  ]);
});

test('enumerations named like Object members retain an empty description when no note exists', () => {
  const c = clone(config);
  c.model.ENUMS.toString = ['one', 'two'];
  c.model.ENT[0].f[0].t = 'toString';
  const enumeration = graph(c).enumerations.find((e) => e.name === 'toString');
  assert.equal(enumeration.description, '');
  assert.ok(exporter.brief(c).includes('### toString\n\nValues: one, two'));
  assert.ok(!exporter.brief(c).includes('[native code]'));
});

test('large design backups stay within the import size limit and restore exactly', () => {
  let c = emptyModel();
  const fields = Array.from({ length: 256 }, (_, i) =>
    field('field' + i, '', { note: 'x'.repeat(1900) })
  );
  for (let i = 0; i < 4; i++) c = addClass(c, 'Large' + i, fields);
  assert.ok(
    Buffer.byteLength(JSON.stringify(c, null, 2)) > codec.limits.maxBytes,
    'fixture must exceed the import limit when formatted'
  );
  const backup = exporter.document(c, 'design');
  assert.ok(Buffer.byteLength(backup.contents) <= codec.limits.maxBytes);
  assert.deepEqual(clone(codec.validate(JSON.parse(backup.contents))), c);
});
