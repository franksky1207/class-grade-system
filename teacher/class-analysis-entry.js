// Add a teacher-only class-analysis entry inside the grade overview page.
(function () {
  const SESSION_KEY = 'class-grade-system-class-analysis';
  let observer = null;

  function text(v) { return String(v ?? '').trim(); }
  function current() {
    try { return typeof currentClass === 'function' ? currentClass() : null; }
    catch (_) { return null; }
  }

  function compactPayload(c) {
    if (!c) return null;
    return {
      class: {
        name: text(c.name),
        year: text(c.year),
        term: text(c.term)
      },
      students: (c.students || []).map(s => ({
        seat: text(s?.seat),
        name: text(s?.name)
      })),
      exams: (c.exams || []).map((exam, sourceIndex) => ({
        date: text(exam?.date),
        subject: text(exam?.subject),
        name: text(exam?.name),
        sourceIndex,
        scores: (exam?.scores || []).map(s => ({
          seat: text(s?.seat),
          value: s?.value === null || s?.value === undefined ? '' : String(s.value)
        }))
      }))
    };
  }

  function writeLoading(win) {
    try {
      win.document.open();
      win.document.write(`<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>班級分析</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#475569;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC",sans-serif}.box{text-align:center}.title{font-size:22px;font-weight:900;color:#111827;margin-bottom:8px}</style></head><body><div class="box"><div class="title">班級分析</div><div>正在整理目前班級資料……</div></div></body></html>`);
      win.document.close();
    } catch (_) {}
  }

  function openAnalysis() {
    const payload = compactPayload(current());
    if (!payload) return;

    const win = window.open('about:blank', '_blank');
    if (!win) {
      if (typeof toast === 'function') toast('瀏覽器阻擋了新分頁，請允許此網站開啟彈出式視窗。');
      return;
    }
    writeLoading(win);

    try {
      win.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data: payload, savedAt: Date.now() }));
      win.location.replace(`${location.origin}/teacher/class-analysis/`);
    } catch (err) {
      try {
        win.document.body.innerHTML = `<div style="font-family:system-ui;padding:30px;color:#b91c1c">無法開啟班級分析：${text(err?.message || '請稍後再試')}</div>`;
      } catch (_) {}
    }
  }

  function installButton() {
    const page = document.getElementById('overview');
    if (!page) return false;
    const head = page.querySelector('.head');
    if (!head) return false;
    if (head.querySelector('[data-class-analysis]')) return true;

    const back = head.querySelector('button[data-page="dash"]');
    if (!back) return false;

    let actions = head.querySelector('[data-overview-head-actions]');
    if (!actions) {
      actions = document.createElement('div');
      actions.dataset.overviewHeadActions = '1';
      actions.className = 'actions';
      back.parentNode.insertBefore(actions, back);
      actions.appendChild(back);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn soft';
    button.dataset.classAnalysis = '1';
    button.textContent = '班級分析';
    button.title = '開啟全班百分位趨勢分析';
    button.addEventListener('click', openAnalysis);
    actions.insertBefore(button, back);
    return true;
  }

  function install() {
    const page = document.getElementById('overview');
    if (!page) return false;
    installButton();
    if (!observer) {
      observer = new MutationObserver(installButton);
      observer.observe(page, { childList: true, subtree: true });
    }
    return true;
  }

  document.addEventListener('click', event => {
    if (event.target?.closest?.('button[data-page="overview"]')) setTimeout(installButton, 0);
  }, true);

  const started = Date.now();
  const wait = () => {
    if (install()) return;
    if (Date.now() - started < 30000) setTimeout(wait, 200);
  };
  wait();

  window.ClassAnalysis = { open: openAnalysis };
})();
