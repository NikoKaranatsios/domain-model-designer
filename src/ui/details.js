/* ---------- selection + detail panel ---------- */
const panel = $('#panel');
function select(id) {
  if (!canLeaveEditor(() => select(id))) return false;
  cancelConnection();
  panelMode = 'details';
  S.sel = id;
  S.hover = null;
  S.hoverEdge = null;
  routeVirtual();
  drawWires();
  if (id) {
    showPanel(id);
  } else {
    panel.hidden = true;
  }
  queueURLUpdate();
  return true;
}
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && drag) {
    ev.preventDefault();
    cancelCardDrag();
    pointers.clear();
    gesture = null;
    return;
  }
  if (
    shareDialog.open ||
    exportDialog.open ||
    discardDialog.open ||
    connection ||
    ev.target.closest('input,textarea,select,[contenteditable="true"]')
  )
    return;
  if (ev.key === 'Escape') {
    if (S.q) {
      $('#q').value = '';
      S.q = '';
      applyHighlight();
      queueURLUpdate();
    } else select(null);
  }
  if (
    (ev.key === 'Enter' || ev.key === ' ') &&
    document.activeElement &&
    document.activeElement.classList.contains('card')
  ) {
    ev.preventDefault();
    select(document.activeElement.dataset.id);
  }
});
const KTXT = {
  gen: 'inherits from',
  real: 'implements',
  comp: 'composes',
  agg: 'aggregates',
  assoc: 'associates with',
  dep: 'depends on',
};
function glyph(k, dir) {
  const dash = k === 'dep' || k === 'real' ? ' stroke-dasharray="3 2"' : '';
  const end =
    k === 'gen' || k === 'real'
      ? '<path d="M16 2L23 6L16 10Z" fill="#fff" stroke="currentColor"/>'
      : k === 'comp' || k === 'agg'
        ? `<path d="M14 6L18.5 3L23 6L18.5 9Z" fill="${k === 'comp' ? 'currentColor' : '#fff'}" stroke="currentColor"/>`
        : k === 'dep'
          ? '<path d="M18 2.5L23 6L18 9.5" fill="none" stroke="currentColor"/>'
          : '';
  return `<svg width="24" height="12" viewBox="0 0 24 12" style="color:var(--muted);${dir === 'in' ? 'transform:scaleX(-1)' : ''}"><path d="M1 6H${k === 'comp' || k === 'agg' ? 14 : k === 'gen' || k === 'real' ? 16 : 22}" stroke="currentColor"${dash}/>${end}</svg>`;
}
function showPanel(id) {
  panelMode = 'details';
  const e = ENTBY[id],
    c = CTXBY[e.ctx];
  const lin = e.lin
    ? [
        {
          n: 'lineage',
          t: 'Lineage',
          m: '1',
          k: '',
          note: 'data_source, source_ids, raw_batch_id, as_of, created_at, updated_at',
        },
      ]
    : [];
  const pk = e.f.filter((f) => f.k.split(' ').includes('PK')).map((f) => f.n);
  const rels = RELS.filter((r) => r.a === id || r.b === id);
  const enums = [...new Set(e.f.map((f) => f.t).filter((t) => Object.hasOwn(ENUMS, t)))];
  const keyH = (k) =>
    k
      .split(' ')
      .filter(Boolean)
      .map((x) =>
        x.startsWith('FK:')
          ? `<span class="key">FK</span><button class="lk" data-go="${esc(x.slice(3))}">${esc(x.slice(3))}</button>`
          : `<span class="key">${esc(x)}</span>`
      )
      .join(' ');
  const relLi = (r) => {
    const out = r.a === id,
      o = out ? r.b : r.a,
      self = r.a === r.b;
    const txt = r.l || KTXT[r.k];
    const m = r.m1 ? (out ? `${r.m1} → ${r.m2}` : `${r.m2} ← ${r.m1}`) : '';
    return `<li><span class="g">${glyph(r.k, out ? 'out' : 'in')}</span><span>${esc(txt)} ${self ? '<span class="m">itself</span>' : `<button class="lk" data-go="${esc(o)}">${esc(o)}</button>`}</span><span class="m">${esc(m)}</span><button type="button" class="ed-icon" data-edit-relationship="${r.i}" aria-label="Edit relationship ${esc(r.a)} to ${esc(r.b)}" title="Edit relationship">${icons.edit}</button></li>`;
  };
  panel.innerHTML = `<button class="ib x" data-close aria-label="Close"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
    <div class="eb" style="color:var(--ctx-${e.ctx},var(--accent))">${esc(c.name)}</div>
    <h2${e.st === 'abstract' ? ' style="font-style:italic"' : ''}>${esc(e.id)}</h2>
    <div class="ed-actions"><button type="button" class="ed-secondary" data-edit-class>Edit class</button><button type="button" class="ed-secondary" data-start-connection>Connect</button><button type="button" class="ed-secondary danger" data-delete-class="${esc(id)}">Delete</button></div>
    <div id="delete-confirmation"></div>
    ${e.st || e.ext || SUBJECT_IMPL.has(id) ? `<div class="sub">${[e.st === 'interface' ? '«interface»' : e.st === 'abstract' ? 'Abstract class' : '', e.ext ? 'is a kind of ' + esc(e.ext) : '', SUBJECT_IMPL.has(id) ? 'implements Subject' : ''].filter(Boolean).join(' · ')}</div>` : ''}
    <p class="d">${esc(e.desc)}</p>
    <h3>Attributes<button type="button" class="ed-text-btn" data-add-attribute>+ Add attribute</button></h3>
    <table class="ft"><tbody>${e.f
      .concat(lin)
      .map(
        (f) =>
          `<tr><td class="f">${esc(f.n)}${f.note ? `<span class="n">${esc(f.note)}</span>` : ''}</td><td class="t">${esc(f.t)}${f.m !== '1' ? ' [' + esc(f.m) + ']' : ''}</td><td>${keyH(f.k)}</td></tr>`
      )
      .join('')}</tbody></table>
    ${
      e.st === 'interface' && !e.uk && !e.checks
        ? ''
        : `<h3>Keys and rules</h3>
    <dl class="facts">${e.st === 'interface' ? '' : `<dt>Primary key</dt><dd><code>${pk.length ? '(' + pk.map(esc).join(', ') + ')' : '—'}</code></dd>`}
      ${e.uk ? `<dt>Unique</dt><dd>${e.uk.map((u) => `<code>${esc(u)}</code>`).join('<br>')}</dd>` : ''}
      ${e.checks ? `<dt>Rules</dt><dd>${e.checks.map(esc).join('<br>')}</dd>` : ''}</dl>`
    }
    ${rels.length ? `<h3>Relationships</h3><ul class="rl">${rels.map(relLi).join('')}</ul>` : ''}
    ${enums.length ? `<h3>Allowed values</h3>${enums.map((t) => `<div class="ev"><b>${esc(t)}</b><div>${ENUMS[t].map(esc).join(' · ')}</div>${Object.hasOwn(ENUMNOTES, t) && ENUMNOTES[t] ? `<div style="font-family:var(--f-body)">${esc(ENUMNOTES[t])}</div>` : ''}</div>`).join('')}` : ''}`;
  panel.hidden = false;
  panel.scrollTop = 0;
}
panel.addEventListener('click', (ev) => {
  const g = ev.target.closest('[data-go]');
  if (g) {
    const id = g.dataset.go;
    const go = () => {
      const ctx = ENTBY[id].ctx;
      if (S.off.has(ctx)) {
        S.off.delete(ctx);
        syncChips();
        refreshOff();
      }
      if (select(id)) centerOn(id);
    };
    if (canLeaveEditor(go)) go();
    return;
  }
  if (ev.target.closest('[data-close]')) select(null);
});
