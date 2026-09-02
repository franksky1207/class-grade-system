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

  function installTrendHelp(win) {
    const started = Date.now();
    const timer = setInterval(() => {
      try {
        if (win.closed) { clearInterval(timer); return; }
        const doc = win.document;
        const top = doc.querySelector('.top');
        const panel = doc.querySelector('.panel');
        if (!top || !panel) {
          if (Date.now() - started > 15000) clearInterval(timer);
          return;
        }
        if (doc.getElementById('trendHelpDetails')) { clearInterval(timer); return; }

        const style = doc.createElement('style');
        style.textContent = '.trend-help{margin:0 0 14px;border:1px solid #dbeafe;background:#f8fbff;border-radius:14px;padding:10px 12px;color:#475569;font-size:13px;line-height:1.7}.trend-help summary{cursor:pointer;font-weight:900;color:#1d4ed8}.trend-help-body{margin-top:9px;padding-top:9px;border-top:1px solid #dbeafe}.trend-help-body p{margin:6px 0}.trend-help-formula{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#fff;border:1px solid #e5e7eb;border-radius:9px;padding:8px 9px;margin:8px 0;overflow:auto}';
        doc.head.appendChild(style);

        const details = doc.createElement('details');
        details.id = 'trendHelpDetails';
        details.className = 'trend-help';
        details.innerHTML = `
          <summary>以班級百分位觀察學生在不同考試中的相對位置變化。　判讀說明</summary>
          <div class="trend-help-body">
            <p><b>班級百分位：</b>每次考試都依當次實際有成績的學生重新計算。百分位越高，代表該次考試在班級中的相對位置越前。</p>
            <div class="trend-help-formula">百分位＝（低於該生成績的人數＋0.5×同分人數）÷實際應試人數×100</div>
            <p>採 midrank 計算，因此即使是全班最高分，百分位也不一定剛好是 100。</p>
            <p><b>分析範圍：</b>可選近5次、近10次、近15次、自訂最近 N 次或全部。若實際有成績的次數不足，就顯示現有次數。空白不列入，0 分是有效成績。</p>
            <p><b>時間軸：</b>X 軸依實際考試日期排列；同一天不同考試仍分別顯示並小幅錯開。資料很多時只抽稀日期標籤，不刪除資料點。</p>
            <p><b>節點資料：</b>桌機滑過、手機點擊節點，可查看日期、科目、完整考試內容、原始分數、班平均、班級百分位、名次與應試人數。</p>
            <p><b>資料處理：</b>所有分析都在瀏覽器即時計算，不新增 Google Sheet 欄位，也不會寫回 Google 試算表。</p>
          </div>`;
        top.insertAdjacentElement('afterend', details);
        clearInterval(timer);
      } catch (_) {
        if (Date.now() - started > 15000) clearInterval(timer);
      }
    }, 100);
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
      installTrendHelp(win);
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
