/* Model checks always refer to saved data, including hidden classes. */
function modelReport(config = designSnapshot()) {
  return ModelExport.readable(config).validation;
}
function updateModelCheck() {
  const report = modelReport(),
    button = $('#check-model');
  button.textContent = report.issues.length ? 'Check · ' + report.issues.length : 'Check';
  button.classList.toggle('has-issues', report.status === 'issues');
  button.setAttribute(
    'aria-label',
    'Check model' + (report.issues.length ? ' · ' + report.issues.length + ' findings' : '')
  );
}
function reportSummary(report) {
  const errors = report.issues.filter((i) => i.severity === 'error').length;
  const warnings = report.issues.length - errors;
  return report.issues.length
    ? errors +
        (errors === 1 ? ' error · ' : ' errors · ') +
        warnings +
        (warnings === 1 ? ' review warning' : ' review warnings')
    : 'No issues found by the supported schema checks.';
}
function showModelReview() {
  if (!canLeaveEditor(showModelReview)) return;
  cancelConnection();
  panelMode = 'review';
  const report = modelReport(),
    body = drawer('Model checks');
  body.innerHTML = `<p class="ed-help">${esc(reportSummary(report))}</p><p class="ed-help">Checks cover the supported UML data structures, type definitions, inherited attributes and declared key conventions. Textual business rules are documented, not executed. Hidden association labels do not imply a cardinality or navigation direction.</p>${report.issues.map((i) => `<div class="ed-confirm"><strong>${i.severity === 'error' ? 'Error' : 'Review'}${i.classId ? ' · ' + esc(i.classId) : ''}</strong><p>${esc(i.message)}</p>${i.classId ? `<button class="ed-secondary" type="button" data-go="${esc(i.classId)}">Open class</button>` : ''}</div>`).join('')}<p class="ed-help">Composition requires exclusive ownership and an acyclic graph of objects. Recursive class definitions are allowed. The designer has no object records to verify.</p><p class="ed-help">PK and FK are data-model conventions. Primitive types such as UUID, Decimal and DateTime are declared extensions. This is a UML data-structure subset, not a complete UML metamodel or an XMI exchange tool.</p><a class="ed-text-btn" href="https://www.omg.org/spec/UML/2.5.1" target="_blank" rel="noopener noreferrer">OMG UML 2.5.1 reference</a>`;
}
$('#check-model').onclick = showModelReview;
