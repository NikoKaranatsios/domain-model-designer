// Rebuild routes after changing the fictional example; preserves manual grid placement.
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { Router } = require('../src/orthogonal-router.js');
const root = resolve(__dirname, '..');
const model = JSON.parse(readFileSync(resolve(root, 'src/default-model.json')));
const layoutPath = resolve(root, 'src/default-layout.json');
const layout = JSON.parse(readFileSync(layoutPath));
layout.cardWidth ??= Math.max(280, ...Object.values(layout.nodes).map((n) => n.w || 0));
const context = vm.createContext({});
for (const file of ['model-editor', 'uml-notation'])
  vm.runInContext(readFileSync(resolve(root, 'src/' + file + '.js'), 'utf8'), context);
const { editor, notation } = vm.runInContext(
  '({editor:ModelEditor,notation:UMLNotation})',
  context
);
const positions = new Map(Object.keys(layout.nodes).map((id, i) => [id, layout.cell[i]]));
const used = new Set(positions.values());
for (const e of model.ENT) {
  if (!positions.has(e.id)) {
    let cell = 0;
    while (used.has(cell)) cell++;
    positions.set(e.id, cell);
    used.add(cell);
  }
}
layout.cell = model.ENT.map((e) => positions.get(e.id));
layout.R = Math.max(layout.R, Math.floor(Math.max(...layout.cell) / layout.C) + 1);
layout.nodes = Object.fromEntries(
  model.ENT.map((e) => [e.id, { w: layout.cardWidth, h: editor.height(e, 'keys', model) }])
);
const rowH = Array(layout.R).fill(40);
model.ENT.forEach((e, i) => {
  const r = Math.floor(layout.cell[i] / layout.C);
  rowH[r] = Math.max(rowH[r], layout.nodes[e.id].h);
});
const rowY = [];
let y = 80;
for (const h of rowH) {
  rowY.push(y);
  y += h + layout.gy;
}
const nodes = Object.fromEntries(
  model.ENT.map((e, i) => {
    const n = layout.nodes[e.id],
      cell = layout.cell[i],
      row = Math.floor(cell / layout.C);
    return [
      e.id,
      {
        ...n,
        x: 80 + (cell % layout.C) * (layout.cardWidth + layout.gx),
        y: Math.round(rowY[row] + (rowH[row] - n.h) / 2),
      },
    ];
  })
);
const router = new Router(nodes, layout.ro);
router.routeAll(
  model.RELS.map(notation.line)
    .filter((l) => l.src !== l.tgt)
    .map(({ id, src, tgt }) => ({ id, src, tgt })),
  2
);
layout.routes = Object.fromEntries(Object.entries(router.routes).map(([id, r]) => [id, r.pts]));
if (Object.keys(layout.routes).length !== model.RELS.filter((r) => r.a !== r.b).length)
  throw new Error('Every example connection must have a valid route.');
for (const l of model.RELS.map(notation.line).filter((l) => l.src !== l.tgt))
  if (!notation.routeFits(l, layout.routes[l.id], nodes))
    throw new Error('Invalid example route: ' + l.id);
layout.version = 'events-example-2';
writeFileSync(layoutPath, JSON.stringify(layout, null, 2) + '\n');
console.log(
  'Updated example layout: ' +
    model.ENT.length +
    ' classes, ' +
    Object.keys(layout.routes).length +
    ' routes.'
);
