// Parent/student query entry settings stored in the teacher-owned index spreadsheet.
(function () {
  const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
  const SHEET_NAME = '家長查詢設定';
  const HEADERS = ['欄位', '內容'];
  const KEYS = {
    queryCode: '查詢網址代碼',
    publicSpreadsheetId: '目前公開 Spreadsheet ID',
    createdAt: '建立時間',
    updatedAt: '更新時間'
  };
  const QUERY_BASE_URL = 'https://class-grade-system.vercel.app/p/';
  const REGISTRY_URL = 'https://sphrceazgfrjtgeeikfp.supabase.co/functions/v1/parent-query-register';

  let initializing = null;
  let cached = null;
  let panelLoading = false;

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

  function text(v) { return String(v ?? '').trim(); }

  function randomQueryCode() {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  function queryUrl(code) {
    return `${QUERY_BASE_URL}${encodeURIComponent(text(code).toLowerCase())}`;
  }

  async function syncRegistry(settings) {
    const token = await window.GoogleAuth.getAccessToken();
    const response = await fetch(REGISTRY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        queryCode: text(settings?.queryCode).toLowerCase(),
        publicSpreadsheetId: text(settings?.publicSpreadsheetId)
      })
    });

    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      if (response.status === 409 && data?.error === 'query_code_taken') {
        throw new Error('這個查詢網址代碼已有人使用，請換一個。');
      }
      if (response.status === 401) throw new Error('Google 登入已逾時，請重新登入後再試。');
      throw new Error('中央查詢設定同步失敗，請稍後再試。');
    }
    return data;
  }

  async function getSheetProperties(indexId) {
    const data = await (await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}?fields=sheets.properties`)).json();
    return Array.isArray(data?.sheets) ? data.sheets.map(s => s?.properties).filter(Boolean) : [];
  }

  async function ensureSettingsSheet(indexId) {
    const props = await getSheetProperties(indexId);
    if (!props.some(p => p.title === SHEET_NAME)) {
      await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME, gridProperties: { frozenRowCount: 1 } } } }] })
      });
    }
  }

  async function readRows(indexId) {
    const range = encodeURIComponent(`'${SHEET_NAME}'!A1:B5`);
    const data = await (await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${range}`)).json();
    return Array.isArray(data.values) ? data.values : [];
  }

  function parseRows(rows) {
    const map = new Map();
    for (const row of rows.slice(1)) {
      const key = text(row?.[0]);
      if (key) map.set(key, text(row?.[1]));
    }
    return {
      queryCode: map.get(KEYS.queryCode) || '',
      publicSpreadsheetId: map.get(KEYS.publicSpreadsheetId) || '',
      createdAt: map.get(KEYS.createdAt) || '',
      updatedAt: map.get(KEYS.updatedAt) || ''
    };
  }

  async function writeSettings(indexId, settings) {
    const now = new Date().toISOString();
    const values = [
      HEADERS,
      [KEYS.queryCode, settings.queryCode],
      [KEYS.publicSpreadsheetId, settings.publicSpreadsheetId || ''],
      [KEYS.createdAt, settings.createdAt || now],
      [KEYS.updatedAt, settings.updatedAt || now]
    ];
    const range = encodeURIComponent(`'${SHEET_NAME}'!A1:B5`);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${range}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ majorDimension: 'ROWS', values })
    });
    return parseRows(values);
  }

  async function ensure(indexId) {
    const id = text(indexId || window.classGradeSystemIndex?.id);
    if (!id) throw new Error('找不到班級索引 Spreadsheet ID。');
    if (initializing) return initializing;

    initializing = (async () => {
      await ensureSettingsSheet(id);
      const rows = await readRows(id);
      const current = parseRows(rows);
      const now = new Date().toISOString();
      const needsWrite =
        text(rows?.[0]?.[0]) !== HEADERS[0] ||
        text(rows?.[0]?.[1]) !== HEADERS[1] ||
        !current.queryCode ||
        !current.createdAt ||
        !current.updatedAt;

      cached = needsWrite ? await writeSettings(id, {
        queryCode: current.queryCode || randomQueryCode(),
        publicSpreadsheetId: current.publicSpreadsheetId,
        createdAt: current.createdAt || now,
        updatedAt: current.updatedAt || now
      }) : current;

      window.parentQuerySettings = { ...cached };
      return { ...cached };
    })();

    try { return await initializing; }
    finally { initializing = null; }
  }

  async function read() {
    const id = text(window.classGradeSystemIndex?.id);
    if (!id) throw new Error('找不到班級索引 Spreadsheet ID。');
    await ensureSettingsSheet(id);
    cached = parseRows(await readRows(id));
    window.parentQuerySettings = { ...cached };
    return { ...cached };
  }

  async function update(changes = {}) {
    const id = text(window.classGradeSystemIndex?.id);
    if (!id) throw new Error('找不到班級索引 Spreadsheet ID。');
    const current = await ensure(id);
    const next = { ...current };

    if (Object.prototype.hasOwnProperty.call(changes, 'queryCode')) {
      const code = text(changes.queryCode).toLowerCase();
      if (!/^[a-z0-9-]{4,32}$/.test(code)) throw new Error('查詢網址代碼需為 4～32 位英文、數字或連字號。');
      next.queryCode = code;
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'publicSpreadsheetId')) {
      next.publicSpreadsheetId = text(changes.publicSpreadsheetId);
    }

    next.updatedAt = new Date().toISOString();
    await syncRegistry(next);
    cached = await writeSettings(id, next);
    window.parentQuerySettings = { ...cached };
    return { ...cached };
  }

  function getClasses() {
    try {
      if (typeof app === 'undefined' || !Array.isArray(app.classes)) return [];
      return app.classes.filter(c => text(c?.spreadsheetId));
    } catch (_) {
      return [];
    }
  }

  function classLabel(c) {
    const term = text(c?.term) === '1' ? '第1學期' : text(c?.term) === '2' ? '第2學期' : `第${text(c?.term)}學期`;
    return `${text(c?.name)}｜${text(c?.year)}學年度 ${term}${c?.archived ? '（已封存）' : ''}`;
  }

  function publicClassLabel(spreadsheetId) {
    if (!spreadsheetId) return '尚未公開任何班級';
    const hit = getClasses().find(c => text(c.spreadsheetId) === text(spreadsheetId));
    return hit ? classLabel(hit) : '目前公開班級資料尚未載入';
  }

  function setPanelStatus(message, tone = '') {
    const el = document.getElementById('parentQueryPanelStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = tone === 'error' ? '#b91c1c' : tone === 'success' ? '#047857' : '#6b7280';
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    if (!ok) throw new Error('瀏覽器不允許自動複製。');
  }

  function ensurePanel() {
    const settingsPage = document.getElementById('settings');
    if (!settingsPage) return null;
    let panel = document.getElementById('parentQuerySettingsPanel');
    if (panel) return panel;

    const host = settingsPage.querySelector(':scope > .card.pad') || settingsPage;
    panel = document.createElement('div');
    panel.id = 'parentQuerySettingsPanel';
    panel.className = 'card pad';
    panel.style.marginTop = '14px';
    panel.innerHTML = `
      <div class="head">
        <div>
          <h3 style="margin:0">家長查詢設定</h3>
          <div class="small" style="margin-top:4px">教師端目前使用的班級與家長目前公開的班級互不連動。</div>
        </div>
      </div>

      <div class="subpanel rose" style="margin-bottom:12px">
        <div class="small" style="margin-bottom:5px">目前家長查詢網址</div>
        <div id="parentQueryUrlText" style="font-weight:800;word-break:break-all">載入中……</div>
        <div class="actions" style="margin-top:10px">
          <button class="btn" id="parentQueryCopyBtn" type="button">複製網址</button>
        </div>
        <div class="small" style="margin-top:8px">家長查詢網站完成後，此網址才會正式開放登入。</div>
      </div>

      <div class="subpanel" style="margin-bottom:12px">
        <div class="small">目前公開班級</div>
        <div id="parentQueryPublicClassText" style="font-weight:800;margin-top:4px">載入中……</div>
        <label style="display:block;margin-top:12px">更改公開班級
          <select class="field" id="parentQueryClassSelect">
            <option value="">不公開任何班級</option>
          </select>
        </label>
        <button class="btn primary" id="parentQuerySaveClassBtn" type="button" style="margin-top:10px">儲存公開設定</button>
      </div>

      <div class="subpanel">
        <label>查詢網址代碼
          <input class="field" id="parentQueryCodeInput" type="text" maxlength="32" autocomplete="off" spellcheck="false" />
        </label>
        <div class="small" style="margin-top:6px">4～32 位英文、數字或連字號。修改後舊網址代碼將不再使用。</div>
        <button class="btn" id="parentQuerySaveCodeBtn" type="button" style="margin-top:10px">修改網址代碼</button>
      </div>

      <div id="parentQueryPanelStatus" class="small" style="margin-top:10px"></div>
    `;
    host.appendChild(panel);

    panel.querySelector('#parentQueryCopyBtn')?.addEventListener('click', async () => {
      const code = text(document.getElementById('parentQueryCodeInput')?.value || cached?.queryCode);
      if (!code) return;
      try {
        await copyText(queryUrl(code));
        setPanelStatus('查詢網址已複製。', 'success');
      } catch (err) {
        setPanelStatus(err?.message || '無法複製網址。', 'error');
      }
    });

    panel.querySelector('#parentQuerySaveClassBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('parentQuerySaveClassBtn');
      const select = document.getElementById('parentQueryClassSelect');
      if (!btn || !select) return;
      btn.disabled = true;
      setPanelStatus('正在儲存公開班級……');
      try {
        const saved = await update({ publicSpreadsheetId: select.value });
        renderPanel(saved);
        setPanelStatus('公開班級已儲存。', 'success');
      } catch (err) {
        setPanelStatus(err?.message || '公開班級儲存失敗。', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    panel.querySelector('#parentQuerySaveCodeBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('parentQuerySaveCodeBtn');
      const input = document.getElementById('parentQueryCodeInput');
      if (!btn || !input) return;
      btn.disabled = true;
      setPanelStatus('正在修改網址代碼……');
      try {
        const saved = await update({ queryCode: input.value });
        renderPanel(saved);
        setPanelStatus('網址代碼已修改。', 'success');
      } catch (err) {
        setPanelStatus(err?.message || '網址代碼修改失敗。', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    return panel;
  }

  function renderPanel(settings = cached) {
    if (!settings) return;
    ensurePanel();
    const urlEl = document.getElementById('parentQueryUrlText');
    const codeInput = document.getElementById('parentQueryCodeInput');
    const classText = document.getElementById('parentQueryPublicClassText');
    const select = document.getElementById('parentQueryClassSelect');

    if (urlEl) urlEl.textContent = queryUrl(settings.queryCode);
    if (codeInput && document.activeElement !== codeInput) codeInput.value = settings.queryCode || '';
    if (classText) classText.textContent = publicClassLabel(settings.publicSpreadsheetId);

    if (select) {
      const previous = settings.publicSpreadsheetId || '';
      select.innerHTML = '<option value="">不公開任何班級</option>';
      getClasses().forEach(c => {
        const option = document.createElement('option');
        option.value = text(c.spreadsheetId);
        option.textContent = classLabel(c);
        select.appendChild(option);
      });
      select.value = previous;
      if (previous && select.value !== previous) {
        const option = document.createElement('option');
        option.value = previous;
        option.textContent = '目前公開班級（資料尚未載入）';
        select.appendChild(option);
        select.value = previous;
      }
    }
  }

  async function refreshPanel() {
    if (panelLoading || !window.GoogleAuth?.isSignedIn() || !window.classGradeSystemIndex?.id) return;
    panelLoading = true;
    ensurePanel();
    setPanelStatus('正在載入家長查詢設定……');
    try {
      const settings = await read();
      renderPanel(settings);
      setPanelStatus('');
    } catch (err) {
      setPanelStatus(err?.message || '家長查詢設定載入失敗。', 'error');
    } finally {
      panelLoading = false;
    }
  }

  function waitForIndexAfterLogin() {
    const started = Date.now();
    const check = async () => {
      if (window.classGradeSystemIndex?.id && window.GoogleAuth?.isSignedIn()) {
        try {
          await ensure(window.classGradeSystemIndex.id);
          try { await syncRegistry(cached); }
          catch (registryErr) { console.error('中央家長查詢登記失敗：', registryErr); }
          renderPanel(cached);
        } catch (err) {
          console.error('家長查詢設定初始化失敗：', err);
        }
        return;
      }
      if (Date.now() - started < 30000) setTimeout(check, 100);
    };
    check();
  }

  document.addEventListener('click', event => {
    const loginBtn = event.target?.closest?.('#loginBtn');
    if (loginBtn) {
      setTimeout(waitForIndexAfterLogin, 0);
      return;
    }
    const settingsBtn = event.target?.closest?.('button[data-page="settings"]');
    if (settingsBtn) setTimeout(refreshPanel, 0);
  }, true);

  if (window.classGradeSystemIndex?.id && window.GoogleAuth?.isSignedIn()) waitForIndexAfterLogin();

  window.ParentQuerySettings = {
    ensure,
    read,
    update,
    refreshPanel,
    syncRegistry,
    queryUrl,
    sheetName: SHEET_NAME
  };
})();
