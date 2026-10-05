const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = readFileSync(resolve(__dirname, '../FCP Domain Model.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const defaults = JSON.parse(vm.runInNewContext(`${scripts.find(s => /const\s+DM\s*=/.test(s))}\nJSON.stringify({model:DM,layout:LAYOUT})`));
const preview = vm.runInNewContext(`${scripts.find(s => /const\s+WirePreview\s*=/.test(s))}\nWirePreview`);
const clone = value => JSON.parse(JSON.stringify(value));
const origin = { x: 0, y: 0 };
const moved = (dx, dy) => ({ x: dx, y: dy });

test('all model connections follow either dragged endpoint and remain orthogonal', () => {
  for (const [id, original] of Object.entries(defaults.layout.routes)) {
    const saved = clone(original);
    assert.deepEqual(clone(preview.reanchor(original, origin, origin, origin, origin)), original);
    for (const [dx, dy] of [[1, 1], [180, 90], [-180, -90], [720, -420], [-720, 420]]) {
      for (const sourceMoves of [true, false]) {
        const points = clone(preview.reanchor(original, origin, origin, sourceMoves ? moved(dx, dy) : origin, sourceMoves ? origin : moved(dx, dy)));
        const start = original[0], end = original.at(-1);
        assert.deepEqual(points[0], { x: start.x + (sourceMoves ? dx : 0), y: start.y + (sourceMoves ? dy : 0) }, id);
        assert.deepEqual(points.at(-1), { x: end.x + (sourceMoves ? 0 : dx), y: end.y + (sourceMoves ? 0 : dy) }, id);
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i];
          assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), id);
          assert.ok((a.x === b.x) !== (a.y === b.y), `${id}: diagonal or zero-length segment`);
        }
        const first = points[1], last = points.at(-2);
        assert.ok((first.x - points[0].x) * (original[1].x - start.x) + (first.y - points[0].y) * (original[1].y - start.y) > 0, `${id}: reversed source port`);
        assert.ok((last.x - points.at(-1).x) * (original.at(-2).x - end.x) + (last.y - points.at(-1).y) * (original.at(-2).y - end.y) > 0, `${id}: reversed target port`);
      }
    }
    assert.deepEqual(original, saved, `${id}: original shared route was mutated`);
  }
});

test('drag previews return to their original routes without accumulating path changes', () => {
  for (const original of Object.values(defaults.layout.routes)) {
    const expected = clone(preview.reanchor(original, origin, origin, moved(160, 75), origin));
    for (let frame = 0; frame < 20; frame++) preview.reanchor(original, origin, origin, moved(frame * 25, frame * -12), origin);
    assert.deepEqual(clone(preview.reanchor(original, origin, origin, moved(160, 75), origin)), expected);
    assert.deepEqual(clone(preview.reanchor(original, origin, origin, origin, origin)), original);
  }
});

test('redrawing drag frames retains SVG markers and paths and leaves unrelated connections untouched', () => {
  let created = 0, rootReplacements = 0;
  class SVGElement {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = new Map(); this.dataset = {}; this.writes = 0; created++; }
    get firstChild() { return this.children[0]; }
    get lastChild() { return this.children.at(-1); }
    append(...elements) { for (const el of elements) { el.parent = this; this.children.push(el); } }
    appendChild(el) { this.append(el); }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, value); this.writes++; }
    set innerHTML(value) { rootReplacements++; this.children = []; this.append(new SVGElement('defs')); }
  }
  const wiresEl = new SVGElement('svg');
  const relations = defaults.model.RELS.filter(r => r.a !== 'Subject' && r.b !== 'Subject' && r.a !== r.b).map(r => ({ id: `e${r.i}`, r, src: r.k === 'comp' ? r.b : r.a, tgt: r.k === 'comp' ? r.a : r.b }));
  const routes = clone(defaults.layout.routes);
  const environment = {
    wiresEl, DEFS: '<defs/>', NS: 'svg', ROUTED: relations, LOOPS: [], VIRT: [], LINES: relations, virtRoutes: {}, drag: { hops: {} },
    document: { createElementNS: (ns, tag) => new SVGElement(tag) }, shown: () => true,
    getPts: id => routes[id], pathD: points => JSON.stringify(points), applyHighlight: () => {},
  };
  const renderer = html.slice(html.search(/const\s+wireEls\s*=\s*\{\}/), html.indexOf('/* ---------- highlight ---------- */'));
  const { drawWires, wireEls } = vm.runInNewContext(`${renderer}\n({drawWires,wireEls})`, environment);
  drawWires();
  const defs = wiresEl.firstChild, initialCreated = created;
  const elements = Object.fromEntries(Object.entries(wireEls).map(([id, group]) => [id, { group, line: group.firstChild, hit: group.lastChild, writes: group.firstChild.writes }]));
  const affected = relations.filter(l => l.src === 'DocumentLink' || l.tgt === 'DocumentLink');
  assert.ok(affected.length > 0);
  for (let frame = 1; frame <= 60; frame++) {
    for (const l of affected) routes[l.id] = preview.reanchor(defaults.layout.routes[l.id], origin, origin, l.src === 'DocumentLink' ? moved(frame * 3, frame) : origin, l.tgt === 'DocumentLink' ? moved(frame * 3, frame) : origin);
    drawWires();
  }
  assert.equal(rootReplacements, 1, 'marker definitions were replaced during dragging');
  assert.equal(created, initialCreated, 'drag frames recreated SVG elements');
  assert.equal(wiresEl.firstChild, defs);
  for (const [id, before] of Object.entries(elements)) {
    assert.equal(wireEls[id], before.group);
    assert.equal(wireEls[id].firstChild, before.line);
    assert.equal(wireEls[id].lastChild, before.hit);
    if (!affected.some(l => l.id === id)) assert.equal(before.line.writes, before.writes, `${id}: unrelated path was rewritten`);
    else assert.ok(before.line.writes > before.writes, `${id}: moved connection did not update`);
  }
});

test('every embedded script parses', () => {
  for (const script of scripts) new vm.Script(script);
});
