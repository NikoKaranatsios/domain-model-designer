function fieldEditor(f, index) {
  const keys = f.k.split(' '),
    foreign = keys.find((k) => k.startsWith('FK:')) || '';
  return `<fieldset class="ed-field" data-field><legend>Attribute <span class="ed-field-number">${index + 1}</span></legend>
    <div class="ed-field-actions"><button class="ed-icon" type="button" data-field-up aria-label="Move attribute up">${icons.up}</button><button class="ed-icon" type="button" data-field-down aria-label="Move attribute down">${icons.down}</button><button class="ed-icon danger" type="button" data-field-remove aria-label="Remove attribute">${icons.close}</button></div>
    ${editorInput('field-name', 'Name', f.n, 'required pattern="[A-Za-z_][A-Za-z0-9_]*" maxlength="80" autocomplete="off"')}
    <div class="ed-grid">${choiceEditor('field-type', 'Type', f.t, typeChoices())}${choiceEditor('field-multiplicity', 'Multiplicity', f.m || '1', multiplicities, 'multiplicity')}</div>
    <div class="ed-checks"><label><input type="checkbox" name="field-pk"${keys.includes('PK') ? ' checked' : ''}>Identifier (PK)</label><label><input type="checkbox" name="field-uk"${keys.includes('UK') ? ' checked' : ''}>Unique key</label></div>
    <label class="ed-label">References class (FK)<select name="field-fk">${options([['', 'None'], ...ENT.map((e) => [e.id, e.id])], foreign.slice(3))}</select></label>
    ${editorInput('field-note', 'Description', f.note, 'maxlength="2000"')}
  </fieldset>`;
}
function renumberFields() {
  const rows = [...panel.querySelectorAll('[data-field]')];
  rows.forEach((row, i) => {
    row.querySelector('.ed-field-number').textContent = i + 1;
    row.querySelector('[data-field-up]').disabled = i === 0;
    row.querySelector('[data-field-down]').disabled = i === rows.length - 1;
  });
  const add = panel.querySelector('[data-add-field]');
  if (add) add.disabled = rows.length >= 256;
}
function addFieldRow(f = { n: '', t: 'String', m: '1', k: '', note: '' }) {
  const list = $('#edit-fields');
  if (list.children.length >= 256) return;
  list.insertAdjacentHTML('beforeend', fieldEditor(f, list.children.length));
  renumberFields();
  list.lastElementChild.querySelector('input').focus();
}
function showClassEditor(id, add = false) {
  if (!canLeaveEditor(() => showClassEditor(id, add))) return;
  cancelConnection();
  panelMode = 'class';
  let name = 'NewClass';
  for (let i = 2; ENTBY[name]; i++) name = 'NewClass' + i;
  const e = id
    ? ENTBY[id]
    : {
        id: name,
        ctx: S.sel ? ENTBY[S.sel].ctx : CTX.find((c) => !S.off.has(c.id))?.id || CTX[0].id,
        desc: '',
        f: [],
      };
  const body = drawer(id ? 'Edit class' : 'New class', CTXBY[e.ctx].name);
  const kinds = [
    ['', 'Class'],
    ['abstract', 'Abstract class'],
    ...(e.st === 'interface' ? [['interface', 'Interface']] : []),
  ];
  body.innerHTML = `<form id="class-form" data-original="${esc(id || '')}">
    <p class="ed-help">Classes describe data. Attributes carry types and multiplicities.</p>
    ${editorInput('class-name', 'Class name', e.id, 'required pattern="[A-Za-z_][A-Za-z0-9_]*" maxlength="80" autocomplete="off"')}
    <div class="ed-grid">${editorInput('class-context', 'Domain area', CTXBY[e.ctx].name, 'required list="domain-area-options" maxlength="120" autocomplete="off"')}<label class="ed-label">Kind<select name="class-kind">${options(kinds, e.st || '')}</select></label></div>
    <datalist id="domain-area-options">${CTX.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist><p class="ed-hint">Select an area or type a new name. New areas are created when you save.</p>
    ${editorText('class-description', 'Description', e.desc, 'maxlength="10000"')}
    <h3>Attributes <button class="ed-text-btn" type="button" data-add-field>+ Add attribute</button></h3>
    <div id="edit-fields">${e.f.map(fieldEditor).join('')}</div>
    <details class="ed-details"><summary>Keys and constraints</summary>${editorText('class-unique', 'Unique keys · one per line', (e.uk || []).join('\n'))}${editorText('class-checks', 'Constraints · one per line', (e.checks || []).join('\n'))}</details>
    <div id="delete-confirmation"></div>${errorHTML}<div class="ed-save"><button class="share-btn" type="submit">${id ? 'Save class' : 'Create class'}</button><button class="ed-secondary" type="button" data-cancel-edit>Cancel</button>${id ? `<button class="ed-secondary danger" type="button" data-delete-class="${esc(id)}">Delete</button>` : ''}</div>
  </form>`;
  renumberFields();
  trackEditor();
  if (add) addFieldRow();
  else body.querySelector('input').focus();
}
