/* ---------- highlight ---------- */
function focusSet() {
  if (S.hoverEdge && !S.sel) {
    const l = byId(S.hoverEdge);
    return { edges: new Set([S.hoverEdge]), cards: new Set([l.src, l.tgt]), strong: false };
  }
  const id = S.sel || S.hover;
  if (!id) return null;
  const edges = new Set(),
    cards = new Set([id]);
  LINES.forEach((l) => {
    if (l.src === id || l.tgt === id) {
      edges.add(l.id);
      cards.add(l.src);
      cards.add(l.tgt);
    }
  });
  return { edges, cards, strong: !!S.sel && !connection };
}
function applyHighlight() {
  const f = focusSet();
  Object.entries(wireEls).forEach(([id, g]) => {
    const p = g.firstChild,
      l = byId(id);
    if (!l) return;
    const hi = f && f.edges.has(id),
      dim = f && f.strong && !hi;
    p.classList.toggle('hi', !!hi);
    p.classList.toggle('dim', !!dim);
    const suffix = hi ? '-h' : '';
    const association = l.r.k === 'assoc',
      nav = l.r.nav === undefined ? 'b' : l.r.nav;
    const end = association
      ? nav === 'b' || nav === 'both'
        ? `url(#ma${suffix})`
        : 'none'
      : `url(#${mk(l.r.k, suffix)})`;
    setAttr(p, 'marker-end', end);
    setAttr(
      p,
      'marker-start',
      association && (nav === 'a' || nav === 'both') ? `url(#ma${suffix})` : 'none'
    );
  });
  ENT.forEach((e) => {
    const el = cardEl[e.id];
    el.classList.toggle('dim', !!f && f.strong && !f.cards.has(e.id));
    el.classList.toggle('sel', S.sel === e.id);
    el.classList.toggle('match', !!S.q && matches(e, S.q));
    el.querySelectorAll('.cr').forEach((r) => r.classList.remove('hot'));
  });
  if (f) {
    f.edges.forEach((id) => {
      const l = byId(id);
      if (!l) return;
      const fk = fkField(l);
      if (fk) {
        const r = cardEl[fk.card].querySelector(`.cr[data-f="${CSS.escape(fk.field)}"]`);
        if (r) r.classList.add('hot');
      }
    });
  }
  drawLabels(f);
}
function fkField(l) {
  const e = ENTBY[l.r.a],
    t = l.r.b;
  const f = e.f.find((f) => f.k.split(' ').includes('FK:' + t));
  return f ? { card: l.r.a, field: f.n } : null;
}
function drawLabels(f) {
  if (drag) {
    if (labelsEl.childNodes.length) labelsEl.replaceChildren();
    return;
  }
  if (!f && !S.labels) {
    labelsEl.innerHTML = '';
    return;
  }
  let h = '';
  (S.labels ? new Set(visibleWireIds()) : f.edges).forEach((id) => {
    const l = byId(id),
      p = getPts(id);
    if (!p || p.length < 2) return;
    const end = (a, b, m, role) => {
      if (!m && !role) return '';
      const ux = Math.sign(b.x - a.x),
        uy = Math.sign(b.y - a.y);
      const x = a.x + ux * 20 + (uy ? 12 : 0),
        y = a.y + uy * 20;
      const anchor = uy ? 'start' : ux > 0 ? 'start' : 'end';
      return `${role ? `<text class="role" x="${x}" y="${y + (ux ? -17 : uy * 15)}" text-anchor="${anchor}" dominant-baseline="central">${esc(role)}</text>` : ''}${m ? `<text x="${x}" y="${y + (ux ? 16 : 0)}" text-anchor="${anchor}" dominant-baseline="central">${esc(m)}</text>` : ''}`;
    };
    h += end(p[0], p[1], l.ms, l.rs) + end(p[p.length - 1], p[p.length - 2], l.mt, l.rt);
    let bi = 1,
      bl = -1;
    for (let i = 1; i < p.length; i++) {
      const L = Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].y - p[i - 1].y);
      if (L > bl) {
        bl = L;
        bi = i;
      }
    }
    const a = p[bi - 1],
      b = p[bi],
      horiz = Math.abs(a.y - b.y) < 0.5,
      mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    if (l.r.l && l.r.l !== l.rs && l.r.l !== l.rt)
      h += `<text class="role" x="${horiz ? mx : mx + 32}" y="${horiz ? my - (l.rs || l.rt ? 36 : 16) : my}" text-anchor="${horiz ? 'middle' : 'start'}" dominant-baseline="central">${esc(l.r.l)}</text>`;
  });
  labelsEl.innerHTML = h;
}
function matches(e, q) {
  q = q.toLowerCase();
  return e.id.toLowerCase().includes(q) || e.f.some((f) => f.n.toLowerCase().includes(q));
}
