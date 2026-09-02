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

  function installAnalysisHelp(win) {
    const started = Date.now();
    const timer = setInterval(() => {
      try {
        if (win.closed) { clearInterval(timer); return; }
        const doc = win.document;
        const top = doc.querySelector('.top');
        const panel = doc.querySelector('.panel');
        const oldHelp = doc.querySelector('details.help');
        if (!top || !panel) {
          if (Date.now() - started > 15000) clearInterval(timer);
          return;
        }
        if (doc.getElementById('classAnalysisHelpDetails')) { clearInterval(timer); return; }

        if (oldHelp) oldHelp.style.display = 'none';
        const style = doc.createElement('style');
        style.textContent = '.analysis-help{margin:14px 0 0;border:1px solid #bfdbfe;background:#fff;border-radius:14px;overflow:hidden;color:#475569;font-size:13px;line-height:1.72;box-shadow:0 4px 14px rgba(37,99,235,.06)}.analysis-help summary{cursor:pointer;list-style:none;padding:12px 13px;display:flex;align-items:center;gap:11px}.analysis-help summary::-webkit-details-marker{display:none}.analysis-help-icon{flex:0 0 34px;width:34px;height:34px;border-radius:10px;background:#dbeafe;color:#1d4ed8;display:grid;place-items:center;font-size:18px;font-weight:900}.analysis-help-copy{min-width:0;flex:1}.analysis-help-title{font-size:14px;font-weight:900;color:#1e3a8a;line-height:1.35}.analysis-help-sub{font-size:12px;color:#64748b;margin-top:2px;line-height:1.45}.analysis-help-action{flex:0 0 auto;color:#2563eb;font-size:12px;font-weight:900;white-space:nowrap;border:1px solid #bfdbfe;background:#eff6ff;border-radius:999px;padding:5px 9px}.analysis-help[open] .analysis-help-action{background:#2563eb;color:#fff;border-color:#2563eb}.analysis-help-body{padding:11px 13px 12px;border-top:1px solid #dbeafe;background:#f8fbff}.analysis-help-body p{margin:6px 0}.analysis-help-body ul{margin:6px 0 6px 18px;padding:0}.analysis-help-body li{margin:4px 0}.analysis-help-note{margin-top:8px;background:#fff;border:1px solid #e5e7eb;border-radius:9px;padding:8px 9px}@media(max-width:560px){.analysis-help summary{align-items:flex-start}.analysis-help-action{margin-top:3px}.analysis-help-sub{max-width:205px}}';
        doc.head.appendChild(style);

        const details = doc.createElement('details');
        details.id = 'classAnalysisHelpDetails';
        details.className = 'analysis-help';
        details.innerHTML = `
          <summary><span class="analysis-help-icon">ⓘ</span><span class="analysis-help-copy"><span class="analysis-help-title">高位、上升、波動怎麼判定？</span><span class="analysis-help-sub">查看位置、變化型態、聚焦學生與節點的完整規則</span></span><span class="analysis-help-action">查看判定說明 ▾</span></summary>
          <div class="analysis-help-body">
            <p><b>位置與變化型態是兩個獨立條件。</b>兩邊都可以選「全部」，所以可以只看「高位」、只看「下降」，也可以交叉篩選例如「高位＋穩定」或「低位＋上升」。</p>
            <p><b>位置分類：</b>依目前所選科目與分析範圍內，各學生的平均班級百分位判定：</p>
            <ul><li>高位：平均百分位 ≥ 70</li><li>中位：平均百分位 ≥ 30 且未滿 70</li><li>低位：平均百分位 &lt; 30</li></ul>
            <p><b>變化型態：</b>系統先計算所選範圍內百分位的整體線性趨勢。整體上升幅度 ≥ 12 個百分位點判為「上升」；≤ -12 判為「下降」。若未達上升／下降門檻，但相鄰考試百分位的平均絕對變動 ≥ 15，判為「波動較大」；其餘判為「穩定」。</p>
            <p><b>聚焦學生：</b>篩選後可由「聚焦學生」選擇座號＋姓名。選定後該生線條會加粗，其他學生淡化；選回「全部學生」則回到群體視圖。</p>
            <p><b>節點資料：</b>桌機滑過、手機點擊節點，可查看日期、學生、科目、完整考試內容、原始分數、班平均、班級百分位、名次與應試人數。</p>
            <p><b>分析範圍：</b>可選近5次、近10次、近15次、自訂最近 N 次或全部。若學生該科有效成績不足所選次數，就依現有資料計算。空白不計，0 分有效。</p>
            <div class="analysis-help-note"><b>資料處理：</b>所有分類、百分位與圖表都只在瀏覽器即時計算，不新增欄位、不修改原始成績，也不會寫回 Google 試算表。</div>
          </div>`;
        details.addEventListener('toggle', () => {
          const action = details.querySelector('.analysis-help-action');
          if (action) action.textContent = details.open ? '收合判定說明 ▴' : '查看判定說明 ▾';
        });
        panel.insertAdjacentElement('afterend', details);
        clearInterval(timer);
      } catch (_) {
        if (Date.now() - started > 15000) clearInterval(timer);
      }
    }, 100);
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
      installAnalysisHelp(win);
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
    button.title = '依百分位位置與近期變化分析全班學生';
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
