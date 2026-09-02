// Responsive UI polish and confirmed Google sync timestamp display.
(function () {
  const LAST_SYNC_KEY = 'class-grade-system-last-google-sync';
  const SWIPE_HINT_KEY = 'class-grade-system-overview-swipe-hint-seen';

  function injectStyles() {
    if (document.getElementById('teacherUiPolishStyles')) return;
    const style = document.createElement('style');
    style.id = 'teacherUiPolishStyles';
    style.textContent = `
      #lastSyncText{font-size:12px;color:var(--muted);white-space:nowrap}
      #mobileSubjectPicker{display:none;margin-top:8px}
      #overviewTable .sticky-table th:nth-child(1),
      #overviewTable .sticky-table td:nth-child(1){min-width:60px;width:60px;max-width:60px;padding-left:8px;padding-right:8px;text-align:center}
      #overviewTable .sticky-table th:nth-child(2),
      #overviewTable .sticky-table td:nth-child(2){left:60px;min-width:104px;width:104px;max-width:104px}
      #overviewTable .sticky-table th:nth-child(n+3),
      #overviewTable .sticky-table td:nth-child(n+3){min-width:118px;text-align:center}
      .overview-swipe-hint{display:flex;align-items:center;justify-content:center;gap:7px;margin:8px 0 10px;padding:8px 10px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:13px;font-weight:700}
      .overview-swipe-hint .arrow{font-size:18px;line-height:1}
      #genericModal.exam-view-compact .tablewrap{overflow-x:hidden}
      #genericModal.exam-view-compact table{min-width:0;width:100%;table-layout:fixed}
      #genericModal.exam-view-compact th,
      #genericModal.exam-view-compact td{padding-left:10px;padding-right:10px}
      #genericModal.exam-view-compact th:nth-child(1),
      #genericModal.exam-view-compact td:nth-child(1){width:20%;text-align:left}
      #genericModal.exam-view-compact th:nth-child(2),
      #genericModal.exam-view-compact td:nth-child(2){width:52%;text-align:left;overflow:hidden;text-overflow:ellipsis}
      #genericModal.exam-view-compact th:nth-child(3),
      #genericModal.exam-view-compact td:nth-child(3){width:28%;text-align:center}
      @media(max-width:767px){
        #mobileSubjectPicker{display:block}
        .header-inner{display:grid;grid-template-columns:minmax(0,1fr);align-items:stretch;gap:8px;padding:10px 12px}
        .header-inner>div:first-child{min-width:0}
        .header-inner .brand{font-size:16px;line-height:1.25}
        #headerClassText{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
        .top-actions{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;align-items:center;justify-content:stretch}
        .top-actions .class-switch{grid-column:1/-1;width:100%;max-width:none;min-width:0;padding-top:8px;padding-bottom:8px}
        #saveStatus{grid-column:1;justify-self:start;min-width:0}
        #helpBtn{grid-column:2;grid-row:2;justify-self:end;padding:7px 10px;white-space:nowrap}
        #lastSyncText{grid-column:1/-1;justify-self:start;white-space:normal}
        .page>.card.pad>.head{align-items:flex-start;gap:10px}
        .page>.card.pad>.head .page-hero{min-width:0;flex:1}
        .page>.card.pad>.head .page-hero>div{min-width:0}
        .page>.card.pad>.head .title{font-size:21px}
        .mobile-back{width:42px;height:42px;min-width:42px;padding:0;border-radius:999px;font-size:0;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}
        .mobile-back::before{content:'←';font-size:22px;line-height:1;font-weight:800}
        #overviewTable .sticky-table th:nth-child(1),
        #overviewTable .sticky-table td:nth-child(1){min-width:54px;width:54px;max-width:54px;padding-left:6px;padding-right:6px}
        #overviewTable .sticky-table th:nth-child(2),
        #overviewTable .sticky-table td:nth-child(2){left:54px;min-width:92px;width:92px;max-width:92px;padding-left:8px;padding-right:8px;overflow:hidden;text-overflow:ellipsis}
        #overviewTable .sticky-table th:nth-child(n+3),
        #overviewTable .sticky-table td:nth-child(n+3){min-width:102px;padding-left:8px;padding-right:8px}
        #overviewTable .sticky-table th:nth-child(n+3){white-space:normal;line-height:1.35}
        #genericModal.exam-view-compact .modal-card{width:min(520px,96vw);padding:16px}
        #genericModal.exam-view-compact th,
        #genericModal.exam-view-compact td{padding:8px 9px}
        #genericModal.exam-view-compact th:nth-child(1),
        #genericModal.exam-view-compact td:nth-child(1){width:18%}
        #genericModal.exam-view-compact th:nth-child(2),
        #genericModal.exam-view-compact td:nth-child(2){width:54%}
        #genericModal.exam-view-compact th:nth-child(3),
        #genericModal.exam-view-compact td:nth-child(3){width:28%}
      }
    `;
    document.head.appendChild(style);
  }

  function enhanceBackButtons() {
    ['entry','overview','records','students','settings'].forEach(id => {
      const btn = document.querySelector(`#${id} .head > button[data-page="dash"]`);
      if (!btn) return;
      btn.classList.add('mobile-back');
      btn.setAttribute('aria-label', '回主介面');
      btn.setAttribute('title', '回主介面');
    });
  }

  function ensureLastSyncText() {
    let el = document.getElementById('lastSyncText');
    if (el) return el;
    const status = document.getElementById('saveStatus');
    if (!status?.parentElement) return null;
    el = document.createElement('span');
    el.id = 'lastSyncText';
    status.insertAdjacentElement('afterend', el);
    return el;
  }

  function sameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function formatLastSync(ts) {
    const d = new Date(Number(ts));
    if (!Number.isFinite(d.getTime())) return '';
    const now = new Date();
    const time = d.toLocaleTimeString('zh-TW', { hour:'2-digit', minute:'2-digit', hour12:false });
    if (sameLocalDay(d, now)) return `最近同步：今天 ${time}`;
    const date = d.toLocaleDateString('zh-TW', { month:'numeric', day:'numeric' });
    return `最近同步：${date} ${time}`;
  }

  function renderLastSync() {
    const el = ensureLastSyncText();
    if (!el) return;
    let ts = '';
    try { ts = localStorage.getItem(LAST_SYNC_KEY) || ''; } catch (_) {}
    el.textContent = ts ? formatLastSync(ts) : '最近同步：尚無紀錄';
  }

  function installSyncTimestampObserver() {
    const status = document.getElementById('saveStatus');
    if (!status || status.__lastSyncObserved) return;
    status.__lastSyncObserved = true;
    let sawSaving = (status.textContent || '').includes('儲存中');
    new MutationObserver(() => {
      const text = status.textContent || '';
      if (text.includes('儲存中')) {
        sawSaving = true;
        return;
      }
      if (text.includes('儲存失敗')) {
        sawSaving = false;
        return;
      }
      if (text.includes('✓ 已儲存') && sawSaving) {
        sawSaving = false;
        const ts = String(Date.now());
        try { localStorage.setItem(LAST_SYNC_KEY, ts); } catch (_) {}
        renderLastSync();
      }
    }).observe(status, { childList:true, characterData:true, subtree:true });
  }

  function showOverviewSwipeHint() {
    if (window.innerWidth > 767) return;
    try { if (localStorage.getItem(SWIPE_HINT_KEY) === '1') return; } catch (_) {}
    const wrap = document.getElementById('overviewTable');
    if (!wrap || !document.getElementById('overview')?.classList.contains('active')) return;
    if (wrap.scrollWidth <= wrap.clientWidth + 4) return;
    if (document.getElementById('overviewSwipeHint')) return;

    const hint = document.createElement('div');
    hint.id = 'overviewSwipeHint';
    hint.className = 'overview-swipe-hint';
    hint.innerHTML = '<span class="arrow">↔</span><span>表格可以左右滑動，查看其他考試</span>';
    wrap.insertAdjacentElement('beforebegin', hint);
    try { localStorage.setItem(SWIPE_HINT_KEY, '1'); } catch (_) {}
    setTimeout(() => hint.remove(), 5000);
  }

  function installOverviewSwipeHint() {
    document.addEventListener('click', event => {
      const btn = event.target?.closest?.('button[data-page="overview"]');
      if (!btn) return;
      setTimeout(showOverviewSwipeHint, 120);
    }, true);
  }

  function resetRecordFilters() {
    const start = document.getElementById('recordStart');
    const end = document.getElementById('recordEnd');
    const subject = document.getElementById('recordSubject');
    const key = document.getElementById('recordKey');
    const sort = document.getElementById('recordSort');
    if (start) start.value = '';
    if (end) end.value = '';
    if (subject) subject.value = '';
    if (key) key.value = '';
    if (sort) sort.value = 'desc';
  }

  function installRecordFilterDefaults() {
    document.addEventListener('click', event => {
      const btn = event.target?.closest?.('button[data-page="records"]');
      if (!btn) return;
      resetRecordFilters();
    }, true);
  }

  function refreshMobileSubjectPicker() {
    const input = document.getElementById('manualSubject');
    if (!input) return;
    let picker = document.getElementById('mobileSubjectPicker');
    if (!picker) {
      picker = document.createElement('select');
      picker.id = 'mobileSubjectPicker';
      picker.className = 'field';
      picker.setAttribute('aria-label', '選擇既有科目');
      input.insertAdjacentElement('afterend', picker);
      picker.addEventListener('change', () => {
        if (!picker.value) return;
        input.value = picker.value;
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new Event('change', { bubbles:true }));
        picker.value = '';
      });
    }
    let subjects = [];
    try {
      const c = typeof currentClass === 'function' ? currentClass() : null;
      subjects = [...new Set((c?.exams || []).map(e => String(e.subject || '').trim()).filter(Boolean))].sort();
    } catch (_) {}
    picker.innerHTML = '<option value="">選擇既有科目…</option>' + subjects.map(s => {
      const option = document.createElement('option');
      option.value = s;
      option.textContent = s;
      return option.outerHTML;
    }).join('');
    picker.hidden = subjects.length === 0;
  }

  function installMobileSubjectPicker() {
    refreshMobileSubjectPicker();
    document.addEventListener('click', event => {
      const btn = event.target?.closest?.('button');
      if (!btn) return;
      if (btn.dataset?.page === 'entry' || btn.dataset?.entryMode === 'manual') {
        setTimeout(refreshMobileSubjectPicker, 0);
      }
    }, true);
  }

  function syncExamViewCompactClass() {
    const modal = document.getElementById('genericModal');
    if (!modal) return;
    modal.classList.remove('exam-view-compact');
    if (!modal.classList.contains('open')) return;
    if (modal.querySelector('input,select,textarea')) return;
    const heads = [...modal.querySelectorAll('thead th')].map(th => th.textContent.trim());
    if (heads.length === 3 && heads[0] === '座號' && heads[1] === '姓名' && heads[2] === '成績') {
      modal.classList.add('exam-view-compact');
    }
  }

  function installExamViewCompactLayout() {
    const modal = document.getElementById('genericModal');
    if (!modal || modal.__examCompactObserved) return;
    modal.__examCompactObserved = true;
    new MutationObserver(() => setTimeout(syncExamViewCompactClass, 0))
      .observe(document.getElementById('genericModalCard') || modal, { childList:true, subtree:true });
  }

  injectStyles();
  enhanceBackButtons();
  renderLastSync();
  installSyncTimestampObserver();
  installOverviewSwipeHint();
  installRecordFilterDefaults();
  installMobileSubjectPicker();
  installExamViewCompactLayout();
})();
