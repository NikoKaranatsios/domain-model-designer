const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const context = vm.createContext({ TextEncoder });
for (const file of [
  'design-url',
  'model-editor',
  'model-analysis',
  'model-export',
  'model-import',
  'uml-notation',
  'uml-labels',
])
  vm.runInContext(readFileSync(`${__dirname}/../src/${file}.js`, 'utf8'), context);
const { codec, editor, exporter, importer, notation, labels } = vm.runInContext(
  '({codec:DesignURL,editor:ModelEditor,exporter:ModelExport,importer:ModelImport,notation:UMLNotation,labels:UMLLabels})',
  context
);
const clone = (v) => JSON.parse(JSON.stringify(v));
const base = require('./fixtures/model.cjs');
const graph = (c) => clone(exporter.readable(c));
const report = (c) => graph(c).validation;
const add = (c, id, f = [], st = '') =>
  clone(editor.apply(c, { type: 'class', data: { id, ctx: c.model.CTX[0].id, desc: '', f, st } }));
const f = (n, t = 'String', m = '1', k = '') => ({ n, t, m, k, note: '' });
const link = (c, a, b, k = 'assoc', extra = {}) =>
  clone(
    editor.apply(c, {
      type: 'relationship',
      data: { a, b, k, l: '', m1: '1', m2: '0..*', nav: 'none', ...extra },
    })
  );

for (const kind of ['assoc', 'agg', 'comp'])
  for (const nav of ['none', 'a', 'b', 'both'])
    test(`${kind} navigation ${nav} adorns the correct model end independently of routing`, () => {
      const r = {
        i: 0,
        a: 'Whole',
        b: 'Part',
        k: kind,
        m1: '0..1',
        m2: '0..*',
        role1: 'owner',
        role2: 'parts',
        nav,
      };
      const l = notation.line(r),
        markers = clone(notation.markers(r));
      const navigable = new Set(
        nav === 'both' ? ['Whole', 'Part'] : nav === 'a' ? ['Whole'] : nav === 'b' ? ['Part'] : []
      );
      assert.equal(markers.start === 'ma', navigable.has(l.src));
      if (kind === 'assoc') assert.equal(markers.end === 'ma', navigable.has(l.tgt));
      else {
        assert.equal(l.tgt, 'Whole');
        assert.equal(markers.end.startsWith(kind === 'comp' ? 'md' : 'mg'), true);
        assert.equal(markers.end.endsWith('-nav'), navigable.has('Whole'));
        assert.equal(l.ms, '0..*');
        assert.equal(l.mt, '0..1');
      }
    });

test('legacy navigation defaults and generalization, realization, dependency markers remain explicit', () => {
  assert.deepEqual(clone(notation.markers({ k: 'assoc' })), { start: null, end: 'ma' });
  for (const k of ['gen', 'real']) assert.equal(notation.markers({ k }).end, 'mt');
  assert.equal(notation.markers({ k: 'dep' }).end, 'ma');
});

test('interface generalization is supported, while class/interface generalization and interface realization sources are invalid', () => {
  let c = add(base, 'SpecificInterface', [], 'interface');
  c = link(c, 'SpecificInterface', 'Identifiable', 'gen');
  assert.deepEqual(graph(c).classes.find((e) => e.id === 'SpecificInterface').superclasses, [
    'Identifiable',
  ]);
  assert.throws(() => link(c, 'BaseRecord', 'Identifiable', 'gen'), /Generalization/);
  const bad = clone(c);
  bad.model.RELS.find((r) => r.k === 'real').a = 'SpecificInterface';
  assert.throws(() => codec.validate(bad), /Realization/);
  const duplicate = clone(c);
  duplicate.model.RELS.push({ ...duplicate.model.RELS.at(-1), i: 909 });
  assert.throws(() => codec.validate(duplicate), /Duplicate generalization/);
});

test('legacy parent metadata compiles into a visible and editable relationship without mutating input', () => {
  const c = clone(base);
  c.model.RELS = c.model.RELS.filter((r) => r.k !== 'gen');
  c.layout.routes = {};
  const before = JSON.stringify(c),
    normalized = clone(editor.normalize(c));
  assert.ok(
    normalized.model.RELS.some((r) => r.k === 'gen' && r.a === 'FileResource' && r.b === 'Resource')
  );
  assert.equal(JSON.stringify(c), before);
  assert.deepEqual(graph(normalized), graph(c));
  assert.deepEqual(clone(importer.read(c)), normalized);
});

test('blank association multiplicities survive editing, omitted JSON bounds are never invented, and nonassociation bounds are rejected', () => {
  const c = link(base, 'Collection', 'Selection', 'assoc', {
    m1: '',
    m2: '',
    role1: 'owner',
    nav: 'none',
  });
  assert.equal(c.model.RELS.at(-1).m1, '');
  assert.equal(c.model.RELS.at(-1).m2, '');
  const imported = importer.read({
    classes: [{ id: 'A' }, { id: 'B' }],
    relationships: [{ kind: 'association', from: { classId: 'A' }, to: { classId: 'B' } }],
  });
  assert.equal(imported.model.RELS[0].m2, '');
  assert.ok(report(imported).issues.some((i) => i.code === 'unspecified-multiplicity'));
  assert.throws(
    () =>
      importer.read({
        classes: [{ id: 'A' }, { id: 'B' }],
        relationships: [
          {
            kind: 'generalization',
            from: { classId: 'A', multiplicity: '1' },
            to: { classId: 'B' },
          },
        ],
      }),
    /Only associations/
  );
});

test('contradictory or duplicate identifier declarations fail rather than changing primary keys', () => {
  for (const [primaryKey, isIdentifier] of [
    [['id'], false],
    [[], true],
    [['id', 'id'], true],
  ])
    assert.throws(
      () =>
        importer.read({
          classes: [
            { id: 'A', primaryKey, attributes: [{ name: 'id', type: 'UUID', isIdentifier }] },
          ],
        }),
      /primaryKey/
    );
});

test('undefined types, incompatible inherited redefinitions, and included collisions produce actionable export findings', () => {
  let c = add(base, 'Parent', [f('label', 'String', '0..1')]);
  c = add(c, 'Child', [f('label', 'UUID', '0..*')]);
  c = link(c, 'Child', 'Parent', 'gen');
  assert.ok(
    report(c).issues.some((i) => i.code === 'incompatible-redefinition' && i.classId === 'Child')
  );
  c.model.ENT.find((e) => e.id === 'Child').f = [f('label', 'String', '1')];
  assert.equal(
    report(c).issues.some((i) => i.code === 'incompatible-redefinition'),
    false
  );
  c.model.ENT.find((e) => e.id === 'Child').f.push(f('missing', 'Undeclared'));
  assert.ok(report(c).issues.some((i) => i.code === 'undefined-type'));
  c.model.TYPES.push({ n: 'OtherMetadata', d: '', f: [f('data_source')] });
  c.model.ENT.find((e) => e.id === 'Resource').includes.push('OtherMetadata');
  assert.ok(report(c).issues.some((i) => i.code === 'included-name-collision'));
  assert.ok(exporter.brief(c).includes('## Model checks'));
});

test('relational key conventions are checked separately from UML properties', () => {
  const c = clone(base);
  c.model.ENT.find((e) => e.id === 'AttachmentLink').f[0].t = 'String';
  assert.ok(report(c).issues.some((i) => i.code === 'foreign-key-type'));
  c.model.ENT[0].f[0].m = '0..1';
  assert.ok(
    report(c).issues.some((i) => i.code === 'relational-identifier' && i.severity === 'warning')
  );
  c.model.ENT.find((e) => e.id === 'AttachmentLink').f[0].k = 'FK:CollectionEntry';
  assert.ok(report(c).issues.some((i) => i.code === 'composite-reference'));
});

test('composition ownership across associations is reviewed without banning recursive class schemas', () => {
  let c = add(base, 'Folder');
  c = link(c, 'Folder', 'Folder', 'comp', { m1: '0..1', role1: 'parent', role2: 'children' });
  c = link(c, 'Collection', 'Folder', 'comp', { m1: '0..1' });
  assert.ok(
    report(c).issues.some((i) => i.code === 'exclusive-composition' && i.classId === 'Folder')
  );
});

test('unsupported UML modifiers are rejected before they can change meaning on import', () => {
  assert.throws(
    () =>
      importer.read({
        classes: [{ id: 'A', attributes: [{ name: 'names', type: 'String', isOrdered: true }] }],
      }),
    /isOrdered.*not supported/
  );
  assert.throws(
    () =>
      importer.read({
        classes: [{ id: 'A' }, { id: 'B' }],
        relationships: [
          { kind: 'association', from: { classId: 'A' }, to: { classId: 'B', isNavigable: false } },
        ],
      }),
    /isNavigable.*not supported/
  );
});

test('association-to-reference mismatches and mandatory recursive parents are review findings', () => {
  const c = clone(base);
  c.model.RELS.find((r) => r.a === 'AttachmentLink' && r.b === 'Attachment').m2 = '0..1';
  assert.ok(
    report(c).issues.some(
      (i) => i.code === 'reference-multiplicity' && i.classId === 'AttachmentLink'
    )
  );
  let folders = add(base, 'Folder');
  folders = link(folders, 'Folder', 'Folder', 'comp');
  assert.ok(report(folders).issues.some((i) => i.code === 'mandatory-recursive-owner'));
});

test('compiled fields and card heights account for value types and disclose omitted attributes within bounds', () => {
  const e = base.model.ENT.find((e) => e.id === 'Attachment');
  assert.equal(editor.fields(e, base.model).filter((f) => f.n === 'created_at').length, 1);
  assert.equal(editor.fields(e, base.model).length, 4);
  const many = { id: 'Many', f: Array.from({ length: 256 }, (_, i) => f('f' + i)) };
  assert.ok(editor.height(many, 'all', base.model) <= 2400);
  assert.equal(editor.height(many, 'all', base.model), 44 + 128 * 18 + 20);
});

test('saved paths must attach to their actual classes and stay outside every card', () => {
  const nodes = {
    A: { x: 0, y: 0, w: 100, h: 100 },
    B: { x: 300, y: 0, w: 100, h: 100 },
    C: { x: 150, y: 0, w: 100, h: 100 },
  };
  const l = notation.line({ i: 0, a: 'A', b: 'B', k: 'assoc' });
  assert.equal(
    notation.routeFits(
      l,
      [
        { x: 100, y: 50 },
        { x: 300, y: 50 },
      ],
      nodes
    ),
    false,
    'must not cross C'
  );
  const good = [
    { x: 100, y: 50 },
    { x: 120, y: 50 },
    { x: 120, y: 120 },
    { x: 280, y: 120 },
    { x: 280, y: 50 },
    { x: 300, y: 50 },
  ];
  assert.equal(notation.routeFits(l, good, nodes), true);
  assert.equal(
    notation.routeFits(l, [...good].reverse(), nodes),
    false,
    'reversed endpoints change meaning'
  );
  assert.equal(
    notation.routeFits(
      l,
      [
        { x: 50, y: 50 },
        { x: 300, y: 50 },
      ],
      nodes
    ),
    false,
    'cannot attach inside A'
  );
});

test('annotations avoid cards and each other, including across spatial-index boundaries', () => {
  const card = { x: 75, y: 75, w: 100, h: 100 },
    placer = labels.create({ A: card });
  const overlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const placed = [];
  for (let i = 0; i < 8; i++) {
    const box = placer.place({ x: 70, y: 70, w: 90, h: 32 });
    if (!box) continue;
    assert.equal(overlap(card, box), false);
    assert.equal(
      placed.some((b) => overlap(b, box)),
      false
    );
    placed.push(box);
  }
  assert.ok(placed.length >= 4, 'keeps several annotations visible without collisions');
});

test('a crowded annotation has a bounded fallback instead of painting over a card', () => {
  const placer = labels.create({ A: { x: -1000, y: -1000, w: 2000, h: 2000 } });
  assert.equal(placer.place({ x: 0, y: 0, w: 100, h: 32 }), null);
  const endpoint = labels.create({ A: { x: -60, y: -60, w: 120, h: 120 } });
  assert.equal(endpoint.place({ x: 0, y: 0, w: 20, h: 18 }, 40), null);
  assert.ok(endpoint.place({ x: 0, y: 0, w: 20, h: 18 }));
});

test('the complete fictional example has no review findings, all FK bounds and types agree, and financial allocations are explicit', () => {
  const model = JSON.parse(readFileSync(`${__dirname}/../src/default-model.json`));
  const layout = JSON.parse(readFileSync(`${__dirname}/../src/default-layout.json`));
  const c = { model, layout },
    g = graph(c),
    by = new Map(model.ENT.map((e) => [e.id, e]));
  assert.deepEqual(g.validation.issues, []);
  assert.equal(g.classes.length, 28);
  assert.equal(g.relationships.length, 43);
  assert.ok(by.get('OrganizerMember').f.some((f) => f.t === 'MembershipStatus'));
  assert.deepEqual(
    by.get('RefundTicket').f.map((f) => f.k),
    ['PK FK:RefundItem', 'PK FK:Ticket']
  );
  assert.equal(model.RELS.find((r) => r.a === 'Order' && r.b === 'OrderItem').m2, '0..*');
  assert.equal(model.RELS.find((r) => r.a === 'Refund' && r.b === 'RefundItem').m2, '0..*');
  assert.ok(by.get('TicketReservation').f.some((f) => f.n === 'order_item_id'));
  assert.equal(
    by.get('TicketReservation').f.some((f) => f.n === 'order_id' || f.n === 'ticket_type_id'),
    false
  );
  assert.ok(model.ENUMS.RefundKind.includes('unapplied_payment'));
  assert.ok(by.get('Payment').f.some((f) => f.n === 'is_applied' && f.t === 'Boolean'));
  const rowH = Array(layout.R).fill(40),
    rowY = [];
  let y = 80;
  model.ENT.forEach((e, i) => {
    const r = Math.floor(layout.cell[i] / layout.C);
    rowH[r] = Math.max(rowH[r], layout.nodes[e.id].h);
  });
  for (const h of rowH) {
    rowY.push(y);
    y += h + layout.gy;
  }
  const nodes = Object.fromEntries(
    model.ENT.map((e, i) => {
      const n = layout.nodes[e.id],
        cell = layout.cell[i],
        r = Math.floor(cell / layout.C);
      return [
        e.id,
        {
          ...n,
          x: 80 + (cell % layout.C) * (layout.cardWidth + layout.gx),
          y: Math.round(rowY[r] + (rowH[r] - n.h) / 2),
        },
      ];
    })
  );
  for (const r of model.RELS)
    assert.equal(
      notation.routeFits(notation.line(r), layout.routes['e' + r.i], nodes),
      true,
      'e' + r.i + ' must attach correctly and avoid cards'
    );
});

// Interpret the declared end bounds against finite object-link graphs. This checks
// schema cardinality, not execution of the separately documented business rules.
const eventsModel = JSON.parse(readFileSync(`${__dirname}/../src/default-model.json`));
function flowViolations(instances, links) {
  const violations = [];
  const fits = (count, notation) => {
    const [lo, hi] = notation === '*' ? ['0', '*'] : notation.split('..');
    return count >= Number(lo) && (hi === '*' || count <= Number(hi ?? lo));
  };
  for (const r of eventsModel.RELS) {
    const pairs = links[r.i] || [];
    for (const a of instances[r.a] || [])
      if (!fits(pairs.filter(([x]) => x === a).length, r.m2))
        violations.push('e' + r.i + ':' + r.a + ':' + a);
    for (const b of instances[r.b] || [])
      if (!fits(pairs.filter(([, y]) => y === b).length, r.m1))
        violations.push('e' + r.i + ':' + r.b + ':' + b);
  }
  return violations;
}
const pending = () => ({
  instances: {
    Organizer: ['org'],
    Account: ['account'],
    OrganizerMember: ['owner'],
    Order: ['order'],
  },
  links: { 0: [['org', 'owner']], 1: [['account', 'owner']], 17: [['org', 'order']] },
});
const checkout = () => {
  const c = pending();
  Object.assign(c.instances, {
    Event: ['event'],
    EventOccurrence: ['run'],
    TicketType: ['type'],
    OrderItem: ['item'],
  });
  Object.assign(c.links, {
    2: [['org', 'event']],
    3: [['event', 'run']],
    12: [['run', 'type']],
    20: [['order', 'item']],
    21: [['type', 'item']],
  });
  return c;
};
test('events end bounds admit a finite guest checkout with no draft items', () => {
  const c = pending();
  assert.deepEqual(flowViolations(c.instances, c.links), []);
});
test('events end bounds admit repeated historical reservations for the same order item', () => {
  const c = checkout();
  c.instances.TicketReservation = ['old_hold', 'new_hold'];
  c.links[13] = [
    ['item', 'old_hold'],
    ['item', 'new_hold'],
  ];
  assert.deepEqual(flowViolations(c.instances, c.links), []);
});
test('events end bounds admit a partial order refund allocated to one of two issued tickets', () => {
  const c = checkout();
  Object.assign(c.instances, {
    Ticket: ['ticket1', 'ticket2'],
    Payment: ['payment'],
    Refund: ['refund'],
    RefundItem: ['refund_item'],
    RefundTicket: ['allocation'],
  });
  Object.assign(c.links, {
    22: [['order', 'payment']],
    23: [['payment', 'refund']],
    24: [['refund', 'refund_item']],
    25: [['item', 'refund_item']],
    27: [
      ['item', 'ticket1'],
      ['item', 'ticket2'],
    ],
    43: [['refund_item', 'allocation']],
    44: [['ticket1', 'allocation']],
  });
  assert.deepEqual(flowViolations(c.instances, c.links), []);
  c.links[44] = [];
  assert.ok(flowViolations(c.instances, c.links).some((i) => i.startsWith('e44:RefundTicket')));
});
test('events end bounds admit unapplied-payment compensation without fictitious order items or tickets', () => {
  const c = pending();
  Object.assign(c.instances, { Payment: ['late_capture'], Refund: ['compensation'] });
  Object.assign(c.links, {
    22: [['order', 'late_capture']],
    23: [['late_capture', 'compensation']],
  });
  assert.deepEqual(flowViolations(c.instances, c.links), []);
});
