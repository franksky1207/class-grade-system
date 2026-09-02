// Reset transient student-management paste input whenever the teacher starts a new student-management session.
(function () {
  function resetStudentSession() {
    const paste = document.getElementById('studentPaste');
    if (paste) paste.value = '';
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button[data-page="students"]');
    if (!button) return;
    setTimeout(resetStudentSession, 0);
  }, true);

  setTimeout(() => {
    if (document.getElementById('students')?.classList.contains('active')) resetStudentSession();
  }, 0);

  window.StudentSessionReset = { reset: resetStudentSession };
})();
