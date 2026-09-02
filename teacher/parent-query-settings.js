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

  let initializing = null;
  let cached = null;

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
    cached = await writeSettings(id, next);
    window.parentQuerySettings = { ...cached };
    return { ...cached };
  }

  function waitForIndexAfterLogin() {
    const started = Date.now();
    const check = async () => {
      if (window.classGradeSystemIndex?.id && window.GoogleAuth?.isSignedIn()) {
        try { await ensure(window.classGradeSystemIndex.id); }
        catch (err) { console.error('家長查詢設定初始化失敗：', err); }
        return;
      }
      if (Date.now() - started < 30000) setTimeout(check, 100);
    };
    check();
  }

  document.addEventListener('click', event => {
    const btn = event.target?.closest?.('#loginBtn');
    if (btn) setTimeout(waitForIndexAfterLogin, 0);
  }, true);

  if (window.classGradeSystemIndex?.id && window.GoogleAuth?.isSignedIn()) waitForIndexAfterLogin();

  window.ParentQuerySettings = { ensure, read, update, sheetName: SHEET_NAME };
})();
