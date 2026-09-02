// Offline Google authorization UI for parent/student query service.
(function () {
  const OAUTH_START_URL = 'https://sphrceazgfrjtgeeikfp.supabase.co/functions/v1/google-oauth-start';

  function text(v) { return String(v ?? '').trim(); }

  function setStatus(message, tone = '') {
    const el = document.getElementById('parentOfflineAuthStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = tone === 'error' ? '#b91c1c' : tone === 'success' ? '#047857' : '#6b7280';
  }

  async function startAuthorization() {
    const btn = document.getElementById('parentOfflineAuthBtn');
    if (!btn) return;
    btn.disabled = true;
    setStatus('正在準備 Google 授權……');
    try {
      const token = await window.GoogleAuth.getAccessToken();
      const response = await fetch(OAUTH_START_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      let data = {};
      try { data = await response.json(); } catch (_) {}
      if (!response.ok || !data?.authorizationUrl) {
        if (response.status === 401) throw new Error('Google 登入已逾時，請重新登入後再試。');
        throw new Error('無法開始離線授權，請稍後再試。');
      }
      location.href = data.authorizationUrl;
    } catch (err) {
      setStatus(err?.message || '離線授權啟動失敗。', 'error');
      btn.disabled = false;
    }
  }

  function ensurePanel() {
    const parentPanel = document.getElementById('parentQuerySettingsPanel');
    if (!parentPanel) return false;
    if (document.getElementById('parentOfflineAuthPanel')) return true;

    const panel = document.createElement('div');
    panel.id = 'parentOfflineAuthPanel';
    panel.className = 'subpanel green';
    panel.style.marginTop = '12px';
    panel.innerHTML = `
      <div class="subpanel-title" style="margin-bottom:8px">家長離線查詢授權</div>
      <div class="small" style="line-height:1.6">啟用後，即使教師端關閉，家長查詢服務仍可讀取目前公開班級的 Google Sheet。授權憑證只保存在後端，不會寫入 GitHub 或瀏覽器。</div>
      <div class="actions" style="margin-top:10px">
        <button class="btn primary" id="parentOfflineAuthBtn" type="button">啟用家長離線查詢</button>
      </div>
      <div id="parentOfflineAuthStatus" class="small" style="margin-top:8px"></div>
    `;

    const status = document.getElementById('parentQueryPanelStatus');
    if (status) parentPanel.insertBefore(panel, status);
    else parentPanel.appendChild(panel);

    document.getElementById('parentOfflineAuthBtn')?.addEventListener('click', startAuthorization);
    return true;
  }

  function handleCallbackResult() {
    const params = new URLSearchParams(location.search);
    const result = text(params.get('googleOffline'));
    if (!result) return;

    const showResult = () => {
      if (!ensurePanel()) return false;
      if (result === 'success') {
        setStatus('✓ 家長離線查詢已啟用。', 'success');
        const btn = document.getElementById('parentOfflineAuthBtn');
        if (btn) btn.textContent = '重新授權家長離線查詢';
      } else {
        setStatus('Google 離線授權未完成，請再試一次。', 'error');
      }
      return true;
    };

    if (!showResult()) {
      const started = Date.now();
      const timer = setInterval(() => {
        if (showResult() || Date.now() - started > 15000) clearInterval(timer);
      }, 150);
    }

    try {
      params.delete('googleOffline');
      params.delete('reason');
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash || ''}`);
    } catch (_) {}
  }

  function watchForPanel() {
    if (ensurePanel()) return;
    const observer = new MutationObserver(() => {
      if (ensurePanel()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 30000);
  }

  function loadParentSubjectOrder() {
    if (document.querySelector('script[data-parent-subject-order]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/parent-subject-order.js?v=1';
    script.async = false;
    script.dataset.parentSubjectOrder = '1';
    document.head.appendChild(script);
  }

  function loadParentSubjectTouchDrag() {
    if (document.querySelector('script[data-parent-subject-touch-drag]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/parent-subject-touch-drag.js?v=2-visual';
    script.async = false;
    script.dataset.parentSubjectTouchDrag = '1';
    document.head.appendChild(script);
  }

  function loadManualExamContentFields() {
    if (document.querySelector('script[data-manual-exam-content-fields]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/manual-exam-content-fields.js?v=1';
    script.async = false;
    script.dataset.manualExamContentFields = '1';
    document.head.appendChild(script);
  }

  function loadEntrySessionReset() {
    if (document.querySelector('script[data-entry-session-reset]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/entry-session-reset.js?v=2';
    script.async = false;
    script.dataset.entrySessionReset = '1';
    document.head.appendChild(script);
  }

  function loadStudentSessionReset() {
    if (document.querySelector('script[data-student-session-reset]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/student-session-reset.js?v=1';
    script.async = false;
    script.dataset.studentSessionReset = '1';
    document.head.appendChild(script);
  }

  function loadRecordCopyTable() {
    if (document.querySelector('script[data-record-copy-table]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/record-copy-table.js?v=1';
    script.async = false;
    script.dataset.recordCopyTable = '1';
    document.head.appendChild(script);
  }

  function loadStudentParentPreview() {
    if (document.querySelector('script[data-student-parent-preview]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/student-parent-preview.js?v=1';
    script.async = false;
    script.dataset.studentParentPreview = '1';
    document.head.appendChild(script);
  }

  function loadStudentTrendAnalysis() {
    if (document.querySelector('script[data-student-trend-analysis]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/student-trend-analysis.js?v=1';
    script.async = false;
    script.dataset.studentTrendAnalysis = '1';
    document.head.appendChild(script);
  }

  function loadClassAnalysisEntry() {
    if (document.querySelector('script[data-class-analysis-entry]')) return;
    const script = document.createElement('script');
    script.src = 'teacher/class-analysis-entry.js?v=1';
    script.async = false;
    script.dataset.classAnalysisEntry = '1';
    document.head.appendChild(script);
  }

  document.addEventListener('click', event => {
    if (event.target?.closest?.('button[data-page="settings"]')) setTimeout(ensurePanel, 0);
  }, true);

  watchForPanel();
  handleCallbackResult();
  loadParentSubjectOrder();
  loadParentSubjectTouchDrag();
  loadManualExamContentFields();
  loadEntrySessionReset();
  loadStudentSessionReset();
  loadRecordCopyTable();
  loadStudentParentPreview();
  loadStudentTrendAnalysis();
  loadClassAnalysisEntry();
})();
