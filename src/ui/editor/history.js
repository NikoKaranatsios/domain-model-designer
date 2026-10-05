/* ---------- editor and undo ---------- */
const undoStack = [],
  redoStack = [];
let panelMode = 'details',
  connection = null,
  dragSnapshot = null;
let editorBaseline = null,
  editorPickerBaseline = [];
const formFingerprint = (form) => JSON.stringify([...new FormData(form)]);
function trackEditor() {
  const form = panel.querySelector('form');
  editorBaseline = form ? formFingerprint(form) : null;
  editorPickerBaseline = [...panel.querySelectorAll('#area-picker,#enum-picker')].map((select) => [
    select,
    select.value,
  ]);
}
function editorIsDirty() {
  const form = panel.querySelector('form');
  return (
    !panel.hidden &&
    panelMode !== 'details' &&
    editorBaseline !== null &&
    form &&
    formFingerprint(form) !== editorBaseline
  );
}
function canLeaveEditor(resume) {
  if (!editorIsDirty()) return true;
  pendingLeave = resume;
  discardDialog.returnValue = 'keep';
  discardDialog.showModal();
  return false;
}
discardDialog.addEventListener('close', () => {
  const resume = pendingLeave;
  pendingLeave = null;
  if (discardDialog.returnValue === 'discard') {
    editorBaseline = null;
    if (resume) resume();
  } else
    for (const [picker, value] of editorPickerBaseline)
      if (picker.isConnected) picker.value = value;
});
window.addEventListener('beforeunload', (ev) => {
  if (
    editorIsDirty() ||
    (urlReady && !urlBlocked && typeof CompressionStream === 'function' && savedRevision < revision)
  ) {
    ev.preventDefault();
    ev.returnValue = '';
  }
});
const icons = {
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3m-4 4 4-4 4 4"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10m-4-4 4 4 4-4"/></svg>',
  edit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3 3 3M3 10l8-8 3 3-8 8-4 1z"/></svg>',
};
const options = (items, value) =>
  items
    .map(
      ([key, label]) =>
        `<option value="${esc(key)}"${key === value ? ' selected' : ''}>${esc(label)}</option>`
    )
    .join('');
const editorInput = (name, label, value = '', attrs = '') =>
  `<label class="ed-label">${label}<input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const editorText = (name, label, value = '', attrs = '') =>
  `<label class="ed-label">${label}<textarea name="${name}" ${attrs}>${esc(value)}</textarea></label>`;
const multiplicities = [
  ['1', '1 · Exactly one'],
  ['0..1', '0..1 · Optional'],
  ['0..*', '0..* · Zero or more'],
  ['1..*', '1..* · One or more'],
];
function choiceEditor(name, label, value, choices, kind = 'type') {
  const normalized = kind === 'multiplicity' && value === '*' ? '0..*' : value,
    custom = !choices.some(([key]) => key === normalized);
  const presetOptions =
    kind === 'type'
      ? [...new Set(choices.map((choice) => choice[2]))]
          .map(
            (group) =>
              `<optgroup label="${esc(group)}">${options(
                choices.filter((choice) => choice[2] === group),
                normalized
              )}</optgroup>`
          )
          .join('')
      : options(choices, normalized);
  return `<div class="ed-choice" data-choice="${kind}"><label class="ed-label">${esc(label)}<select name="${name}">${presetOptions}${options([['__custom__', kind === 'multiplicity' ? 'Custom range…' : 'Custom type…']], custom ? '__custom__' : normalized)}</select></label>
    <label class="ed-label ed-custom"${custom ? '' : ' hidden'}>${kind === 'multiplicity' ? 'Custom range' : 'Custom type'}<input name="${name}-custom" value="${esc(custom ? normalized : '')}" maxlength="80" placeholder="${kind === 'multiplicity' ? 'e.g. 2..5' : 'Type name'}"${custom ? ' required' : ' disabled'}></label>
    <p class="ed-choice-error" role="status" hidden></p></div>`;
}
function syncChoice(container) {
  const select = container.querySelector('select'),
    input = container.querySelector('input'),
    custom = select.value === '__custom__' && !select.disabled;
  container.querySelector('.ed-custom').hidden = !custom;
  input.disabled = !custom;
  input.required = custom;
  input.setCustomValidity('');
  const error = container.querySelector('.ed-choice-error');
  error.hidden = true;
  if (custom && input.value) {
    try {
      if (container.dataset.choice === 'multiplicity') {
        if (select.name === 'relationship-m1' && $('[name="relationship-kind"]').value === 'comp')
          ModelEditor.wholeMultiplicity(input.value);
        else ModelEditor.multiplicity(input.value);
      } else if (!input.value.trim()) throw new Error('Enter a type name.');
    } catch (e) {
      input.setCustomValidity(e.message);
      error.textContent = e.message;
      error.hidden = false;
    }
  }
}
function readChoice(container, name) {
  const select = container.querySelector('select[name="' + name + '"]');
  return select.value === '__custom__'
    ? container.querySelector('input[name="' + name + '-custom"]').value
    : select.value;
}
function typeChoices() {
  const seen = new Set();
  return [
    [PRIMS.map((p) => p[0]), 'Primitive types'],
    [TYPES.map((t) => t.n), 'Value types'],
    [Object.keys(ENUMS).sort((a, b) => a.localeCompare(b)), 'Enumerations'],
    [ENT.map((e) => e.id).sort((a, b) => a.localeCompare(b)), 'Classes'],
  ].flatMap(([names, group]) =>
    names
      .filter((name) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .map((name) => [name, name, group])
  );
}
function drawer(title, kicker = 'Data model') {
  panel.innerHTML = `<button class="ib x" type="button" data-close aria-label="Close drawer">${icons.close}</button><div class="eb">${esc(kicker)}</div><h2>${esc(title)}</h2><div id="editor-body"></div>`;
  panel.hidden = false;
  panel.scrollTop = 0;
  return $('#editor-body');
}
function editorError(error) {
  const el = $('#editor-error');
  if (el) {
    el.textContent = error.message;
    el.hidden = false;
    el.scrollIntoView({ block: 'nearest' });
  } else notice(error.message);
}
const errorHTML = '<p id="editor-error" class="ed-error" role="alert" hidden></p>';
function remember(snapshot) {
  undoStack.push(JSON.stringify(snapshot));
  if (undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
  updateHistory();
}
function updateHistory() {
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;
}
function restoreConfig(config) {
  cancelCardDrag();
  pointers.clear();
  gesture = null;
  cancelAnimationFrame(anim);
  cancelConnection();
  MODEL = config.model;
  BASE = config.layout;
  ({ CTX, ENT, ENUMS, ENUMNOTES, TYPES, PRIMS, RELS } = MODEL);
  SIZE = BASE.nodes;
  CARD_WIDTH = ENT.length ? Math.max(...ENT.map((e) => SIZE[e.id].w)) : BASE.cardWidth || 280;
  RO = BASE.ro;
  rebuildIndexes();
  for (const id of Object.keys(nodes)) delete nodes[id];
  ENT.forEach((e) => (nodes[e.id] = { x: 0, y: 0, w: SIZE[e.id].w, h: SIZE[e.id].h }));
  GR.gx = BASE.gx;
  GR.gy = BASE.gy;
  loadCells();
  place();
  const v = config.view;
  S.sel = v.selected;
  S.off = new Set(v.hidden);
  S.q = v.search;
  S.auto = v.camera.fit;
  S.attributes = v.attributes || 'keys';
  S.labels = v.labels === true;
  S.hover = null;
  S.hoverEdge = null;
  panelMode = 'details';
  syncTitle();
  renderAreas();
  renderCards();
  placeCards();
  drawZones();
  for (const [id, g] of Object.entries(wireEls)) {
    g.remove();
    delete wireEls[id];
  }
  routeAll();
  drawWires();
  $('#q').value = S.q;
  if (S.sel) showPanel(S.sel);
  else panel.hidden = true;
  if (S.auto && S.off.size < CTX.length) fit(false);
  else if (!v.camera.fit) {
    S.z = v.camera.zoom;
    S.tx = stage.clientWidth / 2 - v.camera.x * S.z;
    S.ty = stage.clientHeight / 2 - v.camera.y * S.z;
    apply();
  }
  queueURLUpdate();
  updateHistory();
}
function commit(command, after) {
  try {
    cancelCardDrag();
    const before = designSnapshot(),
      next = ModelEditor.apply(before, command);
    if (JSON.stringify(before) === JSON.stringify(next)) {
      restoreConfig(next);
      if (after) after();
      return true;
    }
    if (urlBlocked) {
      urlBlocked = false;
      $('#notice').hidden = true;
    }
    remember(before);
    restoreConfig(next);
    if (after) after();
    return true;
  } catch (error) {
    editorError(error);
    return false;
  }
}
function travel(from, to) {
  if (!from.length || drag || !canLeaveEditor(() => travel(from, to))) return;
  to.push(JSON.stringify(designSnapshot()));
  restoreConfig(JSON.parse(from.pop()));
  updateHistory();
}
$('#undo').onclick = () => travel(undoStack, redoStack);
$('#redo').onclick = () => travel(redoStack, undoStack);
