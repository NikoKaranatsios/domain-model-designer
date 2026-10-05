/* ---------- boot ---------- */
function syncTitle() {
  $('#top h1').textContent = MODEL.title || 'Domain Model';
  document.title = MODEL.title || 'Domain Model';
}
syncTitle();
loadCells();
place();
placeCards();
drawZones();
routeAll();
ENT.forEach((e) => cardEl[e.id].classList.toggle('off', S.off.has(e.ctx)));
$('#q').value = S.q;
drawWires();
updateModelCheck();
// Wrapped toolbars must leave room for share, zoom and mobile drawers.
function sizeControls() {
  const bottom = $('#edit-tools').getBoundingClientRect().bottom;
  document.documentElement.style.setProperty('--aux-top', Math.ceil(bottom + 10) + 'px');
}
new ResizeObserver(sizeControls).observe($('#edit-tools'));
sizeControls();
if (S.sel) showPanel(S.sel);
if (S.auto) fit(false);
else {
  S.z = view.camera.zoom;
  S.tx = stage.clientWidth / 2 - view.camera.x * S.z;
  S.ty = stage.clientHeight / 2 - view.camera.y * S.z;
  apply();
}
urlReady = true;
if (loadError)
  notice(
    typeof DecompressionStream !== 'function'
      ? 'This browser cannot open this design link. Try a current browser. Showing the example model.'
      : 'This design link may be incomplete or damaged. Showing the example model.',
    true
  );
else queueURLUpdate();
window.addEventListener('resize', () => {
  if (S.auto) fit(false);
});
requestAnimationFrame(() => {
  if (S.auto) fit(false);
});
if (document.fonts && document.fonts.ready)
  document.fonts.ready.then(() => {
    if (S.auto) fit(false);
  });
