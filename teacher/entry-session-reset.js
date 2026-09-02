// Reset transient grade-entry UI whenever the teacher starts a new entry session.
(function () {
  function resetEntrySession() {
    try { parsedExcel = []; } catch (_) {}

    const paste = document.getElementById('excelPaste');
    const preview = document.getElementById('excelPreview');
    if (paste) paste.value = '';
    if (preview) preview.innerHTML = '';

    document.querySelectorAll('[data-entry-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.entryMode === 'manual');
    });
    const manual = document.getElementById('manualEntry');
    const excel = document.getElementById('excelEntry');
    if (manual) manual.style.display = 'block';
    if (excel) excel.style.display = 'none';
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button[data-page="entry"]');
    if (!button) return;
    setTimeout(resetEntrySession, 0);
  }, true);

  // Also normalize the state when a saved page restores directly into entry.
  setTimeout(() => {
    if (document.getElementById('entry')?.classList.contains('active')) resetEntrySession();
  }, 0);

  window.EntrySessionReset = { reset: resetEntrySession };
})();
