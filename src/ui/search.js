/* ---------- areas, legend, search ---------- */
const areasEl = $('#areas');
function renderAreas() {
  areasEl.replaceChildren();
  CTX.forEach((c) => {
    if (c.color) document.documentElement.style.setProperty('--ctx-' + c.id, c.color);
    else document.documentElement.style.removeProperty('--ctx-' + c.id);
  });
  CTX.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.style.setProperty('--c', `var(--ctx-${c.id},var(--accent))`);
    b.setAttribute('aria-pressed', String(!S.off.has(c.id)));
    b.innerHTML = `<i></i>${esc(c.name)}`;
    b.onclick = () => toggleArea(c.id);
    areasEl.appendChild(b);
  });
}
function toggleArea(id) {
  if (!S.off.has(id) && S.sel && ENTBY[S.sel].ctx === id && !canLeaveEditor(() => toggleArea(id)))
    return;
  S.off.has(id) ? S.off.delete(id) : S.off.add(id);
  syncChips();
  if (S.sel && S.off.has(ENTBY[S.sel].ctx)) select(null);
  refreshOff();
  queueURLUpdate();
}
renderAreas();
function syncChips() {
  [...areasEl.children].forEach((b, i) =>
    b.setAttribute('aria-pressed', String(!S.off.has(CTX[i].id)))
  );
}
function refreshOff() {
  ENT.forEach((e) => cardEl[e.id].classList.toggle('off', S.off.has(e.ctx)));
  updateCanvasEmpty();
  routeVirtual();
  drawZones();
  drawWires();
  if (S.auto) fit(false);
}
$('#show-all-areas').onclick = () => {
  S.off.clear();
  syncChips();
  refreshOff();
  queueURLUpdate();
};
$('#legend').innerHTML = [
  ['assoc', 'association'],
  ['agg', 'aggregation'],
  ['comp', 'composition'],
  ['gen', 'inheritance'],
]
  .map(([k, t]) => `<span>${glyph(k)}${t}</span>`)
  .join('');
function rank(e, q) {
  q = q.toLowerCase();
  const n = e.id.toLowerCase();
  return n === q
    ? 0
    : n.startsWith(q)
      ? 1
      : n.includes(q)
        ? 2
        : e.f.some((f) => f.n.toLowerCase() === q)
          ? 3
          : 4;
}
$('#q').addEventListener('input', (ev) => {
  S.q = ev.target.value.trim();
  applyHighlight();
  if (S.q) {
    const hit = ENT.filter((e) => !S.off.has(e.ctx) && matches(e, S.q)).sort(
      (x, y) => rank(x, S.q) - rank(y, S.q)
    )[0];
    if (hit) centerOn(hit.id);
  }
  queueURLUpdate();
});
