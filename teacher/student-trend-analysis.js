// Add a teacher-only trend-analysis entry to each student row.
(function () {
  const SESSION_KEY = 'class-grade-system-student-trend';
  let observer = null;

  function text(v) { return String(v ?? '').trim(); }
  function current() {
    try { return typeof currentClass === 'function' ? currentClass() : null; }
    catch (_) { return null; }
  }

  function compactClassPayload(c, studentIndex) {
    const student = c?.students?.[studentIndex];
    if (!c || !student) return null;
    return {
      class: {
        name: text(c.name),
        year: text(c.year),
        term: text(c.term)
      },
      student: {
        seat: text(student.seat),
        name: text(student.name),
        account: text(student.account)
      },
      exams: (c.exams || []).map((exam, sourceIndex) => ({
        date: text(exam?.date),
        subject: text(exam?.subject),
        name: text(exam?.name),
        sourceIndex,
        scores: (exam?.scores || []).map(s => ({
          seat: text(s?.seat),
          name: text(s?.name),
          value: s?.value === null || s?.value === undefined ? '' : String(s.value)
        }))
      }))
    };
  }

  function writeLoading(win, name) {
    try {
      win.document.open();
      win.document.write(`<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>學生趨勢分析</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#475569;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC",sans-serif}.box{text-align:center}.title{font-size:22px;font-weight:900;color:#111827;margin-bottom:8px}</style></head><body><div class="box"><div class="title">學生趨勢分析</div><div>正在開啟 ${String(name || '學生')} 的分析資料……</div></div></body></html>`);
      win.document.close();
    } catch (_) {}
  }

  function openTrend(studentIndex) {
    const c = current();
    const payload = compactClassPayload(c, studentIndex);
    if (!payload) return;

    const win = window.open('about:blank', '_blank');
    if (!win) {
      if (typeof toast === 'function') toast('瀏覽器阻擋了新分頁，請允許此網站開啟彈出式視窗。');
      return;
    }
    writeLoading(win, payload.student.name);

    try {
      win.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data: payload, savedAt: Date.now() }));
      win.location.replace(`${location.origin}/teacher/trend/`);
    } catch (err) {
      try {
        win.document.body.innerHTML = `<div style="font-family:system-ui;padding:30px;color:#b91c1c">無法開啟趨勢分析：${text(err?.message || '請稍後再試')}</div>`;
      } catch (_) {}
    }
  }

  function decorateRows() {
    const table = document.querySelector('#studentTable table');
    if (!table) return;
    table.querySelectorAll('tbody tr').forEach((row, index) => {
      const actions = row.children?.[4]?.querySelector('.actions');
      if (!actions || actions.querySelector('[data-student-trend]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.studentTrend = String(index);
      button.textContent = window.matchMedia('(max-width: 767px)').matches ? '趨勢' : '趨勢分析';
      button.title = '開啟學生趨勢分析';
      button.addEventListener('click', () => openTrend(index));
      actions.insertBefore(button, actions.firstChild);
    });
  }

  function install() {
    const host = document.getElementById('studentTable');
    if (!host) return false;
    decorateRows();
    if (!observer) {
      observer = new MutationObserver(decorateRows);
      observer.observe(host, { childList: true, subtree: true });
    }
    return true;
  }

  document.addEventListener('click', event => {
    if (event.target?.closest?.('button[data-page="students"]')) setTimeout(install, 0);
  }, true);

  const started = Date.now();
  const wait = () => {
    if (install()) return;
    if (Date.now() - started < 30000) setTimeout(wait, 200);
  };
  wait();

  window.StudentTrendAnalysis = { open: openTrend };
})();
