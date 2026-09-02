// Reset transient grade-entry UI whenever the teacher starts a new entry session.
(function () {
  function localToday() {
    if (window.GoogleAuth?.localToday) return window.GoogleAuth.localToday();
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function resetEntrySession() {
    try { parsedExcel = []; } catch (_) {}

    const today = localToday();
    try {
      if (typeof app !== 'undefined') {
        app.examDate = today;
        if (typeof save === 'function') save();
      }
    } catch (_) {}

    const manualDate = document.getElementById('manualDate');
    const excelDate = document.getElementById('excelDate');
    if (manualDate) manualDate.value = today;
    if (excelDate) excelDate.value = today;

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
