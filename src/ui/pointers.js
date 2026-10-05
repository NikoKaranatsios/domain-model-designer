/* ---------- pointer: pan, select, drag with collision push ---------- */
const pointers = new Map();
let gesture = null;
const toWorld = (x, y) => ({ x: (x - S.tx) / S.z, y: (y - S.ty) / S.z });
stage.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 && ev.pointerType === 'mouse') return;
  const port = ev.target.closest('[data-connect-from]');
  if (port) {
    ev.preventDefault();
    if (connection) cancelConnection();
    if (startConnection(port.dataset.connectFrom)) {
      connection.dragging = true;
      connection.pointerId = ev.pointerId;
      stage.setPointerCapture(ev.pointerId);
    }
    return;
  }
  if (connection && ev.target.closest('.card')) {
    ev.preventDefault();
    connectionClick(ev.target.closest('.card').dataset.id);
    return;
  }
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  stage.setPointerCapture(ev.pointerId);
  if (pointers.size === 2) {
    cancelCardDrag();
    stage.classList.remove('panning');
    const [a, b] = [...pointers.values()];
    gesture = {
      type: 'pinch',
      d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      z: S.z,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
    return;
  }
  const card = ev.target.closest('.card'),
    hit = ev.target.closest('#wires g[data-e]');
  if (card) {
    const id = card.dataset.id,
      n = nodes[id];
    gesture = { type: 'card', id, sx: ev.clientX, sy: ev.clientY, ox: n.x, oy: n.y, moved: false };
  } else
    gesture = {
      type: 'pan',
      sx: ev.clientX,
      sy: ev.clientY,
      tx: S.tx,
      ty: S.ty,
      moved: false,
      edge: hit ? hit.dataset.e : null,
    };
});
stage.addEventListener('pointermove', (ev) => {
  connectionPreview(ev);
  if (!pointers.has(ev.pointerId)) {
    hoverAt(ev);
    return;
  }
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!gesture) return;
  if (gesture.type === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((gesture.z * d) / gesture.d / S.z, gesture.cx, gesture.cy);
    return;
  }
  const dx = ev.clientX - gesture.sx,
    dy = ev.clientY - gesture.sy;
  if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
  if (!gesture.moved) {
    gesture.moved = true;
    if (gesture.type === 'card') startDrag(gesture.id);
    else stage.classList.add('panning');
  }
  if (gesture.type === 'pan') {
    S.auto = false;
    S.tx = gesture.tx + dx;
    S.ty = gesture.ty + dy;
    apply();
  } else if (gesture.type === 'card')
    dragTo(gesture.id, gesture.ox + dx / S.z, gesture.oy + dy / S.z);
});
function endPointer(ev) {
  if (ev.type === 'pointercancel' || ev.type === 'lostpointercapture') {
    if (connection?.dragging && connection.pointerId === ev.pointerId) cancelConnection();
    if (pointers.has(ev.pointerId)) {
      cancelCardDrag();
      pointers.clear();
      gesture = null;
      stage.classList.remove('panning');
    }
    return;
  }
  if (connection?.dragging && connection.pointerId === ev.pointerId) {
    const card = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.card');
    connection.dragging = false;
    if (card && card.dataset.id !== connection.source) connectionClick(card.dataset.id);
    return;
  }
  pointers.delete(ev.pointerId);
  if (!gesture) return;
  const g = gesture;
  if (g.type === 'pinch') {
    if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      gesture = { type: 'pan', sx: p.x, sy: p.y, tx: S.tx, ty: S.ty, moved: true };
      stage.classList.add('panning');
    } else if (pointers.size === 0) gesture = null;
    return;
  }
  gesture = null;
  stage.classList.remove('panning');
  if (g.type === 'card') {
    if (g.moved) endDrag(g.id);
    else select(g.id === S.sel ? null : g.id);
  } else if (!g.moved) {
    if (g.edge) {
      const l = byId(g.edge);
      showRelationshipEditor(l.r.i);
    } else select(null);
  }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('lostpointercapture', endPointer);
window.addEventListener('blur', () => {
  cancelCardDrag();
  pointers.clear();
  gesture = null;
  stage.classList.remove('panning');
  if (connection?.dragging) cancelConnection();
});
function hoverAt(ev) {
  const card = ev.target.closest && ev.target.closest('.card'),
    hit = ev.target.closest && ev.target.closest('#wires g[data-e]');
  const h = card ? card.dataset.id : null,
    he = !card && hit ? hit.dataset.e : null;
  if (h !== S.hover || he !== S.hoverEdge) {
    S.hover = h;
    S.hoverEdge = he;
    applyHighlight();
  }
}
stage.addEventListener('pointerleave', () => {
  if (S.hover || S.hoverEdge) {
    S.hover = null;
    S.hoverEdge = null;
    applyHighlight();
  }
});

let drag = null;
function startDrag(id) {
  dragSnapshot = designSnapshot();
  cancelAnimationFrame(anim);
  cardEl[id].classList.add('drag');
  const before = Object.fromEntries(Object.entries(nodes).map(([key, n]) => [key, { ...n }]));
  const hops = hopsFor(visibleWireIds());
  [...ROUTED, ...LOOPS, ...VIRT].forEach((l) => {
    if (l.src === id || l.tgt === id) hops[l.id] = [];
  });
  drag = {
    id,
    before,
    routes: { ...routes },
    virtual: { ...virtRoutes },
    hops,
    raf: 0,
    target: null,
  };
  drawWires();
}
function dragTo(id, x, y) {
  const n = nodes[id];
  n.x = Math.round(x);
  n.y = Math.round(y);
  cardEl[id].style.transform = `translate(${n.x}px,${n.y}px)`;
  const target = cellAt(n.x + n.w / 2, n.y + n.h / 2);
  if (!drag.target || target.c !== drag.target.c || target.r !== drag.target.r) drawZones(target);
  drag.target = target;
  if (!drag.raf) drag.raf = requestAnimationFrame(liveRoute);
}
function liveRoute() {
  if (!drag) return;
  drag.raf = 0;
  [...ROUTED, ...VIRT].forEach((l) => {
    if (l.src !== drag.id && l.tgt !== drag.id) return;
    const original = (l.virt ? drag.virtual : drag.routes)[l.id];
    if (!original) return;
    const points = WirePreview.reanchor(
      original,
      drag.before[l.src],
      drag.before[l.tgt],
      nodes[l.src],
      nodes[l.tgt]
    );
    (l.virt ? virtRoutes : routes)[l.id] = points;
  });
  drawWires();
}
function cancelCardDrag() {
  if (!drag) return;
  const active = drag,
    before = dragSnapshot;
  cancelAnimationFrame(active.raf);
  cardEl[active.id]?.classList.remove('drag');
  drag = null;
  dragSnapshot = null;
  if (before) {
    GR.C = before.layout.C;
    GR.R = before.layout.R;
    GR.cell = Object.fromEntries(ENT.map((e, i) => [e.id, before.layout.cell[i]]));
  }
  routes = active.routes;
  virtRoutes = active.virtual;
  place();
  placeCards();
  drawZones();
  drawWires();
  queueURLUpdate();
}
function endDrag(id) {
  cardEl[id].classList.remove('drag');
  const t = drag && drag.target;
  if (drag) cancelAnimationFrame(drag.raf);
  if (t) {
    if (t.c >= GR.C || t.r >= GR.R) {
      const C2 = Math.max(GR.C, t.c + 1),
        R2 = Math.max(GR.R, t.r + 1);
      ENT.forEach((e) => {
        const k = GR.cell[e.id];
        GR.cell[e.id] = ((k / GR.C) | 0) * C2 + (k % GR.C);
      });
      GR.C = C2;
      GR.R = R2;
    }
    const k = t.r * GR.C + t.c,
      old = GR.cell[id],
      other = ENT.find((e) => e.id !== id && GR.cell[e.id] === k);
    GR.cell[id] = k;
    if (other) GR.cell[other.id] = old;
  }
  place();
  try {
    const candidate = designSnapshot();
    candidate.layout.routes = {};
    DesignURL.validate(candidate);
  } catch (error) {
    cancelCardDrag();
    notice(error.message);
    return;
  }
  drag = null;
  placeCards();
  drawZones();
  routeAll();
  routeVirtual();
  drawWires();
  if (dragSnapshot) {
    if (
      JSON.stringify(dragSnapshot.layout.cell) !== JSON.stringify(ENT.map((e) => GR.cell[e.id])) ||
      dragSnapshot.layout.C !== GR.C ||
      dragSnapshot.layout.R !== GR.R
    )
      remember(dragSnapshot);
    dragSnapshot = null;
  }
  if (S.auto) fit(false);
  queueURLUpdate();
}
