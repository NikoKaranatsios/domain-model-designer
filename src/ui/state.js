'use strict';
const $ = (s) => document.querySelector(s);
let opened = { model: DM, layout: LAYOUT },
  loadError = null;
const incoming = DesignURL.token(location.href);
if (incoming !== null) {
  try {
    opened = await DesignURL.decode(incoming);
  } catch (error) {
    loadError = error;
  }
}
let MODEL = JSON.parse(JSON.stringify(opened.model)),
  BASE = JSON.parse(JSON.stringify(opened.layout));
let { CTX, ENT, ENUMS, ENUMNOTES, TYPES, PRIMS, RELS } = MODEL;
const NS = 'http://www.w3.org/2000/svg';
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
let CTXBY,
  ENTBY,
  RO = BASE.ro,
  LINES,
  ROUTED,
  LOOPS;
function rebuildIndexes() {
  CTXBY = Object.fromEntries(CTX.map((c) => [c.id, c]));
  ENTBY = Object.fromEntries(ENT.map((e) => [e.id, e]));
  LINES = RELS.map((r) => {
    const comp = r.k === 'comp' || r.k === 'agg';
    return {
      id: 'e' + r.i,
      r,
      src: comp ? r.b : r.a,
      tgt: comp ? r.a : r.b,
      ms: comp ? r.m2 : r.m1,
      mt: comp ? r.m1 : r.m2,
      rs: comp ? r.role2 : r.role1,
      rt: comp ? r.role1 : r.role2,
    };
  });
  ROUTED = LINES.filter((l) => l.src !== l.tgt);
  LOOPS = LINES.filter((l) => l.src === l.tgt);
}
rebuildIndexes();

/* ---------- state ---------- */
const nodes = {}; // id -> {x,y,w,h}
let SIZE = BASE.nodes,
  CARD_WIDTH = ENT.length ? Math.max(...ENT.map((e) => SIZE[e.id].w)) : BASE.cardWidth || 280;
const GR = { C: BASE.C, R: BASE.R, gx: BASE.gx, gy: BASE.gy, cell: {}, rowY: [], rowH: [] };
ENT.forEach((e) => (nodes[e.id] = { x: 0, y: 0, w: SIZE[e.id].w, h: SIZE[e.id].h }));
function loadCells() {
  GR.C = BASE.C;
  GR.R = BASE.R;
  GR.cell = Object.fromEntries(ENT.map((e, i) => [e.id, BASE.cell[i]]));
}
function place() {
  // must match the offline layout: uniform columns, rows as tall as their tallest card
  const rowH = new Array(GR.R).fill(0);
  ENT.forEach((e) => {
    const r = (GR.cell[e.id] / GR.C) | 0;
    rowH[r] = Math.max(rowH[r], SIZE[e.id].h);
  });
  const rowY = [];
  let y = 80;
  for (let r = 0; r < GR.R; r++) {
    rowY.push(y);
    y += (rowH[r] || 40) + GR.gy;
  }
  ENT.forEach((e) => {
    const k = GR.cell[e.id],
      c = k % GR.C,
      r = (k / GR.C) | 0,
      n = nodes[e.id];
    n.x = 80 + c * (CARD_WIDTH + GR.gx) + (CARD_WIDTH - n.w) / 2;
    n.y = Math.round(rowY[r] + (rowH[r] - SIZE[e.id].h) / 2);
  });
  GR.rowY = rowY;
  GR.rowH = rowH.map((h) => h || 40);
}
function cellAt(px, py) {
  const pitch = CARD_WIDTH + GR.gx;
  let c = Math.round((px - 80 - CARD_WIDTH / 2) / pitch);
  c = Math.max(0, Math.min(GR.C, 31, c));
  let r = GR.R;
  for (let i = 0; i < GR.R; i++) {
    if (py < GR.rowY[i] + GR.rowH[i] + GR.gy / 2) {
      r = i;
      break;
    }
  }
  return { c, r: Math.min(31, r) };
}
function cellRect(c, r) {
  return {
    x: 80 + c * (CARD_WIDTH + GR.gx) - GR.gx / 2,
    y: (r < GR.R ? GR.rowY[r] : GR.rowY[GR.R - 1] + GR.rowH[GR.R - 1] + GR.gy) - GR.gy / 2,
    w: CARD_WIDTH + GR.gx,
    h: (r < GR.R ? GR.rowH[r] : 120) + GR.gy,
  };
}
let routes = {}; // id -> pts
const view = opened.view || { hidden: [], selected: null, search: '', camera: { fit: true } };
const S = {
  z: 1,
  tx: 0,
  ty: 0,
  sel: view.selected,
  hover: null,
  hoverEdge: null,
  off: new Set(view.hidden),
  q: view.search,
  auto: view.camera.fit,
  attributes: view.attributes || 'keys',
  labels: view.labels === true,
};
