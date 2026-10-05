function cancelEdit() {
  if (!canLeaveEditor(cancelEdit)) return;
  panelMode = 'details';
  if (S.sel) showPanel(S.sel);
  else panel.hidden = true;
}
panel.addEventListener('click', (ev) => {
  const target = ev.target.closest('button');
  if (!target) return;
  if (target.hasAttribute('data-edit-class')) showClassEditor(S.sel);
  if (target.hasAttribute('data-add-attribute')) showClassEditor(S.sel, true);
  if (target.hasAttribute('data-add-field')) addFieldRow();
  const row = target.closest('[data-field]');
  if (row && target.hasAttribute('data-field-remove')) {
    row.remove();
    renumberFields();
  }
  if (row && target.hasAttribute('data-field-up') && row.previousElementSibling) {
    row.previousElementSibling.before(row);
    renumberFields();
  }
  if (row && target.hasAttribute('data-field-down') && row.nextElementSibling) {
    row.nextElementSibling.after(row);
    renumberFields();
  }
  if (target.hasAttribute('data-cancel-edit')) cancelEdit();
  if (target.hasAttribute('data-open-view')) showViewEditor();
  if (target.hasAttribute('data-edit-enum')) showEnumEditor();
  if (target.hasAttribute('data-edit-area')) showAreaEditor();
  if (target.hasAttribute('data-import-design')) showImportEditor();
  if (target.hasAttribute('data-delete-area'))
    commit(
      {
        type: 'delete-area',
        id: target.dataset.deleteArea,
        moveTo: $('[name="area-move-to"]').value,
      },
      () => showAreaEditor()
    );
  if (target.hasAttribute('data-start-connection')) startConnection(S.sel);
  if (target.hasAttribute('data-edit-relationship'))
    showRelationshipEditor(Number(target.dataset.editRelationship));
  if (target.hasAttribute('data-delete-relationship'))
    commit({ type: 'delete-relationship', id: Number(target.dataset.deleteRelationship) });
  if (target.hasAttribute('data-delete-class')) {
    const id = target.dataset.deleteClass,
      count = RELS.filter((r) => r.a === id || r.b === id).length;
    const references =
      ENT.filter((e) => e.id !== id).reduce((n, e) => n + e.f.filter((f) => f.t === id).length, 0) +
      TYPES.reduce((n, t) => n + (t.f || []).filter((f) => f.t === id).length, 0);
    $('#delete-confirmation').innerHTML =
      `<div class="ed-confirm"><p>Delete ${esc(id)}${count ? ' and ' + count + ' connected relationship' + (count === 1 ? '' : 's') : ''}?${references ? ' ' + references + ' attribute' + (references === 1 ? '' : 's') + ' typed as this class will also be removed.' : ''} Foreign-key tags will be cleared. Undo restores everything.</p><button class="ed-secondary danger" type="button" data-confirm-delete="${esc(id)}">Delete class</button><button class="ed-secondary" type="button" data-cancel-delete>Cancel</button></div>`;
    $('#delete-confirmation').scrollIntoView({ block: 'center' });
    $('[data-confirm-delete]').focus();
  }
  if (target.hasAttribute('data-cancel-delete')) $('#delete-confirmation').replaceChildren();
  if (target.hasAttribute('data-confirm-delete'))
    commit({ type: 'delete-class', id: target.dataset.confirmDelete, removeReferences: true });
  if (target.hasAttribute('data-new-model')) {
    const show = () => {
      target.outerHTML =
        '<div class="ed-confirm"><p>Start with one empty class? You can undo this to return to the current model.</p><button class="ed-secondary" type="button" data-confirm-new>Start new model</button></div>';
    };
    if (canLeaveEditor(show)) show();
  }
  if (target.hasAttribute('data-confirm-new'))
    commit({ type: 'new-model' }, () => showClassEditor(S.sel));
});
document.addEventListener('keydown', (ev) => {
  if (shareDialog.open || exportDialog.open || discardDialog.open) return;
  const typing = ev.target.closest('input,textarea,select,[contenteditable="true"]');
  if (ev.key === 'Escape' && connection) {
    ev.preventDefault();
    cancelConnection();
    return;
  }
  if (typing) return;
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') {
    ev.preventDefault();
    ev.shiftKey ? travel(redoStack, undoStack) : travel(undoStack, redoStack);
  }
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'y') {
    ev.preventDefault();
    travel(redoStack, undoStack);
  }
  if (connection && (ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('.card')) {
    ev.preventDefault();
    connectionClick(ev.target.closest('.card').dataset.id);
  }
});
