/* ---------- model export ---------- */
const exportFormats = {
  readable: {
    help: 'Explicit classes, types, keys, and relationships. Inherited attributes include their origin.',
    copy: 'Copy JSON',
  },
  brief: {
    help: 'A compact, readable model brief to paste into an AI chat or documentation.',
    copy: 'Copy brief',
  },
  design: {
    help: 'An exact backup of the model, layout, and view. Restore it with View → Import design.',
    copy: 'Copy JSON',
  },
};
let exportCopyRevision = 0;
function refreshExport() {
  exportCopyRevision++;
  $('#export-format').disabled = false;
  exportDocument = null;
  exportFeedback.textContent = '';
  const format = $('#export-format').value;
  $('#export-format-help').textContent = exportFormats[format].help;
  $('#export-copy').textContent = exportFormats[format].copy;
  try {
    exportDocument = ModelExport.document(exportSnapshot, format);
    exportPreview.value = exportDocument.contents;
    const summary = exportDocument.summary;
    $('#export-summary').innerHTML =
      `<div class="export-model-name">${esc(exportSnapshot.model.title || 'Domain Model')}</div><div class="export-stats">${[
        ['classes', summary.classes],
        ['declared attributes', summary.attributes],
        ['relationships', summary.relationships],
      ]
        .map(([label, n]) => `<div><strong>${n}</strong><span>${label}</span></div>`)
        .join(
          ''
        )}</div><p>${summary.domainAreas} domain areas · ${summary.enumerations} enumerations · ${summary.valueTypes} value types</p>`;
    const size = new TextEncoder().encode(exportDocument.contents).length;
    $('#export-file-info').textContent =
      exportDocument.filename +
      ' · ' +
      (size < 1024 ? size + ' B' : (size / 1024).toFixed(size < 10240 ? 1 : 0) + ' KB');
    $('#export-download').disabled = false;
    $('#export-copy').disabled = false;
  } catch (error) {
    exportPreview.value = '';
    $('#export-file-info').textContent = '';
    exportFeedback.textContent = error.message;
    $('#export-download').disabled = true;
    $('#export-copy').disabled = true;
  }
}
$('#export-model').onclick = () => {
  exportSnapshot = JSON.parse(JSON.stringify(designSnapshot()));
  $('#export-draft-note').hidden = !editorIsDirty();
  refreshExport();
  exportDialog.showModal();
};
$('#export-close').onclick = () => exportDialog.close();
$('#export-return-to-edit').onclick = () => {
  exportDialog.close();
  panel.querySelector('form [type="submit"]')?.focus();
};
$('#export-format').onchange = refreshExport;
$('#export-download').onclick = () => {
  if (!exportDocument) return;
  try {
    const url = URL.createObjectURL(
        new Blob([exportDocument.contents], { type: exportDocument.mimeType })
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = exportDocument.filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    exportFeedback.textContent = 'Download started: ' + exportDocument.filename;
  } catch {
    exportFeedback.textContent = 'Download could not start. Use Copy or select the preview text.';
  }
};
$('#export-copy').onclick = async () => {
  if (!exportDocument) return;
  const stamp = ++exportCopyRevision,
    button = $('#export-copy'),
    format = $('#export-format'),
    contents = exportDocument.contents;
  button.disabled = true;
  format.disabled = true;
  button.textContent = 'Copying…';
  try {
    try {
      await navigator.clipboard.writeText(contents);
    } catch (error) {
      exportPreview.closest('details').open = true;
      exportPreview.focus();
      exportPreview.select();
      if (!document.execCommand('copy')) throw error;
    }
    if (stamp === exportCopyRevision)
      exportFeedback.textContent = 'Copied. Paste into your AI chat or another tool.';
  } catch {
    if (stamp === exportCopyRevision) {
      exportPreview.closest('details').open = true;
      exportPreview.focus();
      exportPreview.select();
      exportFeedback.textContent = 'Select the preview text and copy it.';
    }
  } finally {
    if (stamp === exportCopyRevision) {
      button.disabled = false;
      format.disabled = false;
      button.textContent = exportFormats[format.value].copy;
    }
  }
};
