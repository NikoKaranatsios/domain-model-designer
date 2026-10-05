/* ---------- zones ---------- */
const zonesEl = $('#zones');
function drawZones(target) {
  let h = '';
  CTX.forEach((c) => {
    const col = `var(--ctx-${c.id},var(--accent))`;
    let lab = null;
    const cells = ENT.filter((e) => e.ctx === c.id)
      .map((e) => GR.cell[e.id])
      .sort((a, b) => a - b);
    const rects = cells
      .map((k) => {
        const R = cellRect(k % GR.C, (k / GR.C) | 0);
        if (!lab) lab = R;
        return `<rect x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}"/>`;
      })
      .join('');
    h += `<g class="zone${S.off.has(c.id) ? ' off' : ''}"><g opacity=".055" style="fill:${col}" shape-rendering="crispEdges">${rects}</g>${lab ? `<text class="zl" x="${lab.x + 16}" y="${lab.y + 22}" style="fill:${col}">${esc(c.name)}</text>` : ''}</g>`;
  });
  if (target) {
    const R = cellRect(target.c, target.r);
    h += `<rect x="${R.x + GR.gx / 2 - 10}" y="${R.y + GR.gy / 2 - 10}" width="${CARD_WIDTH + 20}" height="${R.h - GR.gy + 20}" rx="12" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="7 5"/>`;
  }
  zonesEl.innerHTML = h;
}
