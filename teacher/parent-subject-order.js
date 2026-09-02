// Teacher-side ordering for subjects shown in the parent/student site.
(function () {
  const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
  const SETTING_KEY = '家長端科目顯示順序';
  const DEFAULT_ORDER = ['國文','英文','數學','地理','歷史','公民','物理','化學','地科','生物'];
  let currentSpreadsheetId = '';
  let currentSubjects = [];
  let loading = false;

  function text(v) { return String(v ?? '').trim(); }

  async function authFetch(url, options = {}) {
    const token = await window.GoogleAuth.getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
      throw new Error(detail || `Google API 發生錯誤（${response.status}）`);
    }
    return response;
  }

  function setStatus(message, tone = '') {
    const el = document.getElementById('parentSubjectOrderStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = tone === 'error' ? '#b91c1c' : tone === 'success' ? '#047857' : '#6b7280';
  }

  function defaultSort(subjects) {
    const unique = Array.from(new Set(subjects.map(text).filter(Boolean)));
    const rank = new Map(DEFAULT_ORDER.map((s, i) => [s, i]));
    return unique.slice().sort((a, b) => {
      const ai = rank.has(a) ? rank.get(a) : 999;
      const bi = rank.has(b) ? rank.get(b) : 999;
      if (ai !== bi) return ai - bi;
      return unique.indexOf(a) - unique.indexOf(b);
    });
  }

  function mergeSavedOrder(subjects, saved) {
    const configured = Array.from(new Set([...DEFAULT_ORDER, ...subjects.map(text).filter(Boolean)]));
    const configuredSet = new Set(configured);
    const ordered = [];
    (Array.isArray(saved) ? saved : []).forEach(s => {
      const v = text(s);
      if (configuredSet.has(v) && !ordered.includes(v)) ordered.push(v);
    });
    defaultSort(configured).forEach(s => { if (!ordered.includes(s)) ordered.push(s); });
    return ordered;
  }

  async function readClassData(spreadsheetId) {
    const params = new URLSearchParams();
    params.append('ranges', "'成績資料'!B2:B");
    params.append('ranges', "'班級設定'!A:B");
    params.set('majorDimension', 'ROWS');
    const data = await (await authFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`)).json();
    const ranges = Array.isArray(data?.valueRanges) ? data.valueRanges : [];
    const gradeRows = Array.isArray(ranges[0]?.values) ? ranges[0].values : [];
    const settingsRows = Array.isArray(ranges[1]?.values) ? ranges[1].values : [];
    const subjects = gradeRows.map(r => text(r?.[0])).filter(Boolean);
    let savedOrder = [];
    const hit = settingsRows.find(r => text(r?.[0]) === SETTING_KEY);
    if (hit && text(hit?.[1])) {
      try {
        const parsed = JSON.parse(text(hit[1]));
        if (Array.isArray(parsed)) savedOrder = parsed;
      } catch (_) {}
    }
    return { subjects, settingsRows, savedOrder };
  }

  async function writeOrder(spreadsheetId, order) {
    const range = encodeURIComponent("'班級設定'!A:B");
    const data = await (await authFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}`)).json();
    const rows = Array.isArray(data.values) ? data.values.map(r => [text(r?.[0]), text(r?.[1])]) : [];
    const idx = rows.findIndex(r => r[0] === SETTING_KEY);
    const row = [SETTING_KEY, JSON.stringify(order)];
    if (idx >= 0) rows[idx] = row;
    else rows.push(row);
    const endRow = Math.max(rows.length, 1);
    const writeRange = encodeURIComponent(`'班級設定'!A1:B${endRow}`);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${writeRange}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ majorDimension: 'ROWS', values: rows })
    });
  }

  function ensurePanel() {
    const parentPanel = document.getElementById('parentQuerySettingsPanel');
    if (!parentPanel) return null;
    let box = document.getElementById('parentSubjectOrderPanel');
    if (box) return box;

    box = document.createElement('div');
    box.id = 'parentSubjectOrderPanel';
    box.className = 'subpanel violet';
    box.style.marginTop = '12px';
    box.innerHTML = `
      <div class="subpanel-title" style="margin-bottom:6px">家長端科目顯示順序</div>
      <div class="small" style="margin-bottom:10px">預先提供高中常用 10 科，可先排好順序；之後若出現其他科目會自動補在最後。家長端仍只會顯示實際有成績的科目。</div>
      <div id="parentSubjectOrderClass" class="small" style="margin-bottom:8px"></div>
      <div id="parentSubjectOrderList"></div>
      <div class="actions" style="margin-top:10px">
        <button class="btn primary" id="parentSubjectOrderSaveBtn" type="button">儲存科目順序</button>
      </div>
      <div id="parentSubjectOrderStatus" class="small" style="margin-top:8px"></div>
    `;

    const status = parentPanel.querySelector('#parentQueryPanelStatus');
    if (status) parentPanel.insertBefore(box, status);
    else parentPanel.appendChild(box);

    box.querySelector('#parentSubjectOrderSaveBtn')?.addEventListener('click', saveCurrentOrder);
    return box;
  }

  function renderList() {
    const list = document.getElementById('parentSubjectOrderList');
    if (!list) return;
    if (!currentSpreadsheetId) {
      list.innerHTML = '<div class="small">請先選擇要公開的班級。</div>';
      return;
    }
    if (!currentSubjects.length) {
      list.innerHTML = '<div class="small">目前沒有可設定的科目。</div>';
      return;
    }

    list.innerHTML = currentSubjects.map((subject, index) => `
      <div class="parent-subject-order-row" draggable="true" data-index="${index}" style="display:flex;align-items:center;gap:8px;border:1px solid #ddd6fe;background:#fff;border-radius:10px;padding:9px 10px;margin-top:7px">
        <span title="拖曳排序" style="cursor:grab;color:#6b7280;font-size:18px">≡</span>
        <span style="flex:1;font-weight:800">${escapeHtml(subject)}</span>
        <button class="btn" type="button" data-move="up" data-index="${index}" style="padding:5px 9px" aria-label="上移 ${escapeHtml(subject)}">↑</button>
        <button class="btn" type="button" data-move="down" data-index="${index}" style="padding:5px 9px" aria-label="下移 ${escapeHtml(subject)}">↓</button>
      </div>`).join('');

    list.querySelectorAll('button[data-move]').forEach(btn => btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      const delta = btn.dataset.move === 'up' ? -1 : 1;
      const target = index + delta;
      if (index < 0 || target < 0 || target >= currentSubjects.length) return;
      [currentSubjects[index], currentSubjects[target]] = [currentSubjects[target], currentSubjects[index]];
      renderList();
      setStatus('順序已變更，尚未儲存。');
    }));

    let dragIndex = -1;
    list.querySelectorAll('.parent-subject-order-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragIndex = Number(row.dataset.index);
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      row.addEventListener('drop', e => {
        e.preventDefault();
        const dropIndex = Number(row.dataset.index);
        if (dragIndex < 0 || dropIndex < 0 || dragIndex === dropIndex) return;
        const [moved] = currentSubjects.splice(dragIndex, 1);
        currentSubjects.splice(dropIndex, 0, moved);
        dragIndex = -1;
        renderList();
        setStatus('順序已變更，尚未儲存。');
      });
    });
  }

  function escapeHtml(v) {
    return text(v).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  async function loadForSpreadsheet(spreadsheetId) {
    ensurePanel();
    const id = text(spreadsheetId);
    currentSpreadsheetId = id;
    currentSubjects = [];
    const classEl = document.getElementById('parentSubjectOrderClass');
    if (classEl) classEl.textContent = id ? '正在載入科目……' : '目前未選擇公開班級';
    renderList();
    if (!id) return;
    if (loading) return;
    loading = true;
    setStatus('正在載入科目順序……');
    try {
      const data = await readClassData(id);
      currentSubjects = mergeSavedOrder(data.subjects, data.savedOrder);
      const select = document.getElementById('parentQueryClassSelect');
      const label = select?.selectedOptions?.[0]?.textContent || '目前班級';
      if (classEl) classEl.textContent = `排序班級：${label}`;
      renderList();
      setStatus('科目順序已載入。', 'success');
    } catch (err) {
      currentSubjects = [];
      renderList();
      setStatus(err?.message || '科目順序載入失敗。', 'error');
    } finally {
      loading = false;
    }
  }

  async function saveCurrentOrder() {
    const btn = document.getElementById('parentSubjectOrderSaveBtn');
    if (!currentSpreadsheetId) {
      setStatus('請先選擇要公開的班級。', 'error');
      return;
    }
    if (!currentSubjects.length) {
      setStatus('目前沒有可儲存的科目。', 'error');
      return;
    }
    if (btn) btn.disabled = true;
    setStatus('正在儲存科目順序……');
    try {
      await writeOrder(currentSpreadsheetId, currentSubjects);
      setStatus('科目順序已儲存。', 'success');
    } catch (err) {
      setStatus(err?.message || '科目順序儲存失敗。', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function refreshFromUi() {
    ensurePanel();
    const select = document.getElementById('parentQueryClassSelect');
    let id = text(select?.value);
    if (!id) {
      try {
        const settings = await window.ParentQuerySettings?.read?.();
        id = text(settings?.publicSpreadsheetId);
      } catch (_) {}
    }
    await loadForSpreadsheet(id);
  }

  document.addEventListener('change', event => {
    const select = event.target?.closest?.('#parentQueryClassSelect');
    if (select) loadForSpreadsheet(select.value);
  }, true);

  document.addEventListener('click', event => {
    const settingsBtn = event.target?.closest?.('button[data-page="settings"]');
    if (settingsBtn) setTimeout(refreshFromUi, 150);
    const saveClassBtn = event.target?.closest?.('#parentQuerySaveClassBtn');
    if (saveClassBtn) setTimeout(refreshFromUi, 800);
  }, true);

  const started = Date.now();
  const wait = () => {
    if (document.getElementById('parentQuerySettingsPanel')) {
      refreshFromUi();
      return;
    }
    if (Date.now() - started < 30000) setTimeout(wait, 200);
  };
  wait();

  window.ParentSubjectOrder = { refresh: refreshFromUi, loadForSpreadsheet };
})();
