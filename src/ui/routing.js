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
