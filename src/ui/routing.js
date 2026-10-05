/* ---------- routing ---------- */
function visibleNodes() {
  const o = {};
  ENT.forEach((e) => {
    if (!S.off.has(e.ctx)) o[e.id] = nodes[e.id];
  });
  return o;
}
const shown = (l) => !S.off.has(ENTBY[l.src].ctx) && !S.off.has(ENTBY[l.tgt].ctx);
const isDefault = () =>
  GR.C === BASE.C && GR.R === BASE.R && ENT.every((e, i) => GR.cell[e.id] === BASE.cell[i]);
function routeAll() {
  if (isDefault() && ROUTED.every((l) => BASE.routes[l.id])) {
    routes = Object.assign({}, BASE.routes);
    return null;
  }
  const R = new OrthoRouter.Router(nodes, RO);
  R.routeAll(
    ROUTED.map((l) => ({ id: l.id, src: l.src, tgt: l.tgt })),
    2
  );
  routes = {};
  for (const k in R.routes) routes[k] = R.routes[k].pts;
  return R;
}
let virtRoutes = {};
function routeVirtual() {
  virtRoutes = {};
  const want = VIRT.filter(
    (v) =>
      S.sel &&
      (v.src === S.sel || v.tgt === S.sel) &&
      !S.off.has(ENTBY[v.src].ctx) &&
      !S.off.has(ENTBY[v.tgt].ctx)
  );
  if (!want.length) return;
  const R = new OrthoRouter.Router(visibleNodes(), RO);
  for (const k in routes) {
    const pts = routes[k];
    R.mark(fakeRes(R, pts), 1);
  }
  want.forEach((v) => {
    const res = R.route(v.src, v.tgt);
    if (res) {
      virtRoutes[v.id] = res.pts;
      R.mark(res, 1);
    }
  });
}
function fakeRes(R, pts) {
  const cells = [],
    dirs = [];
  const G = R.o.grid;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i];
    const d = Math.abs(a.y - b.y) < 0.5 ? (b.x > a.x ? 0 : 2) : b.y > a.y ? 1 : 3;
    const steps = Math.max(1, Math.round((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / G));
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps,
        y = a.y + ((b.y - a.y) * s) / steps;
      const c = Math.floor((x - R.ox) / G),
        r = Math.floor((y - R.oy) / G);
      if (c < 0 || r < 0 || c >= R.cols || r >= R.rows) continue;
      cells.push(r * R.cols + c);
      dirs.push(d);
    }
  }
  return { cells, dirs, startCell: cells[0], endCell: cells[cells.length - 1] };
}
