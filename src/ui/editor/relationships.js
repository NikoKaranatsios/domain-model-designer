function showRelationshipEditor(id, a, b) {
  if (!canLeaveEditor(() => showRelationshipEditor(id, a, b))) return;
  cancelConnection();
  panelMode = 'relationship';
  const existing = id === undefined ? null : RELS.find((r) => r.i === id);
  const r = existing || {
    a: a || S.sel || ENT[0].id,
    b: b || ENT.find((e) => e.id !== (a || S.sel))?.id || ENT[0].id,
    k: 'assoc',
    l: '',
    m1: '1',
    m2: '0..*',
    nav: 'none',
  };
  const body = drawer(existing ? 'Edit relationship' : 'New relationship');
  const kinds = [
    ['assoc', 'Association'],
    ['agg', 'Shared aggregation'],
    ['comp', 'Composition'],
    ['gen', 'Inheritance'],
    ...(existing && ['real', 'dep'].includes(existing.k)
      ? [[existing.k, existing.k === 'real' ? 'Interface realization' : 'Dependency']]
      : []),
  ];
  body.innerHTML = `<form id="relationship-form"${existing ? ' data-original="' + existing.i + '"' : ''}>
    <p class="ed-help">Associations link data. Composition places the filled diamond at the whole; inheritance points to the parent.</p>
    <label class="ed-label">Relationship<select name="relationship-kind">${options(kinds, r.k)}</select></label>
    <div class="ed-grid"><label class="ed-label"><span id="from-label">From class</span><select name="relationship-a">${options(
      ENT.map((e) => [e.id, e.id]),
      r.a
    )}</select></label><label class="ed-label"><span id="to-label">To class</span><select name="relationship-b">${options(
      ENT.map((e) => [e.id, e.id]),
      r.b
    )}</select></label></div>
    ${editorInput('relationship-name', 'Name', r.l, 'maxlength="200"')}
    <div id="association-settings"><div class="ed-grid">${choiceEditor('relationship-m1', 'From multiplicity', r.m1 || '1', [['0', '0 · No instances'], ...multiplicities], 'multiplicity')}${choiceEditor('relationship-m2', 'To multiplicity', r.m2 || '0..*', multiplicities, 'multiplicity')}</div>
    <div class="ed-grid">${editorInput('relationship-role1', 'From role', r.role1 || '', 'maxlength="80"')}${editorInput('relationship-role2', 'To role', r.role2 || '', 'maxlength="80"')}</div>
    <label id="navigation-settings" class="ed-label">Navigation<select name="relationship-nav">${options(
      [
        ['none', 'Unspecified · plain line'],
        ['b', 'From → To'],
        ['a', 'To → From'],
        ['both', 'Both directions'],
      ],
      r.nav === undefined ? (r.k === 'assoc' ? 'b' : 'none') : r.nav
    )}</select></label></div>
    ${errorHTML}<div class="ed-save"><button class="share-btn" type="submit">${existing ? 'Save relationship' : 'Create relationship'}</button><button class="ed-secondary" type="button" data-cancel-edit>Cancel</button></div>
    ${existing ? `<button class="ed-text-btn danger ed-delete" type="button" data-delete-relationship="${existing.i}">Delete relationship</button>` : ''}
  </form>`;
  relationshipKindChanged();
  trackEditor();
  body.querySelector('select').focus();
}
function relationshipKindChanged() {
  const kind = $('[name="relationship-kind"]').value,
    association = ['assoc', 'agg', 'comp'].includes(kind);
  $('#association-settings').hidden = !association;
  $('#association-settings')
    .querySelectorAll('input,select')
    .forEach((el) => (el.disabled = !association));
  $('#navigation-settings').hidden = kind !== 'assoc';
  $('[name="relationship-nav"]').disabled = kind !== 'assoc';
  const owner = $('[name="relationship-m1"]');
  [...owner.options].forEach(
    (option) =>
      (option.disabled =
        kind === 'comp' && !['0', '1', '0..1', '__custom__'].includes(option.value))
  );
  if (kind === 'comp' && !['0', '1', '0..1', '__custom__'].includes(owner.value)) owner.value = '1';
  $('#association-settings').querySelectorAll('[data-choice]').forEach(syncChoice);
  $('#from-label').textContent =
    kind === 'gen' ? 'Subclass' : kind === 'comp' || kind === 'agg' ? 'Whole' : 'From class';
  $('#to-label').textContent =
    kind === 'gen' ? 'Parent class' : kind === 'comp' || kind === 'agg' ? 'Part' : 'To class';
}
