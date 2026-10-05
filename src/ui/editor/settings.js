function showViewEditor() {
  if (!canLeaveEditor(showViewEditor)) return;
  cancelConnection();
  panelMode = 'view';
  const body = drawer('View settings');
  body.innerHTML = `<form id="view-form"><p class="ed-help">Drag cards to arrange them. Pan and zoom to choose the view saved in your link.</p>
    ${editorInput('view-title', 'Model name', MODEL.title || 'Domain Model', 'maxlength="120" required')}
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
    <h3>Data model</h3><div class="ed-actions"><button type="button" class="ed-secondary" data-edit-area>Domain areas</button><button type="button" class="ed-secondary" data-edit-enum>Enumerations</button><button type="button" class="ed-secondary" data-import-design>Import JSON</button></div><div class="ed-actions ed-reset-actions"><button type="button" class="ed-secondary" data-new-model>Start a new model…</button><button type="button" class="ed-secondary danger" data-clear-model>Delete everything…</button></div><div id="reset-confirmation" aria-live="polite"></div></form>`;
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
let importPreview = null,
  importReadRevision = 0;
const importCount = (n, singular, plural = singular + 's') =>
  n + ' ' + (n === 1 ? singular : plural);
function invalidateImportPreview() {
  importReadRevision++;
  importPreview = null;
  $('#import-preview')?.replaceChildren();
  const button = $('#import-form [type="submit"]');
  if (button) button.disabled = false;
  const error = $('#editor-error');
  if (error) error.hidden = true;
}
function syncImportSource() {
  invalidateImportPreview();
  const paste = $('[name="import-source"]').value === 'paste';
  $('#import-file-label').hidden = paste;
  $('[name="design-file"]').disabled = paste;
  $('[name="design-file"]').required = !paste;
  $('#import-json-label').hidden = !paste;
  $('[name="import-json"]').disabled = !paste;
  $('[name="import-json"]').required = paste;
}
function showImportEditor() {
  if (!canLeaveEditor(showImportEditor)) return;
  cancelConnection();
  panelMode = 'import';
  drawer('Import model').innerHTML =
    `<form id="import-form"><p class="ed-help">Import Model JSON describing classes and relationships, or a Design backup. Model JSON gets a fresh layout; backups keep their saved view. For AI edits, start with Export → Model JSON. Files stay in your browser. Maximum 2 MB.</p><label class="ed-label">Source<select name="import-source"><option value="file">Upload JSON file</option><option value="paste">Paste JSON</option></select></label><label id="import-file-label" class="ed-label">JSON file<input type="file" name="design-file" accept=".json,application/json" required></label><label id="import-json-label" class="ed-label" hidden>Model JSON<textarea name="import-json" rows="10" maxlength="2097152" spellcheck="false" placeholder='{"format":"uml-data-model","formatVersion":"1.0.0","name":"My model","classes":[]}' disabled></textarea></label>${errorHTML}<div class="ed-save"><button class="ed-secondary" type="submit">Preview model</button><button class="ed-secondary" type="button" data-open-view>Back</button></div><div id="import-preview" aria-live="polite"></div></form>`;
  invalidateImportPreview();
  trackEditor();
}
