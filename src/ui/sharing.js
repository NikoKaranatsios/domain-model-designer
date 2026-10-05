/* ---------- keep the complete design in the URL ---------- */
let urlReady = false,
  urlBlocked = !!loadError,
  saveTimer = 0,
  savePromise = null,
  revision = 0,
  savedRevision = -1,
  lastJSON = '',
  currentToken = incoming;
const shareDialog = $('#share-dialog'),
  shareField = $('#share-link'),
  shareFeedback = $('#share-feedback'),
  copyButton = $('#copy-link');
const exportDialog = $('#export-dialog'),
  exportPreview = $('#export-preview'),
  exportFeedback = $('#export-feedback'),
  discardDialog = $('#discard-dialog');
let exportDocument = null,
  exportSnapshot = null,
  pendingLeave = null;
function notice(message, reset = false) {
  $('#notice-text').textContent = message;
  $('#use-default').hidden = !reset;
  $('#notice').hidden = false;
}
function designSnapshot() {
  const layout = {
    ...BASE,
    C: GR.C,
    R: GR.R,
    gx: GR.gx,
    gy: GR.gy,
    cell: ENT.map((e) => GR.cell[e.id]),
    nodes: Object.fromEntries(ENT.map((e) => [e.id, { w: nodes[e.id].w, h: nodes[e.id].h }])),
    routes,
  };
  const camera = S.auto
    ? { fit: true }
    : {
        fit: false,
        zoom: +S.z.toFixed(6),
        x: +((stage.clientWidth / 2 - S.tx) / S.z).toFixed(3),
        y: +((stage.clientHeight / 2 - S.ty) / S.z).toFixed(3),
      };
  return {
    v: 1,
    model: MODEL,
    layout,
    view: {
      hidden: [...S.off].sort(),
      selected: S.sel,
      search: S.q,
      camera,
      attributes: S.attributes,
      labels: S.labels,
    },
  };
}
function queueURLUpdate() {
  if (!urlReady) return;
  revision++;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () =>
      syncURL().catch((error) => notice('The design link could not be updated. ' + error.message)),
    350
  );
}
async function syncURL(force = false) {
  clearTimeout(saveTimer);
  if (!urlReady || (urlBlocked && !force)) return null;
  if (force && urlBlocked) {
    urlBlocked = false;
    $('#notice').hidden = true;
  }
  if (savePromise) {
    await savePromise;
    return savedRevision < revision ? syncURL(force) : location.href;
  }
  savePromise = (async () => {
    while (savedRevision < revision) {
      if (drag) return null;
      const stamp = revision,
        json = JSON.stringify(designSnapshot());
      if (json === lastJSON) {
        savedRevision = stamp;
        continue;
      }
      const payload = await DesignURL.encode(JSON.parse(json));
      if (stamp !== revision) continue;
      const url = new URL(location.href),
        hash = new URLSearchParams(url.hash.includes('=') ? url.hash.slice(1) : '');
      url.searchParams.delete('model');
      hash.set('model', payload);
      url.hash = hash.toString();
      history.replaceState(history.state, '', url.href);
      currentToken = payload;
      lastJSON = json;
      savedRevision = stamp;
      shareField.value = url.href;
    }
    return location.href;
  })();
  try {
    return await savePromise;
  } finally {
    savePromise = null;
  }
}
$('#share').onclick = async () => {
  $('#share-draft-note').hidden = !editorIsDirty();
  shareDialog.showModal();
  copyButton.disabled = true;
  shareFeedback.textContent = 'Preparing link…';
  $('#local-link-note').hidden =
    location.protocol !== 'file:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  try {
    shareField.value = await syncURL(true);
    copyButton.disabled = false;
    shareFeedback.textContent = 'Ready to share.';
  } catch (error) {
    shareFeedback.textContent = error.message;
  }
};
$('#share-close').onclick = () => shareDialog.close();
shareField.onclick = () => shareField.select();
copyButton.onclick = async () => {
  copyButton.disabled = true;
  try {
    const link = await syncURL(true);
    shareField.value = link;
    try {
      await navigator.clipboard.writeText(link);
    } catch (error) {
      shareField.focus();
      shareField.select();
      if (!document.execCommand('copy')) throw error;
    }
    shareFeedback.textContent = 'Link copied. Send it to share this design.';
  } catch {
    shareField.focus();
    shareField.select();
    shareFeedback.textContent = 'Select the link and copy it.';
  } finally {
    copyButton.disabled = false;
  }
};
$('#use-default').onclick = () => {
  urlBlocked = false;
  $('#notice').hidden = true;
  queueURLUpdate();
};
function navigationChanged() {
  if (DesignURL.token(location.href) !== currentToken) location.reload();
}
window.addEventListener('hashchange', navigationChanged);
window.addEventListener('popstate', navigationChanged);
