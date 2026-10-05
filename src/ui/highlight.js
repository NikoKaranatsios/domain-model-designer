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
    const markers = UMLNotation.markers(l.r);
    setAttr(p, 'marker-end', markers.end ? `url(#${markers.end}${suffix})` : 'none');
    setAttr(p, 'marker-start', markers.start ? `url(#${markers.start}${suffix})` : 'none');
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
  const annotations = UMLLabels.create(visibleNodes());
  (S.labels ? new Set(visibleWireIds()) : f.edges).forEach((id) => {
    const l = byId(id),
      p = getPts(id);
    if (!p || p.length < 2) return;
    const end = (a, b, m, role) => {
      if (!m && !role) return '';
      const ux = Math.sign(b.x - a.x),
        uy = Math.sign(b.y - a.y);
      const offset = (l.r.k === 'comp' || l.r.k === 'agg') && a === p.at(-1) ? 40 : 20;
      const w = Math.max((role || '').length * 8, (m || '').length * 7) + 8,
        height = role && m ? 32 : 18;
      const box = annotations.place(
        {
          x: uy ? a.x + 12 : ux > 0 ? a.x + offset : a.x - offset - w,
          y: uy ? (uy > 0 ? a.y + offset : a.y - offset - height) : a.y - height - 8,
          w,
          h: height,
        },
        40
      );
      if (!box) return '';
      const x = box.x + 4,
        y = box.y + 8;
      return `${role ? `<text class="role" x="${x}" y="${y}" dominant-baseline="central">${esc(role)}</text>` : ''}${m ? `<text x="${x}" y="${y + (role ? 16 : 0)}" dominant-baseline="central">${esc(m)}</text>` : ''}`;
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
    if (l.r.l && l.r.l !== l.rs && l.r.l !== l.rt) {
      const w = l.r.l.length * 8 + 8;
      const box = annotations.place({
        x: horiz ? mx - w / 2 : mx + 32,
        y: horiz ? my - 30 : my - 9,
        w,
        h: 18,
      });
      if (box)
        h += `<text class="role" x="${box.x + 4}" y="${box.y + 8}" dominant-baseline="central">${esc(l.r.l)}</text>`;
    }
  });
  labelsEl.innerHTML = h;
}
function matches(e, q) {
  q = q.toLowerCase();
  return e.id.toLowerCase().includes(q) || e.f.some((f) => f.n.toLowerCase().includes(q));
}
