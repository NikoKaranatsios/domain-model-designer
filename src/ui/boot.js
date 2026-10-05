/* ---------- boot ---------- */
function syncTitle() {
  $('#top h1').textContent = MODEL.title || 'FCP Domain Model';
  document.title = MODEL.title || 'FCP Domain Model';
}
syncTitle();
loadCells();
place();
placeCards();
drawZones();
routeAll();
ENT.forEach((e) => cardEl[e.id].classList.toggle('off', S.off.has(e.ctx)));
$('#q').value = S.q;
routeVirtual();
drawWires();
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
      ? 'This browser cannot open this design link. Try a current browser. Showing the default FCP model.'
      : 'This design link may be incomplete or damaged. Showing the default FCP model.',
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
