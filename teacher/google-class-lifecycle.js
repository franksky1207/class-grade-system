// Google Drive / Sheets lifecycle actions for teacher classes.
(function () {
  const DRIVE_API = 'https://www.googleapis.com/drive/v3';
  const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
  const INDEX_SHEET_NAME = '班級索引';

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

  async function getIndexInfo() {
    if (window.classGradeSystemIndex?.id) return window.classGradeSystemIndex;
    if (!window.GoogleDriveStore?.ensureTeacherIndex) throw new Error('Google Drive 資料模組尚未載入。');
    return window.GoogleDriveStore.ensureTeacherIndex();
  }

  async function readIndexRows(indexId) {
    if (window.GoogleDriveStore?.readIndexRows) return window.GoogleDriveStore.readIndexRows(indexId);
    const range = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A2:G`);
    const res = await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${range}`);
    const data = await res.json();
    return Array.isArray(data.values) ? data.values : [];
  }

  async function rewriteIndexRows(indexId, rows) {
    const clearRange = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A2:G`);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${clearRange}:clear`, {
      method: 'POST',
      body: '{}'
    });
    if (!rows.length) return;
    const range = encodeURIComponent(`'${INDEX_SHEET_NAME}'!A2:G${rows.length + 1}`);
    await authFetch(`${SHEETS_API}/${encodeURIComponent(indexId)}/values/${range}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ majorDimension: 'ROWS', values: rows })
    });
  }

  async function setTrashed(spreadsheetId, trashed) {
    await authFetch(`${DRIVE_API}/files/${encodeURIComponent(spreadsheetId)}?fields=id,trashed`, {
      method: 'PATCH',
      body: JSON.stringify({ trashed: !!trashed })
    });
  }

  async function permanentDeleteClass(c) {
    if (!c) throw new Error('找不到要刪除的班級。');
    const spreadsheetId = String(c.spreadsheetId || '').trim();
    if (!spreadsheetId) throw new Error('這個班級缺少 Google Spreadsheet ID，無法安全永久刪除。');

    const index = await getIndexInfo();
    const rows = await readIndexRows(index.id);
    const kept = rows.filter(r => String(r?.[3] || '').trim() !== spreadsheetId);

    // 先移到 Google Drive 垃圾桶；若後續索引更新失敗，會嘗試復原檔案。
    await setTrashed(spreadsheetId, true);
    try {
      await rewriteIndexRows(index.id, kept);
    } catch (err) {
      try { await setTrashed(spreadsheetId, false); } catch (_) {}
      throw err;
    }

    return { spreadsheetId, removedIndexRows: rows.length - kept.length };
  }

  window.GoogleClassLifecycle = { permanentDeleteClass };
})();
