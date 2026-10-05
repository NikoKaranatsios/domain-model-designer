function showViewEditor() {
  if (!canLeaveEditor(showViewEditor)) return;
  cancelConnection();
  panelMode = 'view';
  const body = drawer('View settings');
  body.innerHTML = `<form id="view-form"><p class="ed-help">Drag cards to arrange them. Pan and zoom to choose the view saved in your link.</p>
    ${editorInput('view-title', 'Model name', MODEL.title || 'FCP Domain Model', 'maxlength="120" required')}
    <label class="ed-label">Attributes on cards<select name="view-attributes">${options(
      [
        ['keys', 'Key attributes'],
        ['all', 'All attributes'],
      ],
      S.attributes
    )}</select></label>
    ${editorInput('view-width', 'Card width', CARD_WIDTH, 'type="number" required min="80" max="1000" step="1"')}
    <div class="ed-grid">${editorInput('view-gx', 'Column spacing', GR.gx, 'type="number" required min="24" max="1000" step="1"')}${editorInput('view-gy', 'Row spacing', GR.gy, 'type="number" required min="24" max="1000" step="1"')}</div>
    <label class="ed-checkbox"><input name="view-labels" type="checkbox"${S.labels ? ' checked' : ''}>Show relationship names and multiplicities</label>
    <fieldset class="ed-area-options"><legend>Visible domain areas</legend><div>${CTX.map((area) => `<label><input type="checkbox" name="view-area" value="${esc(area.id)}"${S.off.has(area.id) ? '' : ' checked'}>${esc(area.name)}</label>`).join('')}</div></fieldset>
    ${errorHTML}<div class="ed-save"><button class="share-btn" type="submit">Save view</button><button class="ed-secondary" type="button" data-cancel-edit>Cancel</button></div>
    <h3>Data model</h3><div class="ed-actions"><button type="button" class="ed-secondary" data-edit-area>Domain areas</button><button type="button" class="ed-secondary" data-edit-enum>Enumerations</button></div><button type="button" class="ed-secondary" data-import-design>Import design</button><button type="button" class="ed-text-btn ed-delete" data-new-model>Start a new model…</button></form>`;
  trackEditor();
}
function showAreaEditor(id = '') {
  if (!canLeaveEditor(() => showAreaEditor(id))) return;
  panelMode = 'area';
  const area = CTXBY[id],
    body = drawer('Domain areas');
  body.innerHTML = `<form id="area-form" data-original="${esc(id)}"><label class="ed-label">Domain area<select id="area-picker">${options([['', 'New domain area'], ...CTX.map((c) => [c.id, c.name])], id)}</select></label>
    ${editorInput('area-name', 'Name', area?.name || '', 'required maxlength="120"')}${editorText('area-description', 'Description', area?.desc || '', 'maxlength="10000"')}
    ${editorInput(
      'area-color',
      'Color',
      area?.color ||
        getComputedStyle(document.documentElement)
          .getPropertyValue('--ctx-' + id)
          .trim() ||
        '#2B5C61',
      'type="color" required'
    )}
    ${errorHTML}<div class="ed-save"><button class="share-btn" type="submit">${area ? 'Save area' : 'Create area'}</button><button class="ed-secondary" type="button" data-open-view>Back</button></div>
    ${
      area && CTX.length > 1
        ? `<details class="ed-details"><summary>Delete area</summary><p class="ed-help">Move its classes into another area before removing this area. Undo restores it.</p><label class="ed-label">Move classes to<select name="area-move-to">${options(
            CTX.filter((c) => c.id !== id).map((c) => [c.id, c.name]),
            CTX.find((c) => c.id !== id).id
          )}</select></label><button type="button" class="ed-secondary danger" data-delete-area="${esc(id)}">Delete area and move classes</button></details>`
        : ''
    }
  </form>`;
  trackEditor();
}
function showEnumEditor(name = '') {
  if (!canLeaveEditor(() => showEnumEditor(name))) return;
  panelMode = 'enum';
  const body = drawer('Enumeration');
  body.innerHTML = `<form id="enum-form"><p class="ed-help">Define the allowed values for an attribute type.</p><label class="ed-label">Existing enumeration<select id="enum-picker"><option value="">New enumeration</option>${options(
    Object.keys(ENUMS).map((n) => [n, n]),
    name
  )}</select></label>
    ${editorInput('enum-name', 'Type name', name, 'required pattern="[A-Za-z_][A-Za-z0-9_]*" maxlength="80"' + (name ? ' readonly' : ''))}
    ${editorText('enum-values', 'Values · one per line', (Object.hasOwn(ENUMS, name) ? ENUMS[name] : []).join('\n'), 'required')}${editorText('enum-note', 'Description', Object.hasOwn(ENUMNOTES, name) ? ENUMNOTES[name] : '', 'maxlength="10000"')}
    ${errorHTML}<div class="ed-save"><button class="share-btn" type="submit">Save enumeration</button><button class="ed-secondary" type="button" data-open-view>Back</button></div></form>`;
  trackEditor();
}
function showImportEditor() {
  if (!canLeaveEditor(showImportEditor)) return;
  cancelConnection();
  panelMode = 'import';
  drawer('Import design').innerHTML =
    `<form id="import-form"><p class="ed-help">Restore a Design backup JSON export, including its model, layout, and view. This replaces the current design. Undo restores it.</p><label class="ed-label">Design backup JSON<input type="file" name="design-file" accept=".json,application/json" required></label>${errorHTML}<div class="ed-save"><button class="share-btn" type="submit">Import design</button><button class="ed-secondary" type="button" data-open-view>Back</button></div></form>`;
  trackEditor();
}
