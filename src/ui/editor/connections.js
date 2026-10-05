function cancelConnection() {
  const active = !!connection;
  connection = null;
  $('#connect').setAttribute('aria-pressed', 'false');
  $('#connection-hint').hidden = true;
  stage.classList.remove('connecting');
  $('#connection-preview').replaceChildren();
  Object.values(cardEl).forEach((el) => el.classList.remove('connect-source'));
  if (active) applyHighlight();
}
function startConnection(a) {
  if (!ENT.length) return false;
  if (!canLeaveEditor(() => startConnection(a))) return false;
  if (connection) {
    cancelConnection();
    return false;
  }
  connection = { source: a || null };
  panel.hidden = true;
  panelMode = 'details';
  $('#connect').setAttribute('aria-pressed', 'true');
  $('#connection-hint').hidden = false;
  stage.classList.add('connecting');
  $('#connection-hint-text').textContent = a ? 'Choose the target class' : 'Choose the first class';
  if (a) cardEl[a].classList.add('connect-source');
  applyHighlight();
  return true;
}
function connectionClick(id) {
  if (!connection.source) {
    connection.source = id;
    cardEl[id].classList.add('connect-source');
    $('#connection-hint-text').textContent = 'Choose the target class';
  } else {
    const source = connection.source;
    showRelationshipEditor(undefined, source, id);
  }
}
function connectionPreview(ev) {
  if (!connection?.source) return;
  const n = nodes[connection.source],
    p = toWorld(ev.clientX, ev.clientY),
    x = n.x + n.w / 2,
    y = n.y + n.h / 2;
  $('#connection-preview').innerHTML =
    `<path d="M${x} ${y} L${p.x} ${p.y}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4"/>`;
}
$('#add-class').onclick = () => showClassEditor();
$('#empty-add-class').onclick = () => showClassEditor();
$('#connect').onclick = () => startConnection();
$('#view-settings').onclick = showViewEditor;
$('#cancel-connection').onclick = cancelConnection;
stage.addEventListener('click', (ev) => {
  const port = ev.target.closest('[data-connect-from]');
  if (port && ev.detail === 0) {
    ev.preventDefault();
    startConnection(port.dataset.connectFrom);
  }
});
panel.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target,
    data = new FormData(form),
    get = (name) => data.get(name) || '';
  const existing =
    (form.id === 'class-form' && form.dataset.original) ||
    (form.id === 'relationship-form' && form.hasAttribute('data-original')) ||
    form.id === 'view-form' ||
    (form.id === 'enum-form' && $('#enum-picker').value) ||
    (form.id === 'area-form' && form.dataset.original);
  if (existing && !editorIsDirty()) {
    if (form.id === 'area-form') showAreaEditor(form.dataset.original);
    else cancelEdit();
    return;
  }
  if (form.id === 'class-form') {
    const f = [...form.querySelectorAll('[data-field]')].map((row) => {
      const value = (name) => row.querySelector('[name="' + name + '"]').value;
      return {
        n: value('field-name'),
        t: readChoice(row, 'field-type'),
        m: readChoice(row, 'field-multiplicity'),
        k: [
          row.querySelector('[name="field-pk"]').checked ? 'PK' : '',
          row.querySelector('[name="field-uk"]').checked ? 'UK' : '',
          value('field-fk') ? 'FK:' + value('field-fk') : '',
        ]
          .filter(Boolean)
          .join(' '),
        note: value('field-note'),
      };
    });
    commit(
      {
        type: 'class',
        id: form.dataset.original || null,
        data: {
          id: get('class-name').trim(),
          areaName: get('class-context'),
          st: get('class-kind'),
          desc: get('class-description'),
          f,
          uk: get('class-unique').split('\n'),
          checks: get('class-checks').split('\n'),
        },
      },
      () => {
        if (!form.dataset.original) centerOn(S.sel);
      }
    );
  } else if (form.id === 'relationship-form') {
    commit({
      type: 'relationship',
      id: form.hasAttribute('data-original') ? Number(form.dataset.original) : undefined,
      data: {
        a: get('relationship-a'),
        b: get('relationship-b'),
        k: get('relationship-kind'),
        l: get('relationship-name'),
        m1: readChoice(form, 'relationship-m1'),
        m2: readChoice(form, 'relationship-m2'),
        role1: get('relationship-role1'),
        role2: get('relationship-role2'),
        nav: form.querySelector('[name="relationship-nav"]').value,
      },
    });
  } else if (form.id === 'view-form')
    commit({
      type: 'view',
      title: get('view-title'),
      attributes: get('view-attributes'),
      width: Number(get('view-width')),
      gx: Number(get('view-gx')),
      gy: Number(get('view-gy')),
      labels: data.has('view-labels'),
      hidden: CTX.map((c) => c.id).filter((id) => !data.getAll('view-area').includes(id)),
    });
  else if (form.id === 'enum-form')
    commit({
      type: 'enum',
      name: get('enum-name').trim(),
      values: get('enum-values').split('\n'),
      note: get('enum-note'),
    });
  else if (form.id === 'area-form')
    commit(
      {
        type: 'area',
        id: form.dataset.original || null,
        name: get('area-name'),
        description: get('area-description'),
        color: get('area-color'),
      },
      () => showAreaEditor(form.dataset.original || CTX.at(-1).id)
    );
  else if (form.id === 'import-form') {
    const button = form.querySelector('[type="submit"]');
    invalidateImportPreview();
    const stamp = importReadRevision;
    button.disabled = true;
    try {
      let source;
      if (get('import-source') === 'paste') source = get('import-json');
      else {
        const file = form.querySelector('[name="design-file"]').files[0];
        if (!file || file.size > DesignURL.limits.maxBytes)
          throw new Error('Choose a JSON file up to 2 MB.');
        source = await file.text();
      }
      if (!form.isConnected || stamp !== importReadRevision) return;
      importPreview = ModelImport.parse(source);
      const m = importPreview.model;
      $('#import-preview').innerHTML =
        `<div class="ed-confirm"><h3>${esc(m.title || 'Domain Model')}</h3><p>${importCount(m.ENT.length, 'class', 'classes')} · ${importCount(m.RELS.length, 'relationship')} · ${importCount(m.CTX.length, 'domain area')}<br>${importCount(Object.keys(m.ENUMS).length, 'enumeration')} · ${importCount(m.TYPES.length, 'value type')}</p><p>Import replaces the current design. Undo restores it.</p><button class="share-btn" type="button" data-apply-import>Import model</button></div>`;
      $('[data-apply-import]').focus();
    } catch (error) {
      if (form.isConnected && stamp === importReadRevision) editorError(error);
    } finally {
      if (form.isConnected && stamp === importReadRevision) button.disabled = false;
    }
  }
});
panel.addEventListener('change', (ev) => {
  if (ev.target.name === 'import-source') syncImportSource();
  else if (ev.target.closest('#import-form')) invalidateImportPreview();
  if (ev.target.name === 'relationship-kind') relationshipKindChanged();
  if (ev.target.id === 'enum-picker') showEnumEditor(ev.target.value);
  if (ev.target.id === 'area-picker') showAreaEditor(ev.target.value);
  const choice = ev.target.closest('[data-choice]');
  if (choice) {
    syncChoice(choice);
    if (ev.target.tagName === 'SELECT' && ev.target.value === '__custom__')
      choice.querySelector('input').focus();
  }
});
panel.addEventListener('input', (ev) => {
  if (ev.target.closest('#import-form')) invalidateImportPreview();
  const choice = ev.target.closest('[data-choice]');
  if (choice) syncChoice(choice);
});
