/* ---------- view transform ---------- */
const stage = $('#stage'),
  world = $('#world');
function apply() {
  world.style.transform = `translate(${S.tx}px,${S.ty}px) scale(${S.z})`;
  $('#pct').textContent = Math.round(S.z * 100) + '%';
  queueURLUpdate();
}
function bbox() {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  ENT.forEach((e) => {
    if (S.off.has(e.ctx)) return;
    const n = nodes[e.id];
    x0 = Math.min(x0, n.x - 40);
    y0 = Math.min(y0, n.y - 40);
    x1 = Math.max(x1, n.x + n.w + 40);
    y1 = Math.max(y1, n.y + n.h + 40);
  });
  return x0 > x1 ? null : { x0, y0, x1, y1 };
}
function fit(animate) {
  const b = bbox();
  if (!b) return;
  const vw = stage.clientWidth - (!panel.hidden && stage.clientWidth > 820 ? panel.offsetWidth : 0),
    vh = stage.clientHeight,
    top = Math.max(70, $('#edit-tools').getBoundingClientRect().bottom + 16),
    bot = 64;
  const z = Math.min(
    1.4,
    Math.max(0.04, Math.min((vw - 32) / (b.x1 - b.x0), (vh - top - bot) / (b.y1 - b.y0)))
  );
  const tx = (vw - (b.x1 - b.x0) * z) / 2 - b.x0 * z,
    ty = top + (vh - top - bot - (b.y1 - b.y0) * z) / 2 - b.y0 * z;
  animateTo(z, tx, ty, animate);
}
let anim = 0;
function animateTo(z, tx, ty, animate) {
  cancelAnimationFrame(anim);
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    S.z = z;
    S.tx = tx;
    S.ty = ty;
    apply();
    return;
  }
  const z0 = S.z,
    x0 = S.tx,
    y0 = S.ty,
    t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 260),
      e = 1 - Math.pow(1 - k, 3);
    S.z = z0 + (z - z0) * e;
    S.tx = x0 + (tx - x0) * e;
    S.ty = y0 + (ty - y0) * e;
    apply();
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function zoomAt(f, cx, cy) {
  S.auto = false;
  const z = Math.min(2.5, Math.max(0.04, S.z * f));
  const wx = (cx - S.tx) / S.z,
    wy = (cy - S.ty) / S.z;
  S.z = z;
  S.tx = cx - wx * z;
  S.ty = cy - wy * z;
  apply();
}
function centerOn(id) {
  S.auto = false;
  const n = nodes[id],
    vw = stage.clientWidth,
    vh = stage.clientHeight,
    pw = S.sel && !$('#panel').hidden && vw > 820 ? 420 : 0;
  const z = Math.max(S.z, 0.7);
  animateTo(z, (vw - pw) / 2 - (n.x + n.w / 2) * z, vh / 2 - (n.y + n.h / 2) * z, true);
}
stage.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey || Math.abs(ev.deltaY) >= Math.abs(ev.deltaX)) {
      zoomAt(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.012 : 0.0018)), ev.clientX, ev.clientY);
    } else {
      S.tx -= ev.deltaX;
      apply();
    }
  },
  { passive: false }
);
$('#zi').onclick = () => zoomAt(1.25, stage.clientWidth / 2, stage.clientHeight / 2);
$('#zo').onclick = () => zoomAt(1 / 1.25, stage.clientWidth / 2, stage.clientHeight / 2);
$('#zf').onclick = () => {
  S.auto = true;
  fit(true);
  queueURLUpdate();
};
$('#zr').onclick = () => {
  const before = designSnapshot();
  loadCells();
  place();
  routeAll();
  placeCards();
  drawZones();
  drawWires();
  S.auto = true;
  fit(true);
  if (
    JSON.stringify(before.layout.cell) !== JSON.stringify(ENT.map((e) => GR.cell[e.id])) ||
    before.layout.C !== GR.C ||
    before.layout.R !== GR.R
  )
    remember(before);
  queueURLUpdate();
};
