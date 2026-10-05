/* ---------- cards ---------- */
const cardsEl = $('#cards'),
  cardEl = {};
function updateCanvasEmpty() {
  $('#empty-model').hidden = ENT.length > 0;
  $('#filtered-model').hidden = !ENT.length || ENT.some((e) => !S.off.has(e.ctx));
}
function renderCards() {
  cardsEl.replaceChildren();
  for (const id of Object.keys(cardEl)) delete cardEl[id];
  updateCanvasEmpty();
  $('#connect').disabled = !ENT.length;
  ENT.forEach((e) => {
    const fields = S.attributes === 'all' ? e.f : e.f.filter((f) => f.k),
      more = e.f.length - fields.length;
    const el = document.createElement('div');
    el.className = 'card' + (e.st ? ' st' : '') + (e.st === 'abstract' ? ' abstract' : '');
    el.dataset.id = e.id;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', e.id);
    el.style.setProperty('--c', 'var(--ctx-' + e.ctx + ',var(--accent))');
    el.innerHTML =
      `<div class="ch">${e.st === 'interface' ? '<span class="cs">«interface»</span>' : ''}<span class="cn">${esc(e.id)}</span></div>` +
      (fields.length
        ? `<div class="cb">${fields
            .map((f) => {
              const notation =
                f.n +
                ' : ' +
                f.t +
                (f.m !== '1' ? ' [' + f.m + ']' : '') +
                (f.k.split(' ').includes('PK') ? ' {id}' : '');
              return `<div class="cr" data-f="${esc(f.n)}" title="${esc(notation)}"><span class="f">${esc(f.n)} : <span class="attr-type">${esc(f.t)}</span>${f.m !== '1' ? ` <span class="attr-meta">[${esc(f.m)}]</span>` : ''}${f.k.split(' ').includes('PK') ? ' <span class="attr-meta">{id}</span>' : ''}</span></div>`;
            })
            .join('')}</div>`
        : '') +
      (more ? `<div class="cm">+${more} attributes</div>` : '') +
      `<button class="card-connector" type="button" data-connect-from="${esc(e.id)}" aria-label="Draw a connection from ${esc(e.id)}" title="Draw a connection"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 11V8h8V5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="3" r="1.5"/></svg></button>`;
    cardsEl.appendChild(el);
    cardEl[e.id] = el;
  });
}
renderCards();
function placeCards() {
  ENT.forEach((e) => {
    const n = nodes[e.id],
      el = cardEl[e.id];
    el.style.transform = `translate(${n.x}px,${n.y}px)`;
    el.style.width = n.w + 'px';
    el.style.height = n.h + 'px';
  });
}
