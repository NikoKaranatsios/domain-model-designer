/* ---------- wires ---------- */
const wiresEl = $('#wires'),
  labelsEl = $('#labels');
const DEFS = `<defs>${[
  ['', 'w'],
  ['-h', 'h'],
]
  .map(
    ([s, c]) => `
  <marker id="ma${s}" class="${c}" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="mk-open" d="M2 2L11 6L2 10"/></marker>
  <marker id="mt${s}" class="${c}" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="15" markerHeight="15" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="mk-hollow" d="M1.5 1.5L13 7L1.5 12.5Z"/></marker>
  <marker id="md${s}" class="${c}" viewBox="0 0 18 10" refX="17" refY="5" markerWidth="18" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="mk-fill" d="M1 5L9 1L17 5L9 9Z"/></marker>
  <marker id="mg${s}" class="${c}" viewBox="0 0 18 10" refX="17" refY="5" markerWidth="18" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="mk-hollow" d="M1 5L9 1L17 5L9 9Z"/></marker>
  ${['md', 'mg'].map((id) => `<marker id="${id}-nav${s}" class="${c}" viewBox="0 0 32 14" refX="31" refY="7" markerWidth="32" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="${id === 'md' ? 'mk-fill' : 'mk-hollow'}" d="M1 7L9 3L17 7L9 11Z"/><path class="mk-open" d="M17 7H31M22 3L31 7L22 11"/></marker>`).join('')}`
  )
  .join('')}</defs>`;
function hopsFor(allIds) {
  const segs = {};
  allIds.forEach((id) => {
    const p = getPts(id);
    if (!p) return;
    segs[id] = [];
    for (let i = 1; i < p.length; i++) segs[id].push([p[i - 1], p[i], i]);
  });
  const hops = {};
  allIds.forEach((id) => (hops[id] = []));
  for (let a = 0; a < allIds.length; a++)
    for (let b = a + 1; b < allIds.length; b++) {
      const A = segs[allIds[a]],
        B = segs[allIds[b]];
      if (!A || !B) continue;
      for (const [p, q, i] of A)
        for (const [r, t, j] of B) {
          const x = OrthoRouter.segIntersect(p, q, r, t);
          if (!x) continue;
          if (Math.abs(p.y - q.y) < 0.5) hops[allIds[a]].push({ seg: i, x: x.x, y: x.y });
          else hops[allIds[b]].push({ seg: j, x: x.x, y: x.y });
        }
    }
  return hops;
}
function getPts(id) {
  if (routes[id]) return routes[id];
  const l = LOOPS.find((x) => x.id === id);
  return l ? loopPts(l.src) : null;
}
function loopPts(id) {
  const n = nodes[id];
  const x = n.x + n.w,
    y = n.y;
  return [
    { x: x - 46, y },
    { x: x - 46, y: y - 22 },
    { x: x + 22, y: y - 22 },
    { x: x + 22, y: y + 24 },
    { x, y: y + 24 },
  ];
}
function pathD(pts, hops) {
  const R = 9,
    H = 5;
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i],
      horiz = Math.abs(a.y - b.y) < 0.5,
      len = horiz ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    const dx = Math.sign(b.x - a.x),
      dy = Math.sign(b.y - a.y);
    const prevLen = i > 1 ? Math.abs(a.x - pts[i - 2].x) + Math.abs(a.y - pts[i - 2].y) : 0;
    const rStart = i > 1 ? Math.min(R, len / 2, prevLen / 2) : 0;
    let rEnd = 0;
    if (i < pts.length - 1) {
      const c = pts[i + 1];
      rEnd = Math.min(R, len / 2, (Math.abs(c.x - b.x) + Math.abs(c.y - b.y)) / 2);
    }
    if (horiz) {
      const hs = hops
        .filter(
          (h) =>
            h.seg === i &&
            Math.abs(h.x - a.x) > rStart + H + 2 &&
            Math.abs(h.x - b.x) > rEnd + H + 2
        )
        .sort((p, q) => dx * (p.x - q.x));
      let last = -Infinity;
      hs.forEach((h) => {
        if (Math.abs(h.x - last) < 2 * H + 2) return;
        last = h.x;
        d += ` L${h.x - dx * H} ${a.y} A${H} ${H} 0 0 ${dx > 0 ? 1 : 0} ${h.x + dx * H} ${a.y}`;
      });
    }
    d += ` L${b.x - dx * rEnd} ${b.y - dy * rEnd}`;
    if (rEnd > 0) {
      const c = pts[i + 1];
      d += ` Q${b.x} ${b.y} ${b.x + Math.sign(c.x - b.x) * rEnd} ${b.y + Math.sign(c.y - b.y) * rEnd}`;
    }
  }
  return d;
}
const wireEls = {};
wiresEl.innerHTML = DEFS;
function visibleWireIds() {
  return [...ROUTED.map((l) => l.id), ...LOOPS.map((l) => l.id)].filter((id) => {
    const l = byId(id);
    return l && shown(l) && getPts(id);
  });
}
function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function drawWires() {
  const ids = visibleWireIds(),
    visible = new Set(ids);
  const hops = drag ? drag.hops : hopsFor(ids);
  for (const [id, g] of Object.entries(wireEls))
    if (!visible.has(id)) {
      g.remove();
      delete wireEls[id];
    }
  ids.forEach((id) => {
    const l = byId(id),
      pts = getPts(id),
      d = pathD(pts, hops[id] || []);
    const dash = l.r.k === 'dep' || l.r.k === 'real';
    let g = wireEls[id];
    if (!g) {
      g = document.createElementNS(NS, 'g');
      g.dataset.e = id;
      const line = document.createElementNS(NS, 'path'),
        hit = document.createElementNS(NS, 'path');
      line.setAttribute('class', `w${dash ? ' dash' : ''}`);
      hit.setAttribute('class', 'hit');
      g.append(line, hit);
      wiresEl.appendChild(g);
      wireEls[id] = g;
    }
    setAttr(g.firstChild, 'd', d);
    setAttr(g.lastChild, 'd', d);
  });
  applyHighlight();
}
function byId(id) {
  return LINES.find((l) => l.id === id);
}
